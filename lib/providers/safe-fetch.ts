import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import type { OutgoingHttpHeaders } from 'node:http'
import { BlockList, isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'

import type { SourceReference } from '../domain'
import { geminiRequestBody } from './gemini'
import { isAllowedRedirect, upstreamUrl } from './urls'

const responseLimit = 5 * 1024 * 1024
const timeoutMs = 15_000
const reserved = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const)
  reserved.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20]
] as const)
  reserved.addSubnet(address, prefix, 'ipv6')
const globalIpv6 = new BlockList()
globalIpv6.addSubnet('2000::', 3, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !reserved.check(address, 'ipv4')
  if (family === 6)
    return globalIpv6.check(address, 'ipv6') && !reserved.check(address, 'ipv6')
  return false
}

export type UpstreamResponse = {
  status: number
  contentType: string
  challenged: boolean
  body: string
  redirected?: boolean
}

export async function readBoundedBody(
  stream: Readable,
  limit = responseLimit
): Promise<string> {
  return (await readBoundedBytes(stream, limit)).toString('utf8')
}

export async function readBoundedBytes(
  stream: Readable,
  limit = responseLimit
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as string)
    length += chunk.byteLength
    if (length > limit) {
      stream.destroy()
      throw new Error(
        `The provider response exceeds the supported ${limit / 1024 / 1024} MiB limit.`
      )
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function fetchPublicJson(
  source: SourceReference
): Promise<UpstreamResponse> {
  const initial = upstreamUrl(source)
  const response = await fetchPublicResource(
    initial,
    (next, current) =>
      source.provider !== 'gemini' && isAllowedRedirect(next, source, current),
    source.provider === 'gemini'
      ? { body: geminiRequestBody(source.shareId) }
      : {}
  )
  return { ...response, body: response.body.toString('utf8') }
}

/** Validate and pin DNS on every hop for bounded anonymous downloads. */
export async function fetchPublicResource(
  initial: URL,
  allowRedirect: (next: URL, current: URL) => boolean,
  options: {
    limit?: number
    signal?: AbortSignal
    accept?: string
    body?: string
  } = {}
): Promise<Omit<UpstreamResponse, 'body'> & { body: Buffer }> {
  const signal = options.signal ?? AbortSignal.timeout(timeoutMs)
  const limit = options.limit ?? responseLimit
  let url = initial
  for (let hop = 0; hop <= 2; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      throw new Error('The provider returned an unsupported resource URL.')
    signal.throwIfAborted()
    // Bind the socket to a validated result, eliminating a second DNS lookup and rebinding gap.
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new Error('The provider request timed out.')),
          { once: true }
        )
      )
    ])
    if (
      !addresses.length ||
      addresses.some((entry) => !isPublicAddress(entry.address))
    ) {
      throw new Error(
        'The provider resolved to an unsupported network address.'
      )
    }
    signal.throwIfAborted()
    const address =
      addresses.find((entry) => entry.family === 4) ?? addresses[0]!
    const headers: OutgoingHttpHeaders = {
      'user-agent': 'ConversationSharing/0.1 (anonymous public-share reader)',
      accept: options.accept ?? 'application/json',
      'accept-encoding': 'gzip, deflate, br'
    }
    if (options.body) {
      headers['content-type'] = 'application/x-www-form-urlencoded'
      headers['content-length'] = Buffer.byteLength(options.body)
    }
    const response = await new Promise<{
      result?: Omit<UpstreamResponse, 'body'> & { body: Buffer }
      redirect?: string
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: options.body ? 'POST' : 'GET',
          signal,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers
        },
        (incoming) => {
          const status = incoming.statusCode ?? 0
          if ([301, 302, 303, 307, 308].includes(status)) {
            const redirect = incoming.headers.location
            incoming.destroy()
            if (!redirect)
              reject(new Error('The provider returned an invalid redirect.'))
            else resolve({ redirect })
            return
          }
          let wireBytes = 0
          incoming.on('data', (chunk: Buffer) => {
            wireBytes += chunk.byteLength
            if (wireBytes > limit)
              incoming.destroy(
                new Error(
                  `The provider response exceeds the supported ${limit / 1024 / 1024} MiB limit.`
                )
              )
          })
          let body: Readable = incoming
          const encoding = incoming.headers['content-encoding']
          if (encoding === 'gzip') body = incoming.pipe(createGunzip())
          else if (encoding === 'deflate') body = incoming.pipe(createInflate())
          else if (encoding === 'br')
            body = incoming.pipe(createBrotliDecompress())
          else if (encoding && encoding !== 'identity') {
            incoming.destroy()
            reject(
              new Error(
                'The provider returned an unsupported response encoding.'
              )
            )
            return
          }
          incoming.on('error', (error) => body.destroy(error))
          void readBoundedBytes(body, limit).then(
            (text) => {
              resolve({
                result: {
                  status,
                  body: text,
                  redirected: url.href !== initial.href,
                  contentType: incoming.headers['content-type'] ?? '',
                  challenged: incoming.headers['cf-mitigated'] === 'challenge'
                }
              })
            },
            (err: unknown) => {
              incoming.destroy()
              reject(err)
            }
          )
        }
      )
      req.on('error', reject)
      req.end(options.body)
    })
    if (response.result) return response.result
    const next = new URL(response.redirect!, url)
    if (!allowRedirect(next, url))
      throw new Error(
        'The provider redirected outside its supported public endpoint.'
      )
    url = next
  }
  throw new Error('The provider returned too many redirects.')
}

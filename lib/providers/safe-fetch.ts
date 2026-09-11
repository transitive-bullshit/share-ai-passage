import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'

import type { SourceReference } from '../domain'
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
  const chunks: Buffer[] = []
  let length = 0
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as string)
    length += chunk.byteLength
    if (length > limit) {
      stream.destroy()
      throw new Error(
        'The provider response exceeds the supported 5 MiB limit.'
      )
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function fetchPublicJson(
  source: SourceReference
): Promise<UpstreamResponse> {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = upstreamUrl(source)
  for (let hop = 0; hop <= 2; hop++) {
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
    const response = await new Promise<{
      result?: UpstreamResponse
      redirect?: string
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          signal,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            'user-agent':
              'ConversationSharing/0.1 (anonymous public-share reader)',
            accept: 'application/json',
            'accept-encoding': 'gzip, deflate, br'
          }
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
            if (wireBytes > responseLimit)
              incoming.destroy(
                new Error(
                  'The provider response exceeds the supported 5 MiB limit.'
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
          void readBoundedBody(body).then(
            (text) => {
              resolve({
                result: {
                  status,
                  body: text,
                  redirected: url.href !== upstreamUrl(source).href,
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
      req.end()
    })
    if (response.result) return response.result
    const next = new URL(response.redirect!, url)
    if (!isAllowedRedirect(next, source, url))
      throw new Error(
        'The provider redirected outside its supported public endpoint.'
      )
    url = next
  }
  throw new Error('The provider returned too many redirects.')
}

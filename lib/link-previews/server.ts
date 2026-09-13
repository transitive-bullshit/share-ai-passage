import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

import { isPublicAddress } from '@/lib/providers/safe-fetch'
import { createPreviewCache } from './cache'
import { extractLinkPreviewMetadata, previewRefresh } from './metadata'
import type { LinkPreviewResult } from './types'
import { previewPageUrl, publicPreviewUrl } from './urls'

async function fetchPage(url: URL, signal: AbortSignal) {
  // Pin the validated DNS result to the socket, including every redirect hop.
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    void lookup(url.hostname, { all: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
  signal.throwIfAborted()
  if (
    !addresses.length ||
    addresses.some((entry) => !isPublicAddress(entry.address))
  )
    throw new Error('Non-public destination')
  const address = addresses.find((entry) => entry.family === 4) ?? addresses[0]!
  return new Promise<{ html?: string; redirect?: string }>(
    (resolve, reject) => {
      const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        url,
        {
          signal,
          family: address.family,
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            accept: 'text/html, application/xhtml+xml',
            'accept-encoding': 'identity',
            'user-agent': 'Passage/1.0 (public link preview)'
          }
        },
        (response) => {
          if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
            const redirect = response.headers.location
            response.destroy()
            if (redirect) resolve({ redirect })
            else reject(new Error('Missing redirect'))
            return
          }
          if (
            response.statusCode !== 200 ||
            !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(
              response.headers['content-type'] ?? ''
            ) ||
            ![undefined, 'identity'].includes(
              response.headers['content-encoding']
            )
          ) {
            response.destroy()
            reject(new Error('Unsupported page'))
            return
          }
          const chunks: Buffer[] = []
          let bytes = 0
          response.on('data', (chunk: Buffer) => {
            const remaining = 512 * 1024 - bytes
            chunks.push(chunk.subarray(0, remaining))
            bytes += Math.min(chunk.length, remaining)
            if (bytes >= 512 * 1024) {
              resolve({ html: Buffer.concat(chunks).toString('utf8') })
              response.destroy()
            }
          })
          response.on('end', () =>
            resolve({ html: Buffer.concat(chunks).toString('utf8') })
          )
          response.on('error', reject)
        }
      )
      req.on('error', reject)
      req.end()
    }
  )
}

export async function acquirePreview(
  input: string,
  callerSignal: AbortSignal
): Promise<LinkPreviewResult> {
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(5000)])
  let url = previewPageUrl(input)
  const visited = new Set<string>()
  for (let hop = 0; url && hop <= 5; hop++) {
    signal.throwIfAborted()
    if (visited.has(url.href)) break
    visited.add(url.href)
    const page = await fetchPage(url, signal)
    const refresh = page.html ? previewRefresh(page.html, url.href) : undefined
    if (page.redirect || refresh) {
      const next = previewPageUrl(
        page.redirect ?? refresh!.url,
        page.redirect ? url.href : refresh!.base
      )
      if (!next || (url.protocol === 'https:' && next.protocol !== 'https:'))
        break
      url = next
      continue
    }
    const metadata = extractLinkPreviewMetadata(page.html ?? '', url.href)
    return {
      ok: true,
      metadata: {
        requestedUrl: input,
        url: url.href,
        title: metadata.title,
        description: metadata.description,
        siteName: metadata.siteName,
        image: metadata.images.find(
          (image) => publicPreviewUrl(image.url)?.protocol === 'https:'
        )?.url,
        favicon: metadata.favicons.find(
          (icon) => publicPreviewUrl(icon)?.protocol === 'https:'
        )
      }
    }
  }
  return { ok: false, reason: 'unavailable' }
}

export const resolveServerPreview = createPreviewCache(acquirePreview)

import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

import { appSecret, appUrl } from './config'
import { AppError } from './errors'

export const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff'
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (origin !== appUrl()) {
    throw new AppError('Please submit this request from the app.', 403)
  }
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new AppError('Cross-site requests are not supported.', 403)
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new AppError('Send JSON with this request.', 415)
  }
}

export async function readJson(
  request: Request,
  maxBytes = 16 * 1024
): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > maxBytes) throw new AppError('This request is too large.', 413)
  if (!request.body) throw new AppError('This request is empty.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new AppError('This request is too large.', 413)
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('This request contains invalid JSON.')
  } finally {
    reader.releaseLock()
  }
}

/** Vercel overwrites its own header; self-hosted proxies require explicit trust. */
export function clientKey(request: Request) {
  const proxy =
    process.env.TRUST_PROXY?.trim() ||
    (process.env.VERCEL === '1' ? 'vercel' : 'none')
  let address = 'shared-untrusted-client'
  if (proxy === 'vercel' && process.env.VERCEL === '1') {
    address =
      request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
      address
  } else if (proxy === 'single') {
    address = request.headers.get('x-real-ip')?.trim() || address
  }
  if (!isIP(address)) address = 'shared-untrusted-client'
  return createHmac('sha256', appSecret()).update(address).digest('hex')
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    const headers = new Headers(privateHeaders)
    if (error.retryAfter) headers.set('Retry-After', String(error.retryAfter))
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers
      }
    )
  }
  // Do not log provider bodies, submitted URLs, transcript text, or model inputs.
  console.error(
    'Request failed',
    error instanceof Error ? error.name : 'UnknownError'
  )
  return Response.json(
    { error: 'Something went wrong. Please try again in a moment.' },
    { status: 500, headers: privateHeaders }
  )
}

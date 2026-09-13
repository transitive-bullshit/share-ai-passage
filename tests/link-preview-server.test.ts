import type { LookupAddress } from 'node:dns'
import type { RequestOptions } from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { acquirePreview } from '@/lib/link-previews/server'
import { extractLinkPreviewMetadata } from '@/lib/link-previews/metadata'
import { previewPageUrl } from '@/lib/link-previews/urls'

const { lookup, request } = vi.hoisted(() => ({
  lookup: vi.fn<() => Promise<LookupAddress[]>>(),
  request:
    vi.fn<
      (
        url: URL,
        options: RequestOptions,
        callback: (response: Readable) => void
      ) => EventEmitter & { end(): void }
    >()
}))
vi.mock('node:dns/promises', () => ({ lookup }))
vi.mock('node:http', () => ({ request }))
vi.mock('node:https', () => ({ request }))
afterEach(() => vi.resetAllMocks())

function serve(
  pages: { status?: number; headers?: Record<string, string>; html?: string }[]
) {
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  request.mockImplementation((_url, _options, callback) => {
    const page = pages.shift()!
    const req = new EventEmitter()
    return Object.assign(req, {
      end: () => {
        const response = Object.assign(
          Readable.from([Buffer.from(page.html ?? '')]),
          {
            statusCode: page.status ?? 200,
            headers: page.headers ?? { 'content-type': 'text/html' }
          }
        )
        callback(response)
      }
    })
  })
}

it('reads inert head metadata with entity decoding and relative image URLs', () => {
  const result = extractLinkPreviewMetadata(
    `<head><title>Fallback</title><meta property="og:title" content="A &amp; B"><meta name="description" content="Description"><meta property="og:image" content="/card.jpg"></head><body><meta property="og:title" content="Wrong"></body>`,
    'https://example.org/article'
  )
  expect(result.title).toBe('A & B')
  expect(result.description).toBe('Description')
  expect(result.images[0]?.url).toBe('https://example.org/card.jpg')
})

it('normalizes tracking without conflating content IDs and rejects private/unsupported URLs', () => {
  expect(
    previewPageUrl('https://example.org/?id=3&utm_source=test#section')?.href
  ).toBe('https://example.org/?id=3')
  for (const url of [
    'https://127.0.0.1/',
    'http://[::1]/',
    'https://user:pass@example.org',
    'https://example.org/?token=secret'
  ])
    expect(previewPageUrl(url)).toBeUndefined()
})

it('rejects private DNS results before opening a socket', async () => {
  lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
  await expect(
    acquirePreview('https://example.org', new AbortController().signal)
  ).rejects.toThrow('Non-public')
  expect(request).not.toHaveBeenCalled()
})

it('checks redirect DNS again and pins the selected address to the socket', async () => {
  serve([{ status: 302, headers: { location: 'https://second.org/article' } }])
  lookup
    .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    .mockResolvedValueOnce([{ address: '10.0.0.1', family: 4 }])
  await expect(
    acquirePreview('https://example.org', new AbortController().signal)
  ).rejects.toThrow('Non-public')
  expect(request).toHaveBeenCalledTimes(1)
  const pinned = vi.fn<() => void>()
  request.mock.calls[0]![1].lookup!('example.org', {}, pinned)
  expect(pinned).toHaveBeenCalledWith(null, '93.184.216.34', 4)
})

it('follows immediate HTML refresh and returns final metadata, but rejects HTTPS downgrade', async () => {
  serve([
    {
      html: '<head><meta http-equiv="refresh" content="0;url=https://second.org/article"></head>'
    },
    { html: '<title>Final page</title>' }
  ])
  const result = await acquirePreview(
    'https://example.org',
    new AbortController().signal
  )
  expect(result).toMatchObject({
    ok: true,
    metadata: { title: 'Final page', url: 'https://second.org/article' }
  })
  serve([{ status: 302, headers: { location: 'http://second.org/' } }])
  expect(
    await acquirePreview('https://example.org', new AbortController().signal)
  ).toEqual({ ok: false, reason: 'unavailable' })
})

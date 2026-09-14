import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let images: PreviewImage[]
const fetch = vi.fn<typeof globalThis.fetch>()
class PreviewImage {
  src = ''
  referrerPolicy = ''
  decoding = ''
  fetchPriority = ''
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  decode = vi.fn<() => Promise<void>>().mockResolvedValue()
  constructor() {
    images.push(this)
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  images = []
  vi.stubGlobal('Image', PreviewImage)
  vi.stubGlobal('fetch', fetch)
  fetch.mockImplementation(async () =>
    Response.json({
      ok: true,
      metadata: {
        requestedUrl: 'https://example.org/',
        url: 'https://example.org/',
        title: 'Article',
        image: 'https://example.org/card.jpg',
        favicon: 'https://example.org/favicon.png'
      }
    })
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetch.mockReset()
})

it('warms and decodes social artwork then the favicon and reuses metadata on hover', async () => {
  const { resolveClientPreview } = await import('@/lib/link-previews/client')
  const url = 'https://example.org/'
  const signal = new AbortController().signal
  const metadata = await resolveClientPreview(url, signal, {
    phase: 'metadata',
    priority: 'background'
  })
  expect(metadata).toMatchObject({ ok: true, assetsPending: true })
  expect(images).toHaveLength(0)
  const complete = resolveClientPreview(url, signal, {
    phase: 'complete',
    priority: 'background'
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(images).toHaveLength(1)
  expect(images[0]).toMatchObject({
    src: 'https://example.org/card.jpg',
    referrerPolicy: 'no-referrer',
    fetchPriority: 'low'
  })
  let decoded!: () => void
  images[0]!.decode.mockImplementation(
    () =>
      new Promise((resolve) => {
        decoded = resolve
      })
  )
  images[0]!.onload!()
  await vi.advanceTimersByTimeAsync(0)
  expect(images).toHaveLength(1)
  decoded()
  await vi.advanceTimersByTimeAsync(0)
  expect(images[0]!.src).toBe('https://example.org/card.jpg')
  expect(images[1]!.src).toBe('https://example.org/favicon.png')
  images[1]!.onload!()
  expect(await complete).toMatchObject({ ok: true, assetsPending: false })
  expect(images[1]!.decode).toHaveBeenCalledOnce()
  expect(
    await resolveClientPreview(url, signal, { phase: 'metadata' })
  ).toMatchObject({ ok: true, metadata: { title: 'Article' } })
  await resolveClientPreview(url, signal, { phase: 'complete' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(images).toHaveLength(2)
  expect(fetch.mock.calls[0]![1]).toMatchObject({ priority: 'low' })
})

it('keeps cached text when artwork fails and cancels abandoned image requests', async () => {
  const { resolveClientPreview } = await import('@/lib/link-previews/client')
  const controller = new AbortController()
  const complete = resolveClientPreview(
    'https://example.org/',
    controller.signal,
    { phase: 'complete', priority: 'background' }
  ).catch(() => 'cancelled')
  await vi.advanceTimersByTimeAsync(0)
  images[0]!.onerror!()
  await vi.advanceTimersByTimeAsync(0)
  expect(images[0]!.src).toBe('')
  expect(images).toHaveLength(2)
  controller.abort()
  expect(await complete).toBe('cancelled')
  expect(images[1]!.src).toBe('')
  const hover = await resolveClientPreview(
    'https://example.org/',
    new AbortController().signal,
    { phase: 'metadata' }
  )
  expect(hover).toMatchObject({ ok: true, metadata: { title: 'Article' } })
  expect(fetch).toHaveBeenCalledTimes(1)
})

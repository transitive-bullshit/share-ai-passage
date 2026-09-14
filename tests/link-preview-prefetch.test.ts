// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LinkPreviewResult } from '@/lib/link-previews/types'
import { createLinkPreviewPrefetch } from '@/lib/link-previews/prefetch'

let scheduler: ReturnType<typeof createLinkPreviewPrefetch>
let available = true
let visibility: DocumentVisibilityState = 'visible'
let online = true
let connection: EventTarget & { saveData: boolean; effectiveType: string }
const resolve =
  vi.fn<Parameters<typeof createLinkPreviewPrefetch>[0]['resolve']>()

function link(path = 'article') {
  const anchor = document.createElement('a')
  anchor.href = `https://example.org/${path}`
  document.body.append(anchor)
  return anchor
}
function update(...anchors: HTMLAnchorElement[]) {
  scheduler.update(
    new Map(anchors.map((anchor) => [anchor, { url: anchor.href }]))
  )
}
function success(url: string, assetsPending = false): LinkPreviewResult {
  return {
    ok: true,
    metadata: { requestedUrl: url, url, title: 'Article' },
    assetsPending
  }
}
function create() {
  return createLinkPreviewPrefetch({
    window,
    document,
    root: document,
    resolve,
    isInternalUrl: (url) => url.hostname === 'internal.example.org',
    available: () => available
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  available = true
  visibility = 'visible'
  online = true
  connection = Object.assign(new EventTarget(), {
    saveData: false,
    effectiveType: '4g'
  })
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility
  )
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete')
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection
  })
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 10 }),
      1
    )
  )
  vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id))
  resolve.mockImplementation(async (url) => success(url))
  scheduler = create()
})
afterEach(() => {
  scheduler.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resolve.mockReset()
  Reflect.deleteProperty(navigator, 'connection')
  document.body.innerHTML = ''
})

it('warms the entire chat including collapsed links, deduplicates, and stops when finished', async () => {
  const anchors = Array.from({ length: 80 }, (_, i) => link(String(i)))
  const collapsed = document.createElement('details')
  document.body.append(collapsed)
  collapsed.append(...anchors)
  update(...anchors, link('0'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(80)
  expect(vi.getTimerCount()).toBe(0)
  document.dispatchEvent(new Event('scroll'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(80)
  expect(vi.getTimerCount()).toBe(0)
})

it('allows four requests and warms ready artwork before admitting another page', async () => {
  const anchors = Array.from({ length: 8 }, (_, i) => link(String(i)))
  const pending: Array<{
    url: string
    phase: string
    finish(result: LinkPreviewResult): void
  }> = []
  resolve.mockImplementation(
    (url, _signal, options) =>
      new Promise((finish) => {
        pending.push({ url, phase: options.phase, finish })
      })
  )
  update(...anchors)
  await vi.advanceTimersByTimeAsync(151)
  expect(resolve).toHaveBeenCalledTimes(4)
  pending[0]!.finish(success(anchors[0]!.href, true))
  await vi.advanceTimersByTimeAsync(10)
  expect(resolve).toHaveBeenCalledTimes(5)
  expect(pending[4]).toMatchObject({ url: anchors[0]!.href, phase: 'complete' })
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(5)
  pending[4]!.finish(success(anchors[0]!.href))
  await vi.advanceTimersByTimeAsync(10)
  expect(pending[5]).toMatchObject({ url: anchors[4]!.href, phase: 'metadata' })
})

it('waits for page load, input quiet, and an idle callback', async () => {
  scheduler.dispose()
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
  scheduler = create()
  update(link())
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(100)
  document.dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(150)
  expect(resolve).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(resolve).toHaveBeenCalledTimes(1)
})

it('falls back to quiet timers when idle callbacks are unavailable', async () => {
  vi.stubGlobal('requestIdleCallback', undefined)
  update(link())
  await vi.advanceTimersByTimeAsync(150)
  expect(resolve).toHaveBeenCalledTimes(1)
})

it.each(['coarse', 'save-data', 'slow-2g', '2g', 'offline', 'hidden'] as const)(
  'does not speculate while %s',
  async (condition) => {
    if (condition === 'coarse') available = false
    if (condition === 'save-data') connection.saveData = true
    if (condition === '2g' || condition === 'slow-2g')
      connection.effectiveType = condition
    if (condition === 'offline') online = false
    if (condition === 'hidden') visibility = 'hidden'
    update(link())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(resolve).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('does not cancel when scrolling away but cancels all four jobs when the tab hides', async () => {
  resolve.mockImplementation(() => new Promise(() => {}))
  update(...Array.from({ length: 6 }, (_, i) => link(String(i))))
  await vi.advanceTimersByTimeAsync(200)
  document.dispatchEvent(new Event('scroll'))
  expect(resolve.mock.calls.every(([, signal]) => !signal.aborted)).toBe(true)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  expect(resolve.mock.calls).toHaveLength(4)
  expect(resolve.mock.calls.every(([, signal]) => signal.aborted)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves metadata across a paused asset pass and resumes without refetching the page', async () => {
  resolve.mockImplementation(async (url, signal, options) => {
    if (options.phase === 'metadata') return success(url, true)
    return new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true
      })
    )
  })
  update(link())
  await vi.advanceTimersByTimeAsync(200)
  scheduler.pause()
  await vi.advanceTimersByTimeAsync(200)
  scheduler.resume()
  await vi.advanceTimersByTimeAsync(200)
  expect(resolve.mock.calls.map(([, , options]) => options.phase)).toEqual([
    'metadata',
    'complete',
    'complete'
  ])
})

it('keeps aborted slots occupied until settlement and ignores their late metadata', async () => {
  const finishes: Array<() => void> = []
  resolve.mockImplementation(
    (url) =>
      new Promise((finish) => {
        finishes.push(() => finish(success(url, true)))
      })
  )
  update(...Array.from({ length: 4 }, (_, i) => link(String(i))))
  await vi.advanceTimersByTimeAsync(200)
  update(link('replacement'))
  await vi.advanceTimersByTimeAsync(200)
  expect(resolve).toHaveBeenCalledTimes(4)
  finishes[0]!()
  await vi.advanceTimersByTimeAsync(10)
  expect(resolve).toHaveBeenCalledTimes(5)
  expect(resolve.mock.lastCall?.[0]).toBe('https://example.org/replacement')
})

it('excludes detached or rewritten links but keeps duplicates until all sources leave', async () => {
  const first = link('same')
  const duplicate = link('same')
  const removed = link('removed')
  const rewritten = link('rewritten')
  update(first, duplicate, removed, rewritten)
  first.remove()
  removed.remove()
  rewritten.href = 'https://example.org/new'
  await vi.advanceTimersByTimeAsync(200)
  expect(resolve.mock.calls.map(([url]) => url)).toEqual([duplicate.href])
})

it('bounds busy retries and does not requeue completed attempts on updates', async () => {
  const anchor = link()
  resolve.mockResolvedValue({ ok: false, reason: 'busy' })
  update(anchor)
  await vi.advanceTimersByTimeAsync(10_000)
  update(anchor)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(resolve).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not enrich redirected internal links or unavailable pages', async () => {
  resolve
    .mockResolvedValueOnce(success('https://internal.example.org/post', true))
    .mockResolvedValueOnce({ ok: false, reason: 'unavailable' })
  update(link('internal'), link('failed'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels idle callbacks and listeners on disposal', async () => {
  update(link())
  await vi.advanceTimersByTimeAsync(150)
  scheduler.dispose()
  document.dispatchEvent(new Event('scroll'))
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

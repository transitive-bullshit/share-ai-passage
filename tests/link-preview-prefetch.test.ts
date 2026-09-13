// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LinkPreviewResult } from '@/lib/link-previews/types'
import { createLinkPreviewPrefetch } from '@/lib/link-previews/prefetch'

let scheduler: ReturnType<typeof createLinkPreviewPrefetch> | undefined
let intersect: (element: Element, visible: boolean, ratio?: number) => void
let resource: () => void
let available = true
let visibility: DocumentVisibilityState = 'visible'
let readyState: DocumentReadyState = 'complete'
let online = true
let connection: EventTarget & { saveData: boolean; effectiveType: string }
const observed = new Set<Element>()
const disconnect = vi.fn<() => void>()
const resourcesDisconnect = vi.fn<() => void>()
const resolve =
  vi.fn<Parameters<typeof createLinkPreviewPrefetch>[0]['resolve']>()

function link(path = 'article') {
  const anchor = document.createElement('a')
  anchor.href = `https://example.org/${path}`
  document.body.append(anchor)
  return anchor
}

function update(...anchors: HTMLAnchorElement[]) {
  scheduler!.update(
    new Map(anchors.map((anchor) => [anchor, { url: anchor.href }]))
  )
}

function success(url = 'https://example.org/article', assetsPending = false) {
  return {
    ok: true,
    metadata: { requestedUrl: url, url, title: 'Article' },
    assetsPending
  } satisfies LinkPreviewResult
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  observed.clear()
  available = true
  visibility = 'visible'
  readyState = 'complete'
  online = true
  connection = Object.assign(new EventTarget(), {
    saveData: false,
    effectiveType: '4g'
  })
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility
  )
  vi.spyOn(document, 'readyState', 'get').mockImplementation(() => readyState)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    get: () => connection
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: IntersectionObserverCallback,
        options: IntersectionObserverInit
      ) {
        const previous = new Map<
          Element,
          { isIntersecting: boolean; index: number }
        >()
        const thresholds = Array.isArray(options.threshold)
          ? options.threshold
          : [options.threshold ?? 0]
        intersect = (
          target,
          isIntersecting,
          intersectionRatio = isIntersecting ? 1 : 0
        ) => {
          const index = thresholds.filter(
            (threshold) => intersectionRatio >= threshold
          ).length
          const entry = previous.get(target)
          previous.set(target, { isIntersecting, index })
          if (entry?.isIntersecting === isIntersecting && entry.index === index)
            return
          callback(
            [
              {
                target,
                isIntersecting,
                intersectionRatio
              } as IntersectionObserverEntry
            ],
            this as unknown as IntersectionObserver
          )
        }
      }
      observe = (element: Element) => observed.add(element)
      unobserve = (element: Element) => observed.delete(element)
      disconnect = () => {
        observed.clear()
        disconnect()
      }
    }
  )
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(callback: PerformanceObserverCallback) {
        resource = () =>
          callback(
            { getEntries: () => [{}] } as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver
          )
      }
      observe() {}
      disconnect = resourcesDisconnect
    }
  )
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 10 }),
      1
    )
  )
  vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id))
  resolve.mockImplementation(async (url) => success(url))
  scheduler = createLinkPreviewPrefetch({
    window,
    document,
    root: document,
    resolve,
    isInternalUrl: (url) => url.hostname === 'internal.example.org',
    available: () => available
  })
})

afterEach(() => {
  scheduler?.dispose()
  scheduler = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'connection')
  document.body.innerHTML = ''
})

it('warms a visible destination before any hover after interaction and resource quiet', async () => {
  const anchor = link()
  update(anchor)
  expect(observed.has(anchor)).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).not.toHaveBeenCalled()
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(200)
  resource()
  await vi.advanceTimersByTimeAsync(200)
  document.dispatchEvent(new Event('scroll'))
  await vi.advanceTimersByTimeAsync(299)
  expect(resolve).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(10)
  expect(resolve).toHaveBeenCalledExactlyOnceWith(
    anchor.href,
    expect.any(AbortSignal),
    {
      phase: 'metadata',
      priority: 'background'
    }
  )
})

it('admits a link after it moves from touching the viewport edge to a positive intersection', async () => {
  const anchor = link()
  update(anchor)
  intersect(anchor, true, 0)
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).not.toHaveBeenCalled()
  intersect(anchor, true, 0.05)
  await vi.advanceTimersByTimeAsync(350)
  expect(resolve).toHaveBeenCalledTimes(1)
})

it.each([
  'coarse',
  'save-data',
  'slow-2g',
  '2g',
  'offline',
  'hidden',
  'loading'
] as const)('does not speculate while %s', async (condition) => {
  if (condition === 'coarse') available = false
  if (condition === 'save-data') connection.saveData = true
  if (condition === '2g' || condition === 'slow-2g')
    connection.effectiveType = condition
  if (condition === 'offline') online = false
  if (condition === 'hidden') visibility = 'hidden'
  if (condition === 'loading') {
    scheduler!.dispose()
    readyState = 'loading'
    scheduler = createLinkPreviewPrefetch({
      window,
      document,
      root: document,
      resolve,
      isInternalUrl: () => false,
      available: () => available
    })
  }
  const anchor = link()
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(resolve).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('waits for load then lets all visible metadata precede asset enrichment, with one unsettled request', async () => {
  scheduler!.dispose()
  readyState = 'loading'
  scheduler = createLinkPreviewPrefetch({
    window,
    document,
    root: document,
    resolve,
    isInternalUrl: () => false,
    available: () => available
  })
  const first = link('first')
  const second = link('second')
  update(first, second)
  intersect(first, true)
  intersect(second, true)
  let finish!: () => void
  resolve.mockImplementationOnce(
    (url) =>
      new Promise((settle) => {
        finish = () => settle(success(url, true))
      })
  )
  resolve.mockImplementation(async (url, _, request) =>
    success(url, request.phase === 'metadata')
  )
  window.dispatchEvent(new Event('load'))
  await vi.advanceTimersByTimeAsync(10_000)
  expect(resolve).toHaveBeenCalledTimes(1)
  finish()
  await vi.advanceTimersByTimeAsync(1000)
  expect(
    resolve.mock.calls.map(([url, , request]) => [url, request.phase])
  ).toEqual([
    [first.href, 'metadata'],
    [second.href, 'metadata'],
    [first.href, 'complete'],
    [second.href, 'complete']
  ])
  expect(vi.getTimerCount()).toBe(0)
})

it('does not enrich a destination resolved to an internal site', async () => {
  const anchor = link()
  resolve.mockResolvedValue(success('https://internal.example.org/post', true))
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(2000)
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('deduplicates visible elements and keeps a request until its last visible source leaves', async () => {
  const first = link()
  const duplicate = link()
  const next = link('next')
  let finish!: () => void
  resolve.mockImplementationOnce(
    (url) =>
      new Promise((settle) => {
        finish = () => settle(success(url))
      })
  )
  update(first, duplicate, next)
  intersect(first, true)
  intersect(duplicate, true)
  await vi.advanceTimersByTimeAsync(350)
  const signal = resolve.mock.lastCall![1]
  intersect(first, false)
  expect(signal.aborted).toBe(false)
  intersect(duplicate, false)
  expect(signal.aborted).toBe(true)
  intersect(next, true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(1)
  finish()
  await vi.advanceTimersByTimeAsync(350)
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(resolve.mock.lastCall?.[0]).toBe(next.href)
})

it.each([
  'recycled',
  'removed',
  'pause',
  'hidden',
  'offline',
  'save-data',
  'dispose'
] as const)(
  'aborts speculative work when its lifetime is %s and ignores late completion',
  async (reason) => {
    const anchor = link()
    let finish!: () => void
    resolve.mockImplementationOnce(
      (url) =>
        new Promise((settle) => {
          finish = () => settle(success(url, true))
        })
    )
    update(anchor)
    intersect(anchor, true)
    await vi.advanceTimersByTimeAsync(350)
    const signal = resolve.mock.lastCall![1]
    if (reason === 'recycled') {
      anchor.href = 'https://example.org/recycled'
      update(anchor)
    }
    if (reason === 'removed') update()
    if (reason === 'pause') scheduler!.pause()
    if (reason === 'hidden') {
      visibility = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    }
    if (reason === 'offline') {
      online = false
      window.dispatchEvent(new Event('offline'))
    }
    if (reason === 'save-data') {
      connection.saveData = true
      connection.dispatchEvent(new Event('change'))
    }
    if (reason === 'dispose') scheduler!.dispose()
    expect(signal.aborted).toBe(true)
    finish()
    await vi.advanceTimersByTimeAsync(2000)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('cancels quiet and idle callbacks and disconnects observers on disposal', async () => {
  const anchor = link()
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(300)
  expect(vi.getTimerCount()).toBe(1)
  scheduler!.dispose()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(resourcesDisconnect).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  document.dispatchEvent(new Event('scroll'))
  resource()
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds busy retries and retains attempted destinations without idle polling', async () => {
  const anchor = link()
  resolve.mockResolvedValue({ ok: false, reason: 'busy' })
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(resolve).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
  intersect(anchor, false)
  intersect(anchor, true)
  update(anchor)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(resolve).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('retains the backoff of eligible work when an earlier viewport source is CSS-hidden', async () => {
  const hidden = link('hidden')
  const busy = link('busy')
  hidden.style.visibility = 'hidden'
  const idle = vi.spyOn(window, 'requestIdleCallback')
  resolve.mockResolvedValue({ ok: false, reason: 'busy' })
  update(hidden, busy)
  intersect(hidden, true)
  intersect(busy, true)
  await vi.advanceTimersByTimeAsync(1250)
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(idle.mock.calls.length).toBeLessThanOrEqual(2)
  await vi.advanceTimersByTimeAsync(3000)
  expect(resolve).toHaveBeenCalledTimes(3)
  expect(idle.mock.calls.length).toBeLessThanOrEqual(6)
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds the visible URL queue even when an adapter reports many links', async () => {
  const anchors = Array.from({ length: 70 }, (_, index) => link(String(index)))
  update(...anchors)
  for (const anchor of anchors) intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(resolve).toHaveBeenCalledTimes(64)
  expect(vi.getTimerCount()).toBe(0)
})

it('evicts departed attempt history without refetching links still in the viewport', async () => {
  const anchors = Array.from({ length: 64 }, (_, index) => link(String(index)))
  update(...anchors)
  for (const anchor of anchors) intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(resolve).toHaveBeenCalledTimes(64)
  intersect(anchors.pop()!, false)
  const newcomer = link('newcomer')
  anchors.push(newcomer)
  update(...anchors)
  intersect(newcomer, true)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(resolve).toHaveBeenCalledTimes(65)
  expect(resolve.mock.lastCall?.[0]).toBe(newcomer.href)
  expect(vi.getTimerCount()).toBe(0)
})

it('expires recently attempted destinations only when new viewport activity warrants work', async () => {
  const anchor = link()
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(6 * 60_000)
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
  intersect(anchor, false)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(350)
  expect(resolve).toHaveBeenCalledTimes(2)
})

it('does not let unrelated adapter refreshes postpone otherwise quiet visible work', async () => {
  const anchor = link()
  update(anchor)
  intersect(anchor, true)
  for (let index = 0; index < 5; index++) {
    await vi.advanceTimersByTimeAsync(100)
    update(anchor)
  }
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['hidden', 'inert', 'detached', 'visibility'] as const)(
  'checks that an intersecting source is still accessible before acquisition: %s',
  async (reason) => {
    const anchor = link()
    update(anchor)
    intersect(anchor, true)
    if (reason === 'hidden') anchor.hidden = true
    if (reason === 'inert') anchor.setAttribute('inert', '')
    if (reason === 'detached') anchor.remove()
    if (reason === 'visibility') anchor.style.visibility = 'hidden'
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolve).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  }
)

it.each(['visibility', 'opacity', 'contentVisibility'] as const)(
  'reconsiders a source after ancestor %s changes without a new geometric intersection',
  async (property) => {
    const anchor = link()
    Object.defineProperty(anchor, 'checkVisibility', {
      value: undefined,
      configurable: true
    })
    const parent = document.createElement('section')
    document.body.append(parent)
    parent.append(anchor)
    parent.style[property] = property === 'opacity' ? '0' : 'hidden'
    // Happy DOM does not expose computed content-visibility yet.
    const computedStyle = window.getComputedStyle.bind(window)
    const styleSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element) => {
        const style = computedStyle(element)
        if (element === parent && property === 'contentVisibility')
          return new Proxy(style, {
            get(target, key) {
              return key === 'contentVisibility'
                ? parent.style.contentVisibility
                : Reflect.get(target, key)
            }
          })
        return style
      })
    update(anchor)
    intersect(anchor, true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolve).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    parent.style[property] = ''
    update(anchor)
    await vi.advanceTimersByTimeAsync(350)
    expect(resolve).toHaveBeenCalledTimes(1)
    styleSpy.mockRestore()
  }
)

it('yields unfinished artwork to a newly visible destination after the aborted consumer settles', async () => {
  const first = link('first')
  const second = link('second')
  let finish!: () => void
  resolve.mockImplementationOnce(async (url) => success(url, true))
  resolve.mockImplementationOnce(
    (url) =>
      new Promise((settle) => {
        finish = () => settle(success(url))
      })
  )
  update(first, second)
  intersect(first, true)
  await vi.advanceTimersByTimeAsync(650)
  expect(resolve.mock.lastCall?.[2].phase).toBe('complete')
  const signal = resolve.mock.lastCall![1]
  intersect(second, true)
  expect(signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(resolve).toHaveBeenCalledTimes(2)
  finish()
  await vi.advanceTimersByTimeAsync(650)
  expect(
    resolve.mock.calls.map(([url, , request]) => [url, request.phase])
  ).toEqual([
    [first.href, 'metadata'],
    [first.href, 'complete'],
    [second.href, 'metadata'],
    [first.href, 'complete']
  ])
})

it('restarts after visibility restoration without retaining a failed acquisition', async () => {
  const anchor = link()
  resolve.mockImplementationOnce(
    (_, signal) =>
      new Promise((settle) => {
        signal.addEventListener('abort', () =>
          settle({ ok: false, reason: 'aborted' })
        )
      })
  )
  update(anchor)
  intersect(anchor, true)
  await vi.advanceTimersByTimeAsync(350)
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(10)
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(350)
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

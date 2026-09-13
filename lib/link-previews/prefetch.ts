// Adapted from Repaint tweaks/link-previews.
import type { LinkPreviewResult } from './types'

type Phase = 'metadata' | 'complete'

interface Attempt {
  expires: number
  metadata: boolean
  assetsPending: boolean
  complete: boolean
  busyRetries: number
  retryAt: number
}

interface Source {
  url: string
  href: string | null
}

/** Speculative work uses only adapter-provided links and never mounts preview UI. */
export function createLinkPreviewPrefetch(options: {
  window: Window & typeof globalThis
  document: Document
  root: Node
  resolve(
    url: string,
    signal: AbortSignal,
    options: { phase: Phase; priority: 'background' }
  ): Promise<LinkPreviewResult>
  isInternalUrl(url: URL): boolean
  available(): boolean
}) {
  const { window, document, root } = options
  const sources = new Map<HTMLElement, Source>()
  const visible = new Map<string, Set<HTMLElement>>()
  const attempts = new Map<string, Attempt>()
  const events = new AbortController()
  const connection = (
    window.navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  let disposed = false
  let paused = false
  let loaded = document.readyState === 'complete'
  let quietUntil = Date.now() + 300
  let timer: number | undefined
  let idle: number | undefined
  let current:
    | { url: string; phase: Phase; controller: AbortController }
    | undefined

  function available() {
    return (
      !disposed &&
      !paused &&
      loaded &&
      options.available() &&
      document.visibilityState !== 'hidden' &&
      window.navigator.onLine !== false &&
      !connection?.saveData &&
      !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
    )
  }

  function cancelScheduled() {
    window.clearTimeout(timer)
    timer = undefined
    if (idle !== undefined) window.cancelIdleCallback(idle)
    idle = undefined
  }

  function live(element: HTMLElement, source: Source) {
    if (
      !element.isConnected ||
      !root.contains(element) ||
      element.getAttribute('href') !== source.href ||
      element.closest('[hidden], [aria-hidden="true"], [inert]')
    )
      return false
    if (typeof element.checkVisibility === 'function')
      return element.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true
      })
    // Older hosts lack checkVisibility. Keep the fallback bounded, and decline
    // deeply nested sources rather than expanding into an unbounded style walk.
    let node: HTMLElement | null = element
    for (
      let depth = 0;
      node && depth < 32;
      depth++, node = node.parentElement
    ) {
      const style = window.getComputedStyle(node)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0' ||
        style.contentVisibility === 'hidden'
      )
        return false
    }
    return node === null
  }

  function removeVisible(element: HTMLElement, source: Source) {
    const elements = visible.get(source.url)
    elements?.delete(element)
    if (!elements?.size) visible.delete(source.url)
    if (current?.url === source.url && !visible.has(source.url))
      current.controller.abort()
  }

  function eligible(url: string) {
    const elements = visible.get(url)
    if (!elements) return false
    for (const element of elements) {
      const source = sources.get(element)
      if (source && live(element, source)) return true
    }
    return false
  }

  function attemptFor(url: string) {
    const attempt = attempts.get(url)
    if (attempt && attempt.expires > Date.now()) return attempt
    attempts.delete(url)
    return undefined
  }

  function work(checkSources = false) {
    let next: { url: string; phase: Phase; wait: number } | undefined
    for (const phase of ['metadata', 'complete'] as const) {
      for (const url of visible.keys()) {
        const attempt = attemptFor(url)
        if (
          phase === 'metadata'
            ? attempt?.metadata
            : !attempt?.metadata || !attempt.assetsPending || attempt.complete
        )
          continue
        // Only inspect source paint while actually selecting idle work. Keep
        // geometric membership so a later snapshot can recover CSS visibility.
        if (checkSources && !eligible(url)) continue
        const wait = Math.max(0, (attempt?.retryAt ?? 0) - Date.now())
        if (!next || wait < next.wait) next = { url, phase, wait }
        if (!wait) return next
      }
      // Finish visible page metadata before spending bandwidth on artwork.
      if (next) return next
    }
    return undefined
  }

  function prioritizeMetadata() {
    if (
      current?.phase === 'complete' &&
      !current.controller.signal.aborted &&
      work(true)?.phase === 'metadata'
    )
      current.controller.abort()
  }

  function remember(url: string) {
    let attempt = attemptFor(url)
    if (attempt) return attempt
    attempt = {
      expires: Date.now() + 5 * 60_000,
      metadata: false,
      assetsPending: false,
      complete: false,
      busyRetries: 0,
      retryAt: 0
    }
    attempts.set(url, attempt)
    if (attempts.size > 64) {
      // Keep completion state for the current viewport: evicting a still-visible
      // URL would immediately make that same destination eligible again.
      const oldest = [...attempts.keys()].find(
        (candidate) => !visible.has(candidate)
      )
      attempts.delete(oldest ?? attempts.keys().next().value!)
    }
    return attempt
  }

  function internal(result: LinkPreviewResult) {
    const destination = result.ok
      ? result.metadata.url
      : result.destinationOrigin
    if (!destination) return false
    try {
      return options.isInternalUrl(new URL(destination))
    } catch {
      return true
    }
  }

  async function run() {
    if (!available() || current) return
    const next = work(true)
    if (!next) return
    if (Date.now() < quietUntil || next.wait) {
      schedule(next.wait)
      return
    }
    const request = { ...next, controller: new AbortController() }
    current = request
    const attempt = remember(next.url)
    try {
      const result = await options.resolve(
        next.url,
        request.controller.signal,
        {
          phase: next.phase,
          priority: 'background'
        }
      )
      if (request.controller.signal.aborted) return
      if (
        !result.ok &&
        ['busy', 'aborted'].includes(result.reason) &&
        attempt.busyRetries < 2
      ) {
        attempt.retryAt = Date.now() + 1000 * ++attempt.busyRetries
        return
      }
      attempt.retryAt = 0
      attempt.busyRetries = 0
      if (next.phase === 'metadata') {
        attempt.metadata = true
        attempt.assetsPending =
          result.ok && result.assetsPending === true && !internal(result)
      } else attempt.complete = true
    } catch {
      if (!request.controller.signal.aborted) {
        if (next.phase === 'metadata') attempt.metadata = true
        else attempt.complete = true
      }
    } finally {
      // Keep the slot until settlement even if a host is slow to honor abort.
      current = undefined
      quietUntil = Math.max(quietUntil, Date.now() + 300)
      schedule()
    }
  }

  function schedule(minWait = 0) {
    if (timer !== undefined || idle !== undefined || current || !available())
      return
    const next = work()
    if (!next) return
    timer = window.setTimeout(
      () => {
        timer = undefined
        if (!available()) return
        if (typeof window.requestIdleCallback === 'function') {
          idle = window.requestIdleCallback(() => {
            idle = undefined
            void run()
          })
        } else void run()
      },
      Math.max(0, quietUntil - Date.now(), next.wait, minWait)
    )
  }

  function quiet() {
    quietUntil = Date.now() + 300
    cancelScheduled()
    schedule()
  }

  function changed() {
    if (!available()) {
      cancelScheduled()
      current?.controller.abort()
    } else quiet()
  }

  const observer =
    typeof window.IntersectionObserver === 'function'
      ? new window.IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const element = entry.target as HTMLElement
              const source = sources.get(element)
              if (!source) continue
              if (!entry.isIntersecting || entry.intersectionRatio < 0.01) {
                removeVisible(element, source)
                continue
              }
              let elements = visible.get(source.url)
              if (!elements) {
                // Excess visible links are safely left for hover or a later entry.
                if (visible.size >= 64) continue
                elements = new Set()
                visible.set(source.url, elements)
              }
              elements.add(element)
            }
            prioritizeMetadata()
            quiet()
          },
          { rootMargin: '0px', threshold: 0.01 }
        )
      : undefined

  let resources: PerformanceObserver | undefined
  if (observer) {
    const config = { signal: events.signal, passive: true }
    document.addEventListener('scroll', quiet, { ...config, capture: true })
    document.addEventListener('pointerdown', quiet, {
      ...config,
      capture: true
    })
    document.addEventListener('keydown', quiet, { ...config, capture: true })
    document.addEventListener('input', quiet, { ...config, capture: true })
    window.addEventListener('resize', quiet, config)
    window.addEventListener(
      'load',
      () => {
        loaded = true
        quiet()
      },
      config
    )
    document.addEventListener('visibilitychange', changed, config)
    window.addEventListener('online', changed, config)
    window.addEventListener('offline', changed, config)
    connection?.addEventListener('change', changed, config)
    // Resource completion followed by quiet is a conservative heuristic. Page
    // scripts cannot observe every in-flight request, and CPU idle is separate.
    if (typeof window.PerformanceObserver === 'function') {
      try {
        resources = new window.PerformanceObserver(quiet)
        resources.observe({ type: 'resource' })
      } catch {
        resources?.disconnect()
        resources = undefined
      }
    }
  }

  return {
    update(links: ReadonlyMap<HTMLElement, { url: string }>) {
      if (disposed || !observer) return
      for (const [element, source] of sources) {
        if (
          links.get(element)?.url === source.url &&
          element.getAttribute('href') === source.href
        )
          continue
        removeVisible(element, source)
        observer.unobserve(element)
        sources.delete(element)
      }
      for (const [element, link] of links) {
        if (sources.has(element)) continue
        sources.set(element, {
          url: link.url,
          href: element.getAttribute('href')
        })
        observer.observe(element)
      }
      if (current && !eligible(current.url)) current.controller.abort()
      prioritizeMetadata()
      if (!available()) {
        cancelScheduled()
        current?.controller.abort()
      } else schedule()
    },
    pause() {
      paused = true
      cancelScheduled()
      current?.controller.abort()
    },
    resume() {
      paused = false
      changed()
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelScheduled()
      current?.controller.abort()
      observer?.disconnect()
      resources?.disconnect()
      events.abort()
      sources.clear()
      visible.clear()
      attempts.clear()
    }
  }
}

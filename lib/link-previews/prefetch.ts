import { previewLimits } from './limits'
import type { LinkPreviewResult } from './types'

type Phase = 'metadata' | 'complete'
interface Attempt {
  phase: Phase
  done: boolean
  retries: number
  retryAt: number
}
interface Source {
  url: string
  href: string | null
}

/** Warm the entire saved chat, including offscreen and collapsed messages. */
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
  const sources = new Map<string, Map<HTMLElement, Source>>()
  const attempts = new Map<string, Attempt>()
  const current = new Map<string, AbortController>()
  const events = new AbortController()
  const connection = (
    window.navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  let disposed = false
  let paused = false
  let loaded = document.readyState === 'complete'
  let quietUntil = Date.now() + 150
  let timer: number | undefined
  let idle: number | undefined

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

  function eligible(url: string) {
    for (const [element, source] of sources.get(url) ?? []) {
      if (
        element.isConnected &&
        root.contains(element) &&
        element.getAttribute('href') === source.href
      )
        return true
    }
    return false
  }

  function work() {
    let next: { url: string; attempt: Attempt; wait: number } | undefined
    // Finish ready artwork promptly rather than putting it behind every page fetch.
    for (const phase of ['complete', 'metadata'] as const) {
      for (const [url, attempt] of attempts) {
        if (
          attempt.done ||
          attempt.phase !== phase ||
          current.has(url) ||
          !eligible(url)
        )
          continue
        const wait = Math.max(0, attempt.retryAt - Date.now())
        if (!next || wait < next.wait) next = { url, attempt, wait }
        if (!wait) return next
      }
    }
    return next
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

  async function run(url: string, attempt: Attempt) {
    const controller = new AbortController()
    current.set(url, controller)
    try {
      const result = await options.resolve(url, controller.signal, {
        phase: attempt.phase,
        priority: 'background'
      })
      if (controller.signal.aborted) return
      if (
        !result.ok &&
        ['busy', 'aborted'].includes(result.reason) &&
        attempt.retries < 2
      ) {
        attempt.retryAt = Date.now() + 1000 * ++attempt.retries
        return
      }
      attempt.retryAt = 0
      attempt.retries = 0
      if (
        attempt.phase === 'metadata' &&
        result.ok &&
        result.assetsPending &&
        !internal(result)
      )
        attempt.phase = 'complete'
      else attempt.done = true
    } catch {
      if (!controller.signal.aborted) attempt.done = true
    } finally {
      // An aborted request keeps its slot until it actually settles.
      current.delete(url)
      schedule()
    }
  }

  function pump() {
    if (!available()) return
    if (Date.now() < quietUntil) {
      schedule()
      return
    }
    while (current.size < previewLimits.backgroundConcurrency) {
      const next = work()
      if (!next || next.wait) break
      void run(next.url, next.attempt)
    }
    schedule()
  }

  function schedule() {
    if (
      timer !== undefined ||
      idle !== undefined ||
      !available() ||
      current.size >= previewLimits.backgroundConcurrency
    )
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
            pump()
          })
        } else pump()
      },
      Math.max(0, quietUntil - Date.now(), next.wait)
    )
  }

  function quiet() {
    quietUntil = Date.now() + 150
    cancelScheduled()
    schedule()
  }

  function stop() {
    cancelScheduled()
    for (const controller of current.values()) controller.abort()
  }

  function changed() {
    if (!available()) stop()
    else quiet()
  }

  const config = { signal: events.signal, passive: true }
  document.addEventListener('scroll', quiet, { ...config, capture: true })
  document.addEventListener('pointerdown', quiet, { ...config, capture: true })
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

  return {
    update(links: ReadonlyMap<HTMLElement, { url: string }>) {
      if (disposed) return
      sources.clear()
      for (const [element, { url }] of links) {
        let elements = sources.get(url)
        if (!elements) {
          elements = new Map()
          sources.set(url, elements)
        }
        elements.set(element, { url, href: element.getAttribute('href') })
        if (!attempts.has(url))
          attempts.set(url, {
            phase: 'metadata',
            done: false,
            retries: 0,
            retryAt: 0
          })
      }
      for (const url of attempts.keys()) {
        if (!sources.has(url)) {
          attempts.delete(url)
          current.get(url)?.abort()
        }
      }
      for (const [url, controller] of current)
        if (!eligible(url)) controller.abort()
      if (!available()) stop()
      else schedule()
    },
    pause() {
      paused = true
      stop()
    },
    resume() {
      paused = false
      changed()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      events.abort()
      sources.clear()
      attempts.clear()
    }
  }
}

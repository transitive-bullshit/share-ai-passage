import { previewLimits } from './limits'
import type { LinkPreviewResult } from './types'

export type PreviewPriority = 'interactive' | 'background'

/** Shared jobs have independent consumers; the last cancellation stops acquisition. */
export function createPreviewCache(
  acquire: (
    url: string,
    signal: AbortSignal,
    priority: PreviewPriority
  ) => Promise<LinkPreviewResult>,
  concurrency: number = previewLimits.concurrency,
  backgroundConcurrency = Math.min(
    previewLimits.backgroundConcurrency,
    concurrency
  ),
  cacheEntries: number = previewLimits.cacheEntries
) {
  const cache = new Map<
    string,
    { expires: number; result: LinkPreviewResult }
  >()
  const jobs = new Map<
    string,
    {
      controller: AbortController
      promise: Promise<LinkPreviewResult>
      consumers: number
      priority: PreviewPriority
    }
  >()
  return async (
    url: string,
    signal: AbortSignal,
    priority: PreviewPriority = 'interactive'
  ): Promise<LinkPreviewResult> => {
    signal.throwIfAborted()
    const cached = cache.get(url)
    if (cached && cached.expires > Date.now()) {
      cache.delete(url)
      cache.set(url, cached)
      return cached.result
    }
    cache.delete(url)
    let job = jobs.get(url)
    if (job?.controller.signal.aborted) {
      return { ok: false, reason: 'busy' }
    }
    if (job && priority === 'interactive') job.priority = 'interactive'
    if (!job) {
      if (
        jobs.size >= concurrency ||
        (priority === 'background' &&
          [...jobs.values()].filter((job) => job.priority === 'background')
            .length >= backgroundConcurrency)
      )
        return { ok: false, reason: 'busy' }
      const controller = new AbortController()
      const created = {
        controller,
        consumers: 0,
        priority,
        promise: Promise.resolve<LinkPreviewResult>({
          ok: false,
          reason: 'aborted'
        })
      }
      created.promise = Promise.resolve()
        .then(() => acquire(url, controller.signal, created.priority))
        .catch((): LinkPreviewResult => ({
          ok: false,
          reason: controller.signal.aborted ? 'aborted' : 'unavailable'
        }))
        .then((result) => {
          if (
            !controller.signal.aborted &&
            (result.ok || !['busy', 'aborted'].includes(result.reason))
          ) {
            cache.set(url, {
              result,
              expires: Date.now() + (result.ok ? 600_000 : 30_000)
            })
            if (cache.size > cacheEntries)
              cache.delete(cache.keys().next().value!)
          }
          return result
        })
        .finally(() => {
          jobs.delete(url)
        })
      jobs.set(url, created)
      job = created
    }
    const current = job
    current.consumers++
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = () => {
        if (settled) return false
        settled = true
        signal.removeEventListener('abort', abort)
        if (--current.consumers === 0) current.controller.abort()
        return true
      }
      const abort = () => {
        if (finish()) reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void current.promise.then((result) => {
        if (finish()) resolve(result)
      })
    })
  }
}

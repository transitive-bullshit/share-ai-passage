import { createPreviewCache, type PreviewPriority } from './cache'
import type { LinkPreviewResult } from './types'

const metadata = createPreviewCache(async (url, signal, priority) => {
  const response = await fetch('/api/link-preview', {
    method: 'POST',
    priority: priority === 'background' ? 'low' : 'auto',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, priority }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer'
  })
  if (!response.ok) return { ok: false, reason: 'unavailable' }
  return (await response.json()) as LinkPreviewResult
})

function warmImage(src: string, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const image = new Image()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      image.onload = image.onerror = null
      image.removeAttribute('src')
      resolve()
    }
    const timer = setTimeout(done, 4000)
    signal.addEventListener('abort', done, { once: true })
    image.referrerPolicy = 'no-referrer'
    image.decoding = 'async'
    image.onload = () => {
      void image
        .decode()
        .catch(() => {})
        .then(done)
    }
    image.onerror = done
    image.src = src
    if (signal.aborted) done()
  })
}

const assets = createPreviewCache(async (url, signal, priority) => {
  const result = await metadata(url, signal, priority)
  if (result.ok) {
    for (const src of [result.metadata.image, result.metadata.favicon]) {
      signal.throwIfAborted()
      if (src) await warmImage(src, signal)
    }
  }
  return result
})

export async function resolveClientPreview(
  url: string,
  signal: AbortSignal,
  options: { phase: 'metadata' | 'complete'; priority?: PreviewPriority }
) {
  const result = await (options.phase === 'complete' ? assets : metadata)(
    url,
    signal,
    options.priority
  )
  return result.ok
    ? {
        ...result,
        assetsPending:
          options.phase === 'metadata' &&
          Boolean(result.metadata.image || result.metadata.favicon)
      }
    : result
}

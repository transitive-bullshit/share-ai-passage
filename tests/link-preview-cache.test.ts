import { afterEach, expect, it, vi } from 'vitest'
import { createPreviewCache } from '@/lib/link-previews/cache'
import type { LinkPreviewResult } from '@/lib/link-previews/types'

const success: LinkPreviewResult = {
  ok: true,
  metadata: {
    requestedUrl: 'https://example.org',
    url: 'https://example.org',
    title: 'Example'
  }
}
afterEach(() => vi.useRealTimers())

it('joins requests and cancellation only aborts after the final consumer leaves', async () => {
  let finish!: (result: LinkPreviewResult) => void
  let shared!: AbortSignal
  const acquire = vi.fn<
    (url: string, signal: AbortSignal) => Promise<LinkPreviewResult>
  >((_url, signal) => {
    shared = signal
    return new Promise<LinkPreviewResult>((resolve) => {
      finish = resolve
    })
  })
  const resolve = createPreviewCache(acquire)
  const first = new AbortController()
  const second = new AbortController()
  const a = resolve('url', first.signal).catch(() => 'cancelled')
  const b = resolve('url', second.signal)
  await Promise.resolve()
  first.abort()
  expect(await a).toBe('cancelled')
  expect(shared.aborted).toBe(false)
  finish(success)
  expect(await b).toEqual(success)
  expect(await resolve('url', new AbortController().signal)).toEqual(success)
  expect(acquire).toHaveBeenCalledTimes(1)
})

it('bounds simultaneous acquisition and retries failures after their short TTL', async () => {
  vi.useFakeTimers()
  const acquire = vi.fn<() => Promise<LinkPreviewResult>>(
    async (): Promise<LinkPreviewResult> => ({
      ok: false,
      reason: 'unavailable'
    })
  )
  const resolve = createPreviewCache(acquire, 1)
  const signal = new AbortController().signal
  const first = resolve('a', signal)
  expect(await resolve('b', signal)).toEqual({ ok: false, reason: 'busy' })
  await first
  await resolve('a', signal)
  expect(acquire).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30_001)
  await resolve('a', signal)
  expect(acquire).toHaveBeenCalledTimes(2)
})

it('evicts old entries and expires successful metadata', async () => {
  vi.useFakeTimers()
  const acquire = vi.fn<() => Promise<LinkPreviewResult>>(async () => success)
  const resolve = createPreviewCache(acquire, 8, 4, 64)
  const signal = new AbortController().signal
  for (let i = 0; i < 65; i++) await resolve(String(i), signal)
  await resolve('0', signal)
  expect(acquire).toHaveBeenCalledTimes(66)
  await vi.advanceTimersByTimeAsync(600_001)
  await resolve('0', signal)
  expect(acquire).toHaveBeenCalledTimes(67)
})

it('allows four background jobs, reserves hover capacity, and promotes joined work', async () => {
  const finishes: Array<(result: LinkPreviewResult) => void> = []
  const resolve = createPreviewCache(
    () =>
      new Promise((finish) => {
        finishes.push(finish)
      })
  )
  const signal = new AbortController().signal
  const background = Array.from({ length: 4 }, (_, i) =>
    resolve(String(i), signal, 'background')
  )
  expect(await resolve('extra', signal, 'background')).toEqual({
    ok: false,
    reason: 'busy'
  })
  const joined = resolve('0', signal)
  const next = resolve('extra', signal, 'background')
  const hover = resolve('hover', signal)
  await Promise.resolve()
  expect(finishes).toHaveLength(6)
  for (const finish of finishes) finish(success)
  expect(await Promise.all([...background, joined, next, hover])).toHaveLength(
    7
  )
})

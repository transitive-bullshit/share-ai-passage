import { afterEach, expect, it, vi } from 'vitest'

import { createDraftAutosave, type DraftContent } from '@/lib/draft-autosave'
import { ClientRequestError } from '@/lib/client-request'
import { DraftRequestError, saveDraft } from '@/lib/draft-client'

const initial = {
  revision: 1,
  preview: { title: 'Original', highlights: ['One idea'] },
  appearance: { templateId: 'margin-notes' as const }
}
const changed = {
  ...initial,
  preview: { title: 'Edited', highlights: ['One idea'] }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('coalesces partial edits, serializes saves, and flushes the latest revision for publishing', async () => {
  vi.useFakeTimers()
  let resolveFirst!: (value: { revision: number }) => void
  const request = vi
    .fn<
      (revision: number, content: DraftContent) => Promise<{ revision: number }>
    >()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    .mockResolvedValueOnce({ revision: 3 })
  const store = createDraftAutosave(initial, request)
  store.change({ ...changed, preview: { title: '', highlights: [''] } })
  store.change(changed)
  await vi.advanceTimersByTimeAsync(500)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenNthCalledWith(1, 1, changed)
  const latest = {
    ...changed,
    preview: { title: 'Final edit', highlights: [''] }
  }
  store.change(latest)
  const publishedRevision = store.flush()
  expect(request).toHaveBeenCalledTimes(1)
  resolveFirst({ revision: 2 })
  await expect(publishedRevision).resolves.toBe(3)
  expect(request).toHaveBeenNthCalledWith(2, 2, latest)
  expect(store.getSnapshot()).toMatchObject({ status: 'saved', revision: 3 })
  store.dispose()
})

it('keeps a revision conflict blocked until the user explicitly reloads rather than overwriting another edit', async () => {
  const request = vi
    .fn<
      (revision: number, content: DraftContent) => Promise<{ revision: number }>
    >()
    .mockRejectedValue(new ClientRequestError('Draft changed', 409))
  const store = createDraftAutosave(initial, request)
  store.change(changed)
  await expect(store.flush()).rejects.toThrow('Draft changed')
  store.change({ ...changed, preview: { title: 'Still here', highlights: [] } })
  await expect(store.flush()).rejects.toThrow('Reload it before continuing')
  expect(request).toHaveBeenCalledTimes(1)
  expect(store.getSnapshot().status).toBe('conflict')
  store.dispose()
})

it('retries an ordinary save error with the same revision and content', async () => {
  const request = vi
    .fn<
      (revision: number, content: DraftContent) => Promise<{ revision: number }>
    >()
    .mockRejectedValueOnce(new ClientRequestError('Connection lost'))
    .mockResolvedValueOnce({ revision: 2 })
  const store = createDraftAutosave(initial, request)
  store.change(changed)
  await expect(store.flush()).rejects.toThrow('Connection lost')
  expect(store.getSnapshot().status).toBe('error')
  await expect(store.flush()).resolves.toBe(2)
  expect(request).toHaveBeenNthCalledWith(2, 1, changed)
  store.dispose()
})

it('recognizes a lost successful save response without overwriting a different server draft', async () => {
  const requests = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Revision changed' }), {
        status: 409
      })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...changed, status: 'ready', revision: 2 }))
    )
  vi.stubGlobal('fetch', requests)
  await expect(saveDraft('draft-id', 1, changed)).resolves.toMatchObject({
    revision: 2
  })
  requests
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Revision changed' }), {
        status: 409
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ready',
          ...initial,
          revision: 4,
          preview: { title: 'Another device', highlights: [] }
        })
      )
    )
  await expect(saveDraft('draft-id', 1, changed)).rejects.toBeInstanceOf(
    DraftRequestError
  )
  expect(requests).toHaveBeenCalledTimes(4)
})

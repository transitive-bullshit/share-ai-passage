// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { DraftLoader } from '@/components/draft-loader'
import type { SavedDraft } from '@/lib/draft-client'

let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn<typeof fetch>()
const onReady = vi.fn<(draft: SavedDraft) => void>()
const onBack = vi.fn<() => void>()
const resetAt = '2026-10-01T00:00:00Z'
const blocked = {
  draftId: 'owned-draft',
  status: 'preparing',
  errorMessage: 'You have used this month’s summary generations.',
  generationBlock: { code: 'SUMMARY_LIMIT', resetAt, canSignUp: true }
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  fetchMock.mockReset()
  onReady.mockReset()
  onBack.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function render(previousReset?: number) {
  await act(async () =>
    root.render(
      createElement(DraftLoader, {
        draftId: 'owned-draft',
        onReady,
        onBack,
        resetAt: previousReset
      })
    )
  )
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it('restores quota guidance from a saved draft, stops polling, and keeps cached resume available', async () => {
  fetchMock.mockResolvedValueOnce(response(blocked))
  await render()
  expect(container.textContent).toContain('New summaries are paused.')
  expect(container.textContent).toContain(
    new Date(resetAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  )
  expect(
    container.querySelector(
      'a[href="/sign-up?returnTo=%2F%3Fdraft%3Downed-draft"]'
    )
  ).not.toBeNull()
  expect(container.textContent).not.toContain('Its progress is saved.')
  await act(async () => vi.advanceTimersByTimeAsync(12_000))
  expect(fetchMock).toHaveBeenCalledTimes(1)

  const ready = { draftId: 'owned-draft', status: 'ready' }
  fetchMock.mockResolvedValueOnce(response(ready))
  await click('Resume preparation')
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/drafts/owned-draft/resume',
    expect.objectContaining({ method: 'POST' })
  )
  expect(onReady).toHaveBeenCalledWith(ready)
})

it('retrieves the reset status after a resumed request hits the quota', async () => {
  fetchMock.mockResolvedValueOnce(
    response({ draftId: 'owned-draft', status: 'preparing' })
  )
  await render()
  fetchMock
    .mockResolvedValueOnce(
      response(
        { error: blocked.errorMessage, code: 'SUMMARY_LIMIT', resetAt },
        429
      )
    )
    .mockResolvedValueOnce(response(blocked))
  await click('Resume preparation')
  expect(container.textContent).toContain('New summaries are paused.')
  expect(container.textContent).toContain('Create a free account')
  await act(async () => vi.advanceTimersByTimeAsync(12_000))
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

it('does not suggest signup as a way around the shared service budget', async () => {
  fetchMock.mockResolvedValueOnce(
    response({
      ...blocked,
      generationBlock: {
        code: 'FREE_BUDGET_LIMIT',
        resetAt,
        canSignUp: false
      }
    })
  )
  await render()
  expect(container.textContent).toContain('New summaries are paused.')
  expect(container.querySelector('a[href^="/sign-up"]')).toBeNull()
})

it('clears an old reset hint when the saved status is no longer quota-blocked', async () => {
  fetchMock.mockResolvedValueOnce(
    response({ draftId: 'owned-draft', status: 'preparing' })
  )
  await render(Date.parse(resetAt))
  expect(container.textContent).not.toContain(
    'New summaries are available after'
  )
  expect(container.textContent).toContain('Your passage is being prepared.')
})

it('retains a resume explanation if the status response has no saved error', async () => {
  const pending = { draftId: 'owned-draft', status: 'preparing' }
  const message = 'This generation is still pending confirmation.'
  fetchMock.mockResolvedValueOnce(response(pending))
  await render()
  fetchMock
    .mockResolvedValueOnce(response({ error: message }, 409))
    .mockResolvedValueOnce(response(pending))
  await click('Resume preparation')
  expect(container.textContent).toContain(message)
})

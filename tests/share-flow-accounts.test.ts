// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ShareFlow } from '@/components/share-flow'
import { preparationRecovery } from '@/lib/preparation-recovery'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<
    () => Promise<{
      data: {
        user: { id: string; emailVerified: boolean; isAnonymous: boolean }
      } | null
      error: null
    }>
  >(),
  anonymous: vi.fn<() => Promise<{ data: object; error: null }>>()
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false, error: null }),
    getSession: mocks.getSession,
    signIn: { anonymous: mocks.anonymous }
  }
}))
vi.mock('@/components/preview-review', () => ({
  PreviewReview: () => createElement('p', null, 'Saved draft ready')
}))

let container: HTMLDivElement
let root: Root
let requests: ReturnType<typeof vi.fn<typeof fetch>>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  mocks.getSession.mockResolvedValue({ data: null, error: null })
  mocks.anonymous.mockResolvedValue({ data: {}, error: null })
  requests = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', requests)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function source(value: string) {
  const input = container.querySelector<HTMLInputElement>('#source-url')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

it('shows the monthly reset locally without preventing a different cached preparation', async () => {
  const resetAt = '2026-10-01T00:00:00.000Z'
  requests.mockResolvedValueOnce(
    Response.json(
      { error: 'Summary allowance used.', code: 'SUMMARY_LIMIT', resetAt },
      { status: 429, headers: { 'Retry-After': '1000000' } }
    )
  )
  await act(async () => root.render(createElement(ShareFlow)))
  expect(mocks.anonymous).not.toHaveBeenCalled()
  await source('https://chatgpt.com/share/first')
  await submit()
  expect(container.textContent).toContain(
    new Date(resetAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    })
  )
  expect(
    container.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled
  ).toBe(false)
  requests.mockResolvedValueOnce(
    Response.json({
      draftId: 'cached-draft',
      revision: 1,
      status: 'ready',
      draftToken: 'token',
      provider: 'chatgpt',
      sourceUrl: 'https://chatgpt.com/share/cached',
      preview: { title: 'Cached', highlights: [] },
      appearance: { templateId: 'margin-notes' }
    })
  )
  await source('https://chatgpt.com/share/cached')
  await submit()
  expect(container.textContent).toContain('Saved draft ready')
  expect(requests).toHaveBeenCalledTimes(2)
})

it('reuses the identical preparation key after an uncertain response instead of dispatching a new logical generation', async () => {
  requests
    .mockRejectedValueOnce(new TypeError('Connection lost'))
    .mockResolvedValueOnce(
      Response.json({
        draftId: 'recovered',
        revision: 1,
        status: 'ready',
        draftToken: 'token',
        provider: 'chatgpt',
        sourceUrl: 'https://chatgpt.com/share/first',
        preview: { title: 'Recovered', highlights: [] },
        appearance: { templateId: 'margin-notes' }
      })
    )
  await act(async () => root.render(createElement(ShareFlow)))
  await source('https://chatgpt.com/share/first')
  await submit()
  expect(container.textContent).toContain('Check that preparation')
  await submit()
  expect(requests.mock.calls[1]![1]!.body).toBe(
    requests.mock.calls[0]![1]!.body
  )
  expect(container.textContent).toContain('Saved draft ready')
})

const signedInSession = {
  data: { user: { id: 'account-1', emailVerified: true, isAnonymous: false } },
  error: null
}
const readyDraft = {
  draftId: 'new-draft',
  revision: 1,
  status: 'ready',
  draftToken: 'token',
  provider: 'chatgpt',
  sourceUrl: 'https://chatgpt.com/share/first',
  preview: { title: 'Ready', highlights: [] },
  appearance: { templateId: 'midnight-observatory' }
}

it.each(['guest', 'account'])(
  'shows normal preparation progress without an interrupted-request warning for a %s',
  async (actor) => {
    if (actor === 'account') {
      mocks.getSession.mockResolvedValue(signedInSession)
      requests.mockResolvedValueOnce(
        Response.json({ saved: true, appearance: readyDraft.appearance })
      )
    }
    let finishPreparation!: (response: Response) => void
    requests.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishPreparation = resolve
        })
    )
    await act(async () => root.render(createElement(ShareFlow)))
    await source(readyDraft.sourceUrl)
    await submit()
    expect(requests.mock.calls.map(([path]) => path)).toEqual(
      actor === 'account'
        ? ['/api/account/preferences', '/api/drafts']
        : ['/api/drafts']
    )
    expect(preparationRecovery.getSnapshot()).not.toBeNull()
    expect(container.textContent).toContain('Preparing')
    expect(container.textContent).not.toContain(
      'A previous preparation may still be finishing'
    )
    expect(container.textContent).not.toContain('Check that preparation')
    await act(async () => finishPreparation(Response.json(readyDraft)))
    expect(container.textContent).toContain('Saved draft ready')
    expect(preparationRecovery.getSnapshot()).toBeNull()
  }
)

it('waits for the real account default before new creation when the session hook is still hydrating', async () => {
  mocks.getSession.mockResolvedValue(signedInSession)
  let finishPreferences!: (response: Response) => void
  requests
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreferences = resolve
        })
    )
    .mockResolvedValueOnce(Response.json(readyDraft))
  await act(async () => root.render(createElement(ShareFlow)))
  await source('https://chatgpt.com/share/first')
  await submit()
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests.mock.calls[0]![0]).toBe('/api/account/preferences')
  expect(mocks.anonymous).not.toHaveBeenCalled()
  await act(async () => {
    finishPreferences(
      Response.json({
        saved: true,
        appearance: { templateId: 'midnight-observatory' }
      })
    )
  })
  expect(requests).toHaveBeenCalledTimes(2)
  expect(JSON.parse(requests.mock.calls[1]![1]!.body as string)).toMatchObject({
    appearance: { templateId: 'midnight-observatory' }
  })
  expect(container.textContent).toContain('Saved draft ready')
})

it('initializes a new account default from the local preference before creating its first draft', async () => {
  mocks.getSession.mockResolvedValue(signedInSession)
  window.localStorage.setItem(
    'passage:card-preferences:v1',
    JSON.stringify({ version: 1, appearance: { templateId: 'friendly-lab' } })
  )
  requests
    .mockResolvedValueOnce(
      Response.json({
        saved: false,
        appearance: { templateId: 'margin-notes' }
      })
    )
    .mockResolvedValueOnce(
      Response.json({ saved: true, appearance: { templateId: 'friendly-lab' } })
    )
    .mockResolvedValueOnce(Response.json(readyDraft))
  await act(async () => root.render(createElement(ShareFlow)))
  await source('https://chatgpt.com/share/first')
  await submit()
  expect(requests.mock.calls.map(([path]) => path)).toEqual([
    '/api/account/preferences',
    '/api/account/preferences',
    '/api/drafts'
  ])
  expect(JSON.parse(requests.mock.calls[1]![1]!.body as string)).toEqual({
    appearance: { templateId: 'friendly-lab' },
    initializeOnly: true
  })
  expect(JSON.parse(requests.mock.calls[2]![1]!.body as string)).toMatchObject({
    appearance: { templateId: 'friendly-lab' }
  })
})

it('retains the original appearance and request key when recovering after signing in', async () => {
  mocks.getSession.mockResolvedValue(signedInSession)
  const originalRequest = {
    url: 'https://chatgpt.com/share/first',
    requestKey: '47d47d0d-a925-4ea3-9b8a-ff900433641a',
    appearance: { templateId: 'electric-risograph' as const }
  }
  preparationRecovery.save(originalRequest)
  requests.mockResolvedValueOnce(Response.json(readyDraft))
  await act(async () => root.render(createElement(ShareFlow)))
  await source(originalRequest.url)
  await submit()
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests.mock.calls[0]![0]).toBe('/api/drafts')
  expect(JSON.parse(requests.mock.calls[0]![1]!.body as string)).toEqual(
    originalRequest
  )
})

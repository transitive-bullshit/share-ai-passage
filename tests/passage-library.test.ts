// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { PassageLibrary } from '@/components/passage-library'

const { session, push } = vi.hoisted(() => ({
  session: {
    data: {
      user: {
        id: 'account-one',
        email: 'reader@example.invalid',
        emailVerified: true,
        isAnonymous: false
      }
    } as {
      user: {
        id: string
        email: string
        emailVerified: boolean
        isAnonymous: boolean
      }
    } | null,
    isPending: false,
    error: null
  },
  push: vi.fn<(href: string) => void>()
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => session }
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  }) => createElement('a', { href, ...props }, children)
}))

let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn<typeof fetch>()
const fixture = {
  drafts: [
    {
      id: 'draft-one',
      title: 'An unfinished idea',
      status: 'ready',
      updatedAt: '2026-09-14T12:00:00Z',
      errorMessage: null,
      revision: 2
    }
  ],
  passages: [
    {
      id: 'passage-one',
      title: 'A shared idea',
      provider: 'claude',
      shareUrl: 'https://passage.example/claude/passage-one',
      createdAt: '2026-09-13T12:00:00Z'
    }
  ],
  usage: {
    allowance: 25,
    used: 2,
    reserved: 1,
    remaining: 22,
    resetAt: '2026-10-01T00:00:00Z'
  },
  nextDraftCursor: null as string | null,
  nextPublicationCursor: null as string | null
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  session.data = {
    user: {
      id: 'account-one',
      email: 'reader@example.invalid',
      emailVerified: true,
      isAnonymous: false
    }
  }
  push.mockReset()
  fetchMock.mockReset().mockResolvedValue(response(fixture))
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render() {
  await act(async () => root.render(createElement(PassageLibrary)))
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (element) =>
      element.textContent?.trim() === label ||
      element.getAttribute('aria-label') === label
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it('keeps guest creation available and sends sign-in back to the library', async () => {
  session.data = null
  await render()
  expect(fetchMock).not.toHaveBeenCalled()
  expect(
    container.querySelector('a[href="/sign-in?returnTo=%2Fpassages"]')
  ).not.toBeNull()
  expect(container.textContent).toContain('without an account')
})

it('loads each opaque cursor independently without replacing the other section', async () => {
  const cursor = 'opaque+/cursor==&later'
  fetchMock.mockResolvedValueOnce(
    response({ ...fixture, nextDraftCursor: cursor })
  )
  fetchMock.mockResolvedValueOnce(
    response({
      ...fixture,
      drafts: [
        fixture.drafts[0],
        { ...fixture.drafts[0], id: 'draft-two', title: 'An older idea' }
      ],
      passages: [],
      nextPublicationCursor: 'ignored-other-cursor'
    })
  )
  await render()
  expect(container.textContent).toContain('22 of 25')
  expect(container.querySelector('a[href="/?draft=draft-one"]')).not.toBeNull()
  await click('Load more drafts')
  const requested = new URL(
    fetchMock.mock.calls[1]![0] as string,
    'https://passage.example'
  )
  expect(requested.searchParams.get('draftCursor')).toBe(cursor)
  expect(requested.searchParams.has('publicationCursor')).toBe(false)
  expect(container.textContent).toContain('An older idea')
  expect(container.textContent).toContain('A shared idea')
  expect(container.querySelectorAll('a.library-title')).toHaveLength(3)
  expect(container.textContent).not.toContain('Load more passages')
})

it('confirms deletion beside its passage, retains failed deletions, then removes only that passage', async () => {
  fetchMock.mockResolvedValueOnce(response(fixture))
  fetchMock.mockResolvedValueOnce(response({ error: 'Please try again.' }, 503))
  fetchMock.mockResolvedValueOnce(response({ deleted: true }))
  await render()
  await click('Delete passage: A shared idea')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const confirmation = [...container.querySelectorAll('[role="alert"]')].find(
    (element) => element.textContent?.includes('Delete “A shared idea”')
  )!
  expect(confirmation.closest('li')).not.toBeNull()
  await click('Delete passage')
  expect(
    container.querySelector('a.library-title[href*="passage-one"]')
  ).not.toBeNull()
  await click('Delete passage')
  expect(
    container.querySelector('a.library-title[href*="passage-one"]')
  ).toBeNull()
  expect(container.textContent).toContain('An unfinished idea')
  expect(fetchMock.mock.calls[2]![1]).toMatchObject({
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
})

it('reuses a revision request key after a lost response and resumes the returned draft', async () => {
  fetchMock.mockResolvedValueOnce(response(fixture))
  fetchMock.mockRejectedValueOnce(new Error('response lost'))
  fetchMock.mockResolvedValueOnce(response({ draftId: 'revised-draft' }))
  await render()
  await click('Revise')
  await click('Revise')
  const firstBody = JSON.parse(fetchMock.mock.calls[1]![1]?.body as string) as {
    requestKey: string
  }
  const secondBody = JSON.parse(
    fetchMock.mock.calls[2]![1]?.body as string
  ) as {
    requestKey: string
  }
  expect(firstBody.requestKey).toBeTruthy()
  expect(secondBody).toEqual(firstBody)
  expect(push).toHaveBeenCalledWith('/?draft=revised-draft')
})

it('drops private library content when the account changes or signs out', async () => {
  fetchMock.mockResolvedValueOnce(response(fixture))
  fetchMock.mockResolvedValueOnce(
    response({ ...fixture, drafts: [], passages: [] })
  )
  await render()
  expect(container.textContent).toContain('A shared idea')
  session.data!.user = { ...session.data!.user, id: 'account-two' }
  await render()
  expect(container.textContent).not.toContain('A shared idea')
  expect(container.textContent).toContain('No drafts yet')
  session.data = null
  await render()
  expect(container.textContent).toContain('Sign in')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

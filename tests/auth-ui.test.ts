// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { AccountSettings } from '@/components/account-settings'
import { AuthForm } from '@/components/auth-form'
import { authHref, safeReturnTo } from '@/lib/auth-navigation'

type MockRequest = (input?: Record<string, unknown>) => Promise<{
  data?: unknown
  error?: { code?: string; status?: number } | null
}>

const mocks = vi.hoisted(() => ({
  replace: vi.fn<(path: string) => void>(),
  refresh: vi.fn<() => void>(),
  signIn: vi.fn<MockRequest>(),
  signUp: vi.fn<MockRequest>(),
  social: vi.fn<MockRequest>(),
  reset: vi.fn<MockRequest>(),
  requestReset: vi.fn<MockRequest>(),
  verify: vi.fn<MockRequest>(),
  deleteUser: vi.fn<MockRequest>(),
  updateUser: vi.fn<MockRequest>(),
  changePassword: vi.fn<MockRequest>(),
  signOut: vi.fn<MockRequest>(),
  linkSocial: vi.fn<MockRequest>(),
  unlinkAccount: vi.fn<MockRequest>(),
  listAccounts:
    vi.fn<() => Promise<{ data: { id: string; providerId: string }[] }>>(),
  session: {
    data: null as null | {
      user: {
        id: string
        name: string
        email: string
        emailVerified: boolean
        isAnonymous: boolean
      }
    },
    isPending: false,
    error: null,
    refetch: vi.fn<() => Promise<void>>()
  }
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh })
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => mocks.session,
    signIn: { email: mocks.signIn, social: mocks.social },
    signUp: { email: mocks.signUp },
    resetPassword: mocks.reset,
    requestPasswordReset: mocks.requestReset,
    sendVerificationEmail: mocks.verify,
    deleteUser: mocks.deleteUser,
    updateUser: mocks.updateUser,
    changePassword: mocks.changePassword,
    signOut: mocks.signOut,
    linkSocial: mocks.linkSocial,
    unlinkAccount: mocks.unlinkAccount,
    listAccounts: mocks.listAccounts
  }
}))
const config = {
  available: true,
  emailAndPassword: true,
  emailVerification: true,
  providers: { google: true, github: false }
}
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' }
      })
    )
  )
  mocks.session.data = null
  mocks.listAccounts.mockResolvedValue({
    data: [{ id: 'credential-id', providerId: 'credential' }]
  })
  for (const request of [
    mocks.signIn,
    mocks.signUp,
    mocks.social,
    mocks.reset,
    mocks.requestReset,
    mocks.verify,
    mocks.deleteUser,
    mocks.updateUser,
    mocks.changePassword,
    mocks.signOut,
    mocks.linkSocial,
    mocks.unlinkAccount
  ])
    request.mockResolvedValue({ data: {}, error: null })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function input(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)!
  expect(element).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit(form = container.querySelector('form')!) {
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}
function button(text: string) {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.includes(text)
  )!
}
function signedIn() {
  mocks.session.data = {
    user: {
      id: 'one',
      name: 'Reader',
      email: 'reader@example.com',
      emailVerified: true,
      isAnonymous: false
    }
  }
}

it('keeps local draft continuations and rejects external, encoded, API, and auth-loop destinations', () => {
  expect(safeReturnTo('/?draft=abc')).toBe('/?draft=abc')
  expect(safeReturnTo('/passages/abc')).toBe('/passages/abc')
  for (const value of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/%255cevil.test',
    '/api/auth/sign-out',
    '/sign-in?returnTo=/',
    '/%0a/evil.test',
    ['/']
  ])
    expect(safeReturnTo(value)).toBe('/passages')
  expect(
    new URL(
      authHref('/sign-in', '/?draft=abc'),
      'https://passage.test'
    ).searchParams.get('returnTo')
  ).toBe('/?draft=abc')
})

it('preserves annual billing intent when switching from sign-in to account creation', async () => {
  const returnTo = '/account/billing?interval=year'
  await act(async () =>
    root.render(createElement(AuthForm, { mode: 'sign-in', returnTo }))
  )
  const signUp = [...container.querySelectorAll('a')].find(
    (link) => new URL(link.href).pathname === '/sign-up'
  )
  expect(signUp).toBeDefined()
  expect(new URL(signUp!.href).searchParams.get('returnTo')).toBe(returnTo)
  expect(mocks.signIn).not.toHaveBeenCalled()
  expect(mocks.signUp).not.toHaveBeenCalled()
})

it('keeps password errors on the form and offers verification without losing the draft', async () => {
  mocks.signIn.mockResolvedValue({
    error: { code: 'EMAIL_NOT_VERIFIED', status: 403 }
  })
  await act(async () =>
    root.render(
      createElement(AuthForm, { mode: 'sign-in', returnTo: '/?draft=abc' })
    )
  )
  await input('auth-email', 'reader@example.com')
  await input('auth-password', 'safe-password')
  await submit()
  expect(mocks.signIn).toHaveBeenCalledWith({
    email: 'reader@example.com',
    password: 'safe-password',
    callbackURL: '/?draft=abc'
  })
  expect(container.textContent).toContain('Verify your email before signing in')
  const verifyLink = [
    ...container.querySelectorAll<HTMLAnchorElement>('a')
  ].find((element) => element.textContent === 'Send a verification email')!
  expect(new URL(verifyLink.href).searchParams.get('returnTo')).toBe(
    '/?draft=abc'
  )
  expect(mocks.replace).not.toHaveBeenCalled()
})

it.each(['sign-up', 'reset-password'] as const)(
  'shows the four-character minimum and server validation feedback for %s',
  async (mode) => {
    mocks.signUp.mockResolvedValue({ error: { code: 'PASSWORD_TOO_SHORT' } })
    mocks.reset.mockResolvedValue({ error: { code: 'PASSWORD_TOO_SHORT' } })
    await act(async () =>
      root.render(
        createElement(AuthForm, {
          mode,
          returnTo: '/account',
          token: 'reset-token'
        })
      )
    )
    const password =
      container.querySelector<HTMLInputElement>('#auth-password')!
    expect(password.minLength).toBe(4)
    expect(password.maxLength).toBe(128)
    expect(container.textContent).toContain('Use at least 4 characters.')
    if (mode === 'sign-up') {
      await input('auth-name', 'Reader')
      await input('auth-email', 'reader@example.com')
    }
    await input('auth-password', 'abc')
    await input('auth-confirmation', 'abc')
    // Direct submit exercises API-error feedback independently of native validation.
    await submit()
    expect(container.textContent).toContain(
      'Use a password between 4 and 128 characters.'
    )
    expect(mocks.replace).not.toHaveBeenCalled()
  }
)

it('does not submit mismatched reset passwords or offer an unavailable provider', async () => {
  await act(async () =>
    root.render(
      createElement(AuthForm, {
        mode: 'reset-password',
        returnTo: '/passages',
        token: 'reset-token'
      })
    )
  )
  await input('auth-password', 'safe-password')
  await input('auth-confirmation', 'different-password')
  await submit()
  expect(container.textContent).toContain('The passwords don’t match.')
  expect(
    container.querySelector('#auth-confirmation')?.getAttribute('aria-invalid')
  ).toBe('true')
  expect(mocks.reset).not.toHaveBeenCalled()
  await act(async () =>
    root.render(
      createElement(AuthForm, {
        key: 'sign-in',
        mode: 'sign-in',
        returnTo: '/passages'
      })
    )
  )
  expect(button('GitHub').disabled).toBe(true)
  await act(async () => button('GitHub').click())
  expect(mocks.social).not.toHaveBeenCalled()
})

it('preserves the draft through signup and verification callback URLs', async () => {
  await act(async () =>
    root.render(
      createElement(AuthForm, { mode: 'sign-up', returnTo: '/?draft=abc' })
    )
  )
  await input('auth-name', 'Reader')
  await input('auth-email', 'reader@example.com')
  await input('auth-password', 'safe-password')
  await input('auth-confirmation', 'safe-password')
  await submit()
  const request = mocks.signUp.mock.calls[0]![0]!
  expect(
    new URL(
      request.callbackURL as string,
      'https://passage.test'
    ).searchParams.get('returnTo')
  ).toBe('/?draft=abc')
  const destination = new URL(
    mocks.replace.mock.calls[0]![0],
    'https://passage.test'
  )
  expect(destination.pathname).toBe('/verify-email')
  expect(destination.searchParams.get('returnTo')).toBe('/?draft=abc')
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it('requires a confirmed password before deletion and keeps a failed deletion reviewable', async () => {
  signedIn()
  mocks.deleteUser.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } })
  await act(async () => root.render(createElement(AccountSettings)))
  await act(async () => button('Delete account').click())
  expect(button('Permanently delete account').disabled).toBe(true)
  await input('account-delete-confirm', 'delete')
  expect(button('Permanently delete account').disabled).toBe(true)
  await input('account-delete-password', 'wrong-password')
  await submit(
    container.querySelector('#account-delete-confirm')!.closest('form')!
  )
  expect(mocks.deleteUser).toHaveBeenCalledWith({
    password: 'wrong-password',
    callbackURL: '/'
  })
  expect(container.textContent).toContain('The email or password is incorrect')
  expect(container.querySelector('#account-delete-confirm')).not.toBeNull()
  expect(mocks.replace).not.toHaveBeenCalled()
})

it('shows a real sign-in form for a fresh-session check even when already signed in', async () => {
  signedIn()
  await act(async () =>
    root.render(
      createElement(AuthForm, {
        mode: 'sign-in',
        returnTo: '/account',
        reauthenticate: true
      })
    )
  )
  expect(container.querySelector('#auth-password')).not.toBeNull()
  await input('auth-email', 'reader@example.com')
  await input('auth-password', 'safe-password')
  await submit()
  expect(mocks.replace).toHaveBeenCalledWith('/account')
})

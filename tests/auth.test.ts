import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Resend } from 'resend'

const state = vi.hoisted(() => ({
  database: {} as Record<string, Record<string, unknown>[]>,
  getDb: vi.fn<() => Record<string, never>>(() => ({})),
  sendEmail:
    vi.fn<
      (input: Parameters<Resend['emails']['send']>[0]) => Promise<unknown>
    >(),
  mergeGuestAccount:
    vi.fn<(guestUserId: string, userId: string) => Promise<void>>(),
  deleteAccountData: vi.fn<(userId: string) => Promise<void>>()
}))

vi.mock('@/lib/db', () => ({ getDb: state.getDb }))
vi.mock('@better-auth/drizzle-adapter', async () => {
  const { memoryAdapter } = await import('better-auth/adapters/memory')
  return { drizzleAdapter: () => memoryAdapter(state.database) }
})
vi.mock('@/lib/accounts', () => ({
  mergeGuestAccount: state.mergeGuestAccount,
  deleteAccountData: state.deleteAccountData
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: state.sendEmail }
  }
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('DATABASE_URL', 'postgres://fixture@localhost/unused')
  vi.stubEnv(
    'BETTER_AUTH_SECRET',
    'fixture-auth-secret-with-more-than-thirty-two-characters'
  )
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('RESEND_API_KEY', 'fixture-email-api-key')
  vi.stubEnv('EMAIL_FROM', 'Passage <hello@accounts.example.com>')
  for (const name of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET'
  ]) {
    vi.stubEnv(name, '')
  }
  for (const key of Object.keys(state.database)) delete state.database[key]
  for (const key of ['user', 'session', 'account', 'verification', 'rateLimit'])
    state.database[key] = []
  state.getDb.mockClear()
  state.mergeGuestAccount.mockReset().mockResolvedValue(undefined)
  state.deleteAccountData.mockReset().mockResolvedValue(undefined)
  state.sendEmail
    .mockReset()
    .mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
})

afterEach(() => vi.unstubAllEnvs())

function sessionCookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
}

async function call(path: string, body?: unknown, cookie?: string) {
  const { GET, POST } = await import('@/app/api/auth/[...all]/route')
  const request = new Request(`http://localhost:3000/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: 'http://localhost:3000',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return body === undefined ? GET(request) : POST(request)
}

function verificationPath() {
  const delivery = state.sendEmail.mock.calls.at(-1)?.[0] as { text: string }
  const link = delivery.text.match(/Verify email: (\S+)/)?.[1]
  expect(link).toBeTruthy()
  const url = new URL(link!)
  return `${url.pathname.replace('/api/auth', '')}${url.search}`
}

const credentials = {
  name: 'Passage Reader',
  email: 'reader@example.com',
  password: 'a-realistic-test-password',
  callbackURL: '/passages'
}

async function verifiedAccount() {
  const signup = await call('/sign-up/email', credentials)
  expect(signup.status).toBe(200)
  const result = (await signup.json()) as { user: { id: string } }
  const verification = await call(verificationPath())
  expect(verification.status).toBe(302)
  return { userId: result.user.id, cookie: sessionCookies(verification) }
}

describe('account availability', () => {
  it('imports auth and reports missing runtime setup without touching PostgreSQL', async () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    vi.stubEnv('APP_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    const { GET } = await import('@/app/api/account/config/route')
    const response = GET()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      available: false,
      providers: { google: false, github: false }
    })
    expect(state.getDb).not.toHaveBeenCalled()
    expect((await call('/get-session')).status).toBe(503)
    expect(state.getDb).not.toHaveBeenCalled()
  })

  it('requires both OAuth credentials and never returns their values', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'fixture-google-id')
    vi.stubEnv('GITHUB_CLIENT_ID', 'fixture-github-id')
    vi.stubEnv('GITHUB_CLIENT_SECRET', 'fixture-github-secret')
    const { getAuthConfigurationStatus } = await import('@/lib/auth')
    const status = getAuthConfigurationStatus()
    expect(status.providers).toEqual({ google: false, github: true })
    expect(JSON.stringify(status)).not.toContain('fixture-')
    expect(state.getDb).not.toHaveBeenCalled()
  })

  it('returns deliberate errors for every email identity when delivery is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    for (const email of ['reader@example.com', 'unknown@example.com']) {
      const response = await call('/request-password-reset', { email })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        code: 'EMAIL_AUTH_UNAVAILABLE'
      })
    }
    expect(state.sendEmail).not.toHaveBeenCalled()
    expect(state.getDb).not.toHaveBeenCalled()
  })
})

describe('Better Auth account lifecycle with fixture storage and email', () => {
  it('retains the guest through signup and imports only after email verification', async () => {
    const guest = await call('/sign-in/anonymous', {})
    expect(guest.status).toBe(200)
    const guestBody = (await guest.json()) as {
      user: { id: string; isAnonymous: boolean }
    }
    expect(guestBody.user.isAnonymous).toBe(true)
    const cookie = sessionCookies(guest)
    const signup = await call('/sign-up/email', credentials, cookie)
    expect(signup.status).toBe(200)
    const signupBody = (await signup.json()) as {
      token: null
      user: { id: string }
    }
    expect(signupBody.token).toBeNull()
    expect(state.mergeGuestAccount).not.toHaveBeenCalled()
    const unverifiedSignIn = await call('/sign-in/email', credentials, cookie)
    expect(unverifiedSignIn.status).toBe(403)
    expect(state.mergeGuestAccount).not.toHaveBeenCalled()
    const verified = await call(verificationPath(), undefined, cookie)
    expect(verified.status).toBe(302)
    expect(state.mergeGuestAccount).toHaveBeenCalledExactlyOnceWith(
      guestBody.user.id,
      signupBody.user.id
    )
    const session = await call(
      '/get-session',
      undefined,
      sessionCookies(verified)
    )
    expect(await session.json()).toMatchObject({
      user: { id: signupBody.user.id, emailVerified: true, isAnonymous: false }
    })
    expect(
      state.database.user!.find((user) => user.id === guestBody.user.id)
    ).toBeUndefined()
  })

  it('imports the current guest on login to an existing verified account', async () => {
    const account = await verifiedAccount()
    const guest = await call('/sign-in/anonymous', {})
    const guestBody = (await guest.json()) as { user: { id: string } }
    const signedIn = await call(
      '/sign-in/email',
      credentials,
      sessionCookies(guest)
    )
    expect(signedIn.status).toBe(200)
    expect(state.mergeGuestAccount).toHaveBeenCalledExactlyOnceWith(
      guestBody.user.id,
      account.userId
    )
  })

  it('does not delete guest data when the transactional import fails', async () => {
    await verifiedAccount()
    const guest = await call('/sign-in/anonymous', {})
    const guestBody = (await guest.json()) as { user: { id: string } }
    state.mergeGuestAccount.mockRejectedValue(
      new Error('fixture import unavailable')
    )
    const signedIn = await call(
      '/sign-in/email',
      credentials,
      sessionCookies(guest)
    )
    expect(signedIn.status).toBe(500)
    expect(signedIn.headers.getSetCookie()).toEqual([])
    expect(
      state.database.user!.some((user) => user.id === guestBody.user.id)
    ).toBe(true)
  })

  it('rejects external redirect destinations before sending email', async () => {
    const response = await call('/sign-up/email', {
      ...credentials,
      callbackURL: 'https://attacker.example/'
    })
    expect(response.status).toBe(403)
    expect(state.sendEmail).not.toHaveBeenCalled()
  })

  it('fails visibly when a configured email provider rejects delivery', async () => {
    state.sendEmail.mockResolvedValue({
      data: null,
      error: { message: 'private provider payload' }
    })
    const response = await call('/sign-up/email', credentials)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      code: 'EMAIL_DELIVERY_UNAVAILABLE'
    })
  })

  it('keeps the last sign-in method and runs app cleanup before deleting an account', async () => {
    const account = await verifiedAccount()
    const accounts = (await (
      await call('/list-accounts', undefined, account.cookie)
    ).json()) as { id: string }[]
    const unlink = await call(
      '/unlink-account',
      { accountId: accounts[0]!.id },
      account.cookie
    )
    expect(unlink.status).toBe(400)
    const deletion = await call(
      '/delete-user',
      { password: credentials.password },
      account.cookie
    )
    expect(deletion.status).toBe(200)
    expect(state.deleteAccountData).toHaveBeenCalledExactlyOnceWith(
      account.userId
    )
    expect(
      state.database.user!.some((user) => user.id === account.userId)
    ).toBe(false)
    expect(
      await (await call('/get-session', undefined, account.cookie)).json()
    ).toBeNull()
  })

  it('uses a one-time reset link and revokes existing sessions when the password changes', async () => {
    const account = await verifiedAccount()
    const requested = await call('/request-password-reset', {
      email: credentials.email,
      redirectTo: '/reset-password'
    })
    expect(requested.status).toBe(200)
    const delivery = state.sendEmail.mock.calls.at(-1)![0]
    const link = delivery.text!.match(/Reset password: (\S+)/)![1]!
    const token = new URL(link).pathname.split('/').at(-1)!
    const body = { token, newPassword: 'a-different-realistic-test-password' }
    expect((await call('/reset-password', body)).status).toBe(200)
    expect(
      await (await call('/get-session', undefined, account.cookie)).json()
    ).toBeNull()
    expect((await call('/reset-password', body)).status).toBe(400)
    expect(
      (
        await call('/sign-in/email', {
          ...credentials,
          password: body.newPassword
        })
      ).status
    ).toBe(200)
  })

  it('does not issue sessions to accounts whose deletion has started', async () => {
    const account = await verifiedAccount()
    state.database.user!.find(
      (user) => user.id === account.userId
    )!.deletionRequestedAt = new Date()
    const signin = await call('/sign-in/email', credentials)
    expect(signin.status).toBe(401)
    expect(await signin.json()).toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
  })
})

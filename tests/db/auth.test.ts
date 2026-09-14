import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getAuth } from '@/lib/auth'
import { closeDatabase, getDb } from '@/lib/db'
import { authSessions, authUsers } from '@/lib/db/schema'

const testUrl = process.env.TEST_DATABASE_URL
const userIds: string[] = []

describe.skipIf(!testUrl)('Better Auth PostgreSQL adapter', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', testUrl!)
    vi.stubEnv(
      'BETTER_AUTH_SECRET',
      'fixture-auth-secret-with-more-than-thirty-two-characters'
    )
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
    for (const name of [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'RESEND_API_KEY',
      'EMAIL_FROM'
    ])
      vi.stubEnv(name, '')
  })

  afterAll(async () => {
    if (userIds.length)
      await getDb().delete(authUsers).where(inArray(authUsers.id, userIds))
    await closeDatabase()
    vi.unstubAllEnvs()
  })

  it('persists an anonymous identity and resolves its signed session cookie', async () => {
    const auth = getAuth()
    const guest = await auth.api.signInAnonymous({
      headers: new Headers({ origin: 'http://localhost:3000' }),
      returnHeaders: true
    })
    userIds.push(guest.response.user.id)
    const [storedUser] = await getDb()
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, guest.response.user.id))
    expect(storedUser).toMatchObject({
      isAnonymous: true,
      emailVerified: false,
      deletionRequestedAt: null
    })
    const cookie = guest.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    expect(cookie).toContain('session_token=')
    const session = await auth.api.getSession({
      headers: new Headers({ cookie })
    })
    expect(session?.user).toMatchObject({
      id: storedUser!.id,
      isAnonymous: true
    })
    const [storedSession] = await getDb()
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, storedUser!.id))
    expect(session?.session.id).toBe(storedSession?.id)

    await auth.api.signOut({
      headers: new Headers({ cookie, origin: 'http://localhost:3000' })
    })
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) })
    ).toBeNull()
  })
})

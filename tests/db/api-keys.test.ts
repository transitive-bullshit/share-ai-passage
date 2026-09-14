import { inArray, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getAuth } from '@/lib/auth'
import { resolveActor } from '@/lib/actors'
import { accountRequest } from '@/lib/account-http'
import { GET, POST, DELETE } from '@/app/api/account/keys/route'
import { getDb, closeDatabase } from '@/lib/db'
import { authUsers, authApiKeys } from '@/lib/db/schema'

const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = []
const origin = 'http://localhost:3000'
function request(
  path: string,
  method = 'GET',
  cookie?: string,
  body?: unknown,
  bearer?: string
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie, origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
}

async function session(verified = true) {
  const created = await getAuth().api.signInAnonymous({
    headers: new Headers({ origin }),
    returnHeaders: true
  })
  const userId = created.response.user.id
  users.push(userId)
  if (verified)
    await getDb()
      .update(authUsers)
      .set({ emailVerified: true, isAnonymous: false })
      .where(eq(authUsers.id, userId))
  return {
    userId,
    cookie: created.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
  }
}

describe.skipIf(!testUrl)('PostgreSQL scoped API key lifecycle', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', testUrl!)
    vi.stubEnv(
      'BETTER_AUTH_SECRET',
      'fixture-auth-secret-with-more-than-thirty-two-characters'
    )
    vi.stubEnv('BETTER_AUTH_URL', origin)
  })
  afterAll(async () => {
    if (users.length) {
      await getDb()
        .delete(authApiKeys)
        .where(inArray(authApiKeys.referenceId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
    vi.unstubAllEnvs()
  })

  it('shows the secret once, stores a hash, honors owner scope, and revokes immediately', async () => {
    const owner = await session()
    const other = await session()
    const create = await POST(
      request('/api/account/keys', 'POST', owner.cookie, {
        name: 'Fixture CLI'
      })
    )
    expect(create.status).toBe(200)
    const result = (await create.json()) as { id: string; key: string }
    expect(result.key).toMatch(/^passage_/)
    const [stored] = await getDb()
      .select()
      .from(authApiKeys)
      .where(eq(authApiKeys.id, result.id))
    expect(stored!.key).not.toBe(result.key)
    expect(stored!.referenceId).toBe(owner.userId)
    const listed = await GET(request('/api/account/keys', 'GET', owner.cookie))
    const text = await listed.text()
    expect(text).not.toContain(result.key)
    expect(text).not.toContain(stored!.key)
    expect(text).toContain('Fixture CLI')
    expect(
      await resolveActor(
        request('/api/drafts', 'POST', undefined, {}, result.key)
      )
    ).toMatchObject({
      userId: owner.userId,
      registered: true,
      authentication: 'api-key'
    })
    expect(
      (
        await accountRequest(
          request('/api/drafts', 'POST', undefined, {}, result.key),
          async (actor) => ({ id: actor.userId })
        )
      ).status
    ).toBe(200)
    const otherDelete = await DELETE(
      request('/api/account/keys', 'DELETE', other.cookie, { id: result.id })
    )
    expect(otherDelete.status).not.toBe(200)
    expect(
      (
        await DELETE(
          request('/api/account/keys', 'DELETE', owner.cookie, {
            id: result.id
          })
        )
      ).status
    ).toBe(200)
    await expect(
      resolveActor(
        request('/api/account/usage', 'GET', undefined, undefined, result.key)
      )
    ).rejects.toMatchObject({ status: 401 })
  })

  it('cannot replace a browser session or manage keys, billing, defaults, or another account', async () => {
    const owner = await session()
    const created = await POST(
      request('/api/account/keys', 'POST', owner.cookie, {
        name: 'Scoped fixture'
      })
    )
    const { key } = (await created.json()) as { key: string }
    for (const [path, method] of [
      ['/api/billing', 'GET'],
      ['/api/account/keys', 'GET'],
      ['/api/account/preferences', 'PUT'],
      ['/api/passages', 'GET'],
      ['/api/assets/uploads', 'POST'],
      ['/api/drafts/00000000-0000-4000-8000-000000000001', 'DELETE']
    ])
      await expect(
        resolveActor(request(path!, method!, undefined, undefined, key))
      ).rejects.toMatchObject({ status: 403 })
    expect(
      await getAuth().api.getSession({
        headers: new Headers({
          authorization: `Bearer ${key}`,
          'x-api-key': key
        })
      })
    ).toBeNull()
    const native = await getAuth().handler(
      request('/api/auth/api-key/create', 'POST', owner.cookie, {
        name: 'Bypass',
        permissions: { admin: ['all'] }
      })
    )
    expect(native.status).toBe(404)
    await getDb()
      .update(authUsers)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(authUsers.id, owner.userId))
    await expect(
      resolveActor(
        request('/api/account/usage', 'GET', undefined, undefined, key)
      )
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects guests, cross-site key creation, and invalid bearer fallback to a valid cookie', async () => {
    const guest = await session(false)
    expect(
      (
        await POST(
          request('/api/account/keys', 'POST', guest.cookie, {
            name: 'Guest key'
          })
        )
      ).status
    ).toBe(403)
    const owner = await session()
    const crossSite = request('/api/account/keys', 'POST', owner.cookie, {
      name: 'Cross-site'
    })
    crossSite.headers.set('origin', 'https://elsewhere.example')
    expect((await POST(crossSite)).status).toBe(403)
    await expect(
      resolveActor(
        request('/api/account/usage', 'GET', owner.cookie, undefined, 'invalid')
      )
    ).rejects.toMatchObject({ status: 401 })
  })
})

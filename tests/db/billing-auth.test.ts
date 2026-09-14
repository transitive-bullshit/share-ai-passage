import { createHmac } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { getAuth } from '@/lib/auth'
import { getDb, closeDatabase } from '@/lib/db'
import { authUsers, billingAccounts } from '@/lib/db/schema'

const testUrl = process.env.TEST_DATABASE_URL
const origin = 'http://localhost:3000'
const users: string[] = []
const webhookSecret = 'whsec_fixture_offline'

async function signedIn(verified = true) {
  const result = await getAuth().api.signInAnonymous({
    headers: new Headers({ origin }),
    returnHeaders: true
  })
  const id = result.response.user.id
  users.push(id)
  if (verified)
    await getDb()
      .update(authUsers)
      .set({ isAnonymous: false, emailVerified: true })
      .where(eq(authUsers.id, id))
  return {
    id,
    cookie: result.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
  }
}
function call(
  path: string,
  body: unknown,
  cookie?: string,
  authorization?: string
) {
  return getAuth().handler(
    new Request(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: {
        origin,
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(authorization ? { authorization } : {})
      },
      body: JSON.stringify(body)
    })
  )
}

describe.skipIf(!testUrl)('native Stripe endpoint boundaries', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', testUrl!)
    vi.stubEnv(
      'BETTER_AUTH_SECRET',
      'fixture-auth-secret-with-more-than-thirty-two-characters'
    )
    vi.stubEnv('BETTER_AUTH_URL', origin)
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_offline')
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret)
    for (const key of [
      'STRIPE_PLUS_MONTHLY_PRICE_ID',
      'STRIPE_PLUS_ANNUAL_PRICE_ID',
      'STRIPE_PRO_MONTHLY_PRICE_ID',
      'STRIPE_PRO_ANNUAL_PRICE_ID'
    ])
      vi.stubEnv(key, `price_${key}`)
    // A passing security boundary must never reach a live provider.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Unexpected external request')
      })
    )
  })
  afterAll(async () => {
    if (users.length) {
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('verifies the raw webhook signature before handling an event', async () => {
    const payload = JSON.stringify({
      id: 'evt_fixture_signature',
      type: 'fixture.ignored',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'fixture' } }
    })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex')
    for (const [header, status] of [
      [`t=${timestamp},v1=invalid`, 400],
      [`t=${timestamp},v1=${signature}`, 200]
    ] as const) {
      const response = await getAuth().handler(
        new Request(`${origin}/api/auth/stripe/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': header
          },
          body: payload
        })
      )
      expect(response.status).toBe(status)
    }
  })

  it('rejects unauthenticated, guest and bearer billing requests before Stripe', async () => {
    expect((await call('/subscription/upgrade', { plan: 'plus' })).status).toBe(
      401
    )
    const guest = await signedIn(false)
    expect(
      (await call('/subscription/upgrade', { plan: 'plus' }, guest.cookie))
        .status
    ).toBe(403)
    const owner = await signedIn()
    expect(
      (
        await call(
          '/subscription/upgrade',
          { plan: 'plus' },
          owner.cookie,
          'Bearer fixture'
        )
      ).status
    ).toBe(401)
  })

  it('enforces ownership and period-end downgrades even when native authorizeReference would be skipped', async () => {
    const owner = await signedIn()
    await getDb()
      .insert(billingAccounts)
      .values({
        userId: owner.id,
        stripeSubscriptionId: 'sub_fixture',
        paidPlan: 'pro',
        paidThrough: new Date(Date.now() + 86400_000),
        allowanceAnchorAt: new Date(),
        status: 'active',
        billingInterval: 'month'
      })
    for (const [body, status] of [
      [{ plan: 'plus', referenceId: 'another-user' }, 403],
      [{ plan: 'plus', subscriptionId: 'sub_foreign' }, 400],
      [
        {
          plan: 'plus',
          subscriptionId: 'sub_fixture',
          scheduleAtPeriodEnd: false
        },
        400
      ],
      [
        {
          plan: 'pro',
          subscriptionId: 'sub_fixture',
          annual: true,
          scheduleAtPeriodEnd: false
        },
        400
      ],
      [{ plan: 'pro', subscriptionId: 'sub_fixture', seats: 2 }, 403]
    ] as const)
      expect(
        (await call('/subscription/upgrade', body, owner.cookie)).status
      ).toBe(status)
  })
})

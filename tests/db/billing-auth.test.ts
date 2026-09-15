import type Stripe from 'stripe'
import { createHmac } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { getAuth } from '@/lib/auth'
import { getDb, closeDatabase } from '@/lib/db'
import {
  authUsers,
  billingAccounts,
  billingSubscriptions
} from '@/lib/db/schema'

const provider = vi.hoisted(() => ({
  retrieveSubscription: vi.fn<(id: string) => Promise<unknown>>(),
  listSubscriptions: vi.fn<() => Promise<unknown>>(),
  retrievePrice: vi.fn<(id: string) => Promise<unknown>>(),
  createPortal:
    vi.fn<
      (input: Stripe.BillingPortal.SessionCreateParams) => Promise<unknown>
    >()
}))
vi.mock('@/lib/billing-config', async (original) => {
  const actual = await original<typeof import('@/lib/billing-config')>()
  return {
    ...actual,
    getStripe: () => {
      const client = actual.getStripe()
      client.subscriptions.retrieve =
        provider.retrieveSubscription as typeof client.subscriptions.retrieve
      client.subscriptions.list =
        provider.listSubscriptions as unknown as typeof client.subscriptions.list
      client.prices.retrieve =
        provider.retrievePrice as typeof client.prices.retrieve
      client.billingPortal.sessions.create =
        provider.createPortal as typeof client.billingPortal.sessions.create
      return client
    }
  }
})

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

async function upgradeFixture() {
  const owner = await signedIn()
  const customer = `cus_${owner.id}`
  const subscriptionId = `sub_${owner.id}`
  const periodEnd = new Date(Date.now() + 86400_000)
  await getDb()
    .update(authUsers)
    .set({ stripeCustomerId: customer })
    .where(eq(authUsers.id, owner.id))
  await getDb().insert(billingAccounts).values({
    userId: owner.id,
    stripeCustomerId: customer,
    stripeSubscriptionId: subscriptionId,
    paidPlan: 'plus',
    paidThrough: periodEnd,
    allowanceAnchorAt: new Date(),
    status: 'active',
    billingInterval: 'month'
  })
  await getDb()
    .insert(billingSubscriptions)
    .values({
      id: `mirror_${owner.id}`,
      referenceId: owner.id,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscriptionId,
      plan: 'plus',
      status: 'active',
      periodEnd,
      seats: 1,
      billingInterval: 'month'
    })
  const currentPrice = {
    id: 'price_STRIPE_PLUS_MONTHLY_PRICE_ID',
    active: true,
    currency: 'usd',
    unit_amount: 1000,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' }
  }
  const subscription = {
    id: subscriptionId,
    customer,
    status: 'active',
    livemode: false,
    currency: 'usd',
    items: { data: [{ id: 'si_fixture', quantity: 1, price: currentPrice }] },
    pending_update: null,
    schedule: null
  }
  provider.retrieveSubscription.mockResolvedValue(subscription)
  provider.listSubscriptions.mockResolvedValue({ data: [subscription] })
  const targetPrice = {
    ...currentPrice,
    id: 'price_STRIPE_PRO_MONTHLY_PRICE_ID',
    unit_amount: 2500
  }
  provider.retrievePrice.mockResolvedValue(targetPrice)
  provider.createPortal.mockImplementation(async (input) => {
    if (input.configuration !== 'bpc_upgrade_fixture')
      throw new Error(
        'This subscription cannot be updated because the subscription update feature in the portal configuration is disabled.'
      )
    return {
      id: 'bps_fixture',
      url: 'https://billing.stripe.com/p/session/fixture'
    }
  })
  return { owner, customer, subscriptionId, subscription, targetPrice }
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
    vi.stubEnv('STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID', 'bpc_upgrade_fixture')
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
  beforeEach(() => {
    Object.values(provider).forEach((mock) => mock.mockReset())
  })
  afterAll(async () => {
    if (users.length) {
      await getDb()
        .delete(billingSubscriptions)
        .where(inArray(billingSubscriptions.referenceId, users))
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

  it('uses only the server-owned confirmation configuration for a verified same-interval upgrade', async () => {
    const { owner, customer, subscriptionId } = await upgradeFixture()
    const response = await call(
      '/subscription/upgrade',
      {
        plan: 'pro',
        subscriptionId,
        disableRedirect: true,
        returnUrl: '/account/billing',
        configuration: 'bpc_untrusted'
      },
      owner.cookie
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      url: 'https://billing.stripe.com/p/session/fixture',
      redirect: false
    })
    expect(provider.createPortal).toHaveBeenCalledExactlyOnceWith({
      customer,
      configuration: 'bpc_upgrade_fixture',
      return_url: `${origin}/account/billing`,
      flow_data: {
        type: 'subscription_update_confirm',
        after_completion: {
          type: 'redirect',
          redirect: { return_url: `${origin}/account/billing` }
        },
        subscription_update_confirm: {
          subscription: subscriptionId,
          items: [
            {
              id: 'si_fixture',
              price: 'price_STRIPE_PRO_MONTHLY_PRICE_ID',
              quantity: 1
            }
          ]
        }
      }
    })
  })

  it('requires restoring either scheduled cancellation form before an immediate upgrade', async () => {
    const { owner, subscriptionId, subscription } = await upgradeFixture()
    for (const cancellation of [
      {
        cancel_at: Math.floor(Date.now() / 1000) + 86400,
        cancel_at_period_end: false
      },
      { cancel_at: null, cancel_at_period_end: true }
    ]) {
      provider.retrieveSubscription.mockResolvedValue({
        ...subscription,
        ...cancellation
      })
      const response = await call(
        '/subscription/upgrade',
        {
          plan: 'pro',
          subscriptionId,
          disableRedirect: true
        },
        owner.cookie
      )
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        message: expect.stringContaining('Keep current plan')
      })
    }
    expect(provider.createPortal).not.toHaveBeenCalled()
  })

  it('rejects changed provider ownership, subscription terms and target prices before opening confirmation', async () => {
    const { owner, subscriptionId, subscription, targetPrice } =
      await upgradeFixture()
    const changes = [
      {
        subscription: { ...subscription, schedule: 'sub_sched_fixture' },
        status: 409
      },
      {
        subscription: {
          ...subscription,
          pending_update: { expires_at: 1900000000 }
        },
        status: 409
      },
      {
        subscription: { ...subscription, customer: 'cus_foreign' },
        status: 409
      },
      { subscription: { ...subscription, status: 'past_due' }, status: 409 },
      { subscription: { ...subscription, currency: 'eur' }, status: 409 },
      {
        subscription: {
          ...subscription,
          items: {
            data: [...subscription.items.data, subscription.items.data[0]]
          }
        },
        status: 409
      },
      {
        subscription: {
          ...subscription,
          items: { data: [{ ...subscription.items.data[0], quantity: 2 }] }
        },
        status: 409
      },
      {
        subscription: {
          ...subscription,
          items: {
            data: [
              {
                ...subscription.items.data[0],
                price: {
                  ...subscription.items.data[0]!.price,
                  id: 'price_foreign'
                }
              }
            ]
          }
        },
        status: 409
      },
      {
        subscription: {
          ...subscription,
          items: {
            data: [
              {
                ...subscription.items.data[0],
                price: {
                  ...subscription.items.data[0]!.price,
                  recurring: {
                    ...subscription.items.data[0]!.price.recurring,
                    interval: 'year'
                  }
                }
              }
            ]
          }
        },
        status: 409
      },
      { price: { ...targetPrice, unit_amount: 9900 }, status: 503 },
      { price: { ...targetPrice, currency: 'eur' }, status: 503 },
      {
        price: {
          ...targetPrice,
          recurring: { ...targetPrice.recurring, interval: 'year' }
        },
        status: 503
      }
    ]
    for (const change of changes) {
      provider.retrieveSubscription.mockResolvedValue(
        change.subscription ?? subscription
      )
      provider.retrievePrice.mockResolvedValue(change.price ?? targetPrice)
      const response = await call(
        '/subscription/upgrade',
        { plan: 'pro', subscriptionId },
        owner.cookie
      )
      expect(response.status).toBe(change.status)
      expect(provider.createPortal).not.toHaveBeenCalled()
    }
  })

  it('does not fall back to general Portal configuration when upgrade confirmation is unconfigured', async () => {
    const { owner, subscriptionId } = await upgradeFixture()
    vi.stubEnv('STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID', '')
    try {
      const response = await call(
        '/subscription/upgrade',
        { plan: 'pro', subscriptionId },
        owner.cookie
      )
      expect(response.status).toBe(503)
      expect(provider.createPortal).not.toHaveBeenCalled()
    } finally {
      vi.stubEnv(
        'STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID',
        'bpc_upgrade_fixture'
      )
    }
  })
})

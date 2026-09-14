import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  prepareSubscriptionCheckout,
  subscriptionCheckoutParameters,
  createImagePackCheckout
} from '@/lib/billing-checkout'
import { getDb, closeDatabase } from '@/lib/db'
import { authUsers, billingAccounts, imageCreditGrants } from '@/lib/db/schema'

const fixture = vi.hoisted(() => ({
  customers: [] as { id: string; metadata: { userId: string } }[],
  subscriptions: [] as { status: string }[],
  sessions: [] as {
    id: string
    mode: string
    status: string
    url: string
    metadata: Record<string, string>
  }[],
  customerCreate:
    vi.fn<
      (
        input: object,
        options: { idempotencyKey: string }
      ) => Promise<{ id: string }>
    >(),
  checkoutCreate: vi.fn<
    (
      input: { mode: string; metadata: Record<string, string> },
      options: { idempotencyKey: string }
    ) => Promise<{
      id: string
      status: string
      mode: string
      metadata: Record<string, string>
      url: string
    }>
  >(),
  expire: vi.fn<() => Promise<object>>()
}))
vi.mock('stripe', () => {
  const pages = (items: unknown[]) =>
    (async function* () {
      yield* items
    })()
  return {
    default: class {
      customers = {
        list: () => pages(fixture.customers),
        create: fixture.customerCreate
      }
      subscriptions = { list: () => pages(fixture.subscriptions) }
      checkout = {
        sessions: {
          list: (params: { status?: string }) =>
            pages(
              fixture.sessions.filter(
                (session) => !params.status || session.status === params.status
              )
            ),
          create: fixture.checkoutCreate,
          retrieve: async (id: string) =>
            fixture.sessions.find((session) => session.id === id),
          expire: fixture.expire
        }
      }
    }
  }
})

const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = []
async function owner() {
  const id = randomUUID()
  users.push(id)
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Checkout fixture',
      email: `${id}@example.invalid`,
      emailVerified: true
    })
  return id
}

describe.skipIf(!testUrl)('PostgreSQL Checkout retry identity', () => {
  beforeAll(() => vi.stubEnv('DATABASE_URL', testUrl!))
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_offline')
    for (const key of [
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PLUS_MONTHLY_PRICE_ID',
      'STRIPE_PLUS_ANNUAL_PRICE_ID',
      'STRIPE_PRO_MONTHLY_PRICE_ID',
      'STRIPE_PRO_ANNUAL_PRICE_ID',
      'STRIPE_IMAGE_PACK_PRICE_ID'
    ])
      vi.stubEnv(key, `fixture_${key}`)
    fixture.customers = []
    fixture.sessions = []
    fixture.subscriptions = []
    fixture.customerCreate
      .mockReset()
      .mockImplementation(async (_input, options) => ({
        id: `cus_${options.idempotencyKey}`
      }))
    fixture.checkoutCreate
      .mockReset()
      .mockImplementation(async (input, options) => ({
        id: `cs_${options.idempotencyKey}`,
        status: 'open',
        mode: input.mode,
        metadata: input.metadata,
        url: 'https://checkout.stripe.com/fixture'
      }))
    fixture.expire.mockReset().mockResolvedValue({})
  })
  afterEach(() => {
    // Keep the fixture database selection for cleanup; per-test service configuration is overwritten above.
    vi.clearAllMocks()
  })
  afterAll(async () => {
    if (users.length) {
      await getDb()
        .delete(imageCreditGrants)
        .where(inArray(imageCreditGrants.userId, users))
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
    vi.unstubAllEnvs()
  })

  it('persists one customer before Checkout and retains it while a payment awaits its webhook', async () => {
    const id = await owner()
    const attempts = await Promise.all([
      prepareSubscriptionCheckout(id, 'plus', 'month'),
      prepareSubscriptionCheckout(id, 'plus', 'month')
    ])
    expect(attempts[0]!.customerId).toBe(attempts[1]!.customerId)
    expect(fixture.customerCreate).toHaveBeenCalledTimes(1)
    const [billing] = await getDb()
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, id))
    expect(billing!.stripeCustomerId).toBe(attempts[0]!.customerId)
    expect(billing!.paidPlan).toBe('free')
    fixture.subscriptions = [{ status: 'incomplete' }]
    expect(
      await prepareSubscriptionCheckout(id, 'plus', 'month')
    ).toMatchObject({ pending: true, customerId: billing!.stripeCustomerId })
    expect(fixture.checkoutCreate).not.toHaveBeenCalled()
  })

  it('reuses matching open Checkout and uses the same idempotency key across concurrent plan attempts', async () => {
    const id = await owner()
    await prepareSubscriptionCheckout(id, 'plus', 'month')
    fixture.sessions = [
      {
        id: 'cs_open',
        mode: 'subscription',
        status: 'open',
        url: 'https://checkout.stripe.com/fixture',
        metadata: { passagePlan: 'plus', passageInterval: 'month' }
      }
    ]
    expect(
      await prepareSubscriptionCheckout(id, 'plus', 'month')
    ).toMatchObject({ url: fixture.sessions[0]!.url })
    const [plus, pro] = await Promise.all([
      subscriptionCheckoutParameters(id, 'plus', 'month'),
      subscriptionCheckoutParameters(id, 'pro', 'year')
    ])
    expect(plus.options.idempotencyKey).toBe(pro.options.idempotencyKey)
    await prepareSubscriptionCheckout(id, 'pro', 'year')
    expect(fixture.expire).toHaveBeenCalledWith(
      'cs_open',
      {},
      { idempotencyKey: 'passage-replace-checkout:cs_open' }
    )
    fixture.sessions[0]!.status = 'expired'
    expect(
      (await subscriptionCheckoutParameters(id, 'pro', 'year')).options
        .idempotencyKey
    ).not.toBe(plus.options.idempotencyKey)
  })

  it('retries a pack with the same zero-credit grant and stable Stripe request identity', async () => {
    const id = await owner()
    await prepareSubscriptionCheckout(id, 'plus', 'month')
    await getDb()
      .update(billingAccounts)
      .set({
        paidPlan: 'plus',
        paidThrough: new Date(Date.now() + 86400_000),
        allowanceAnchorAt: new Date(),
        status: 'active'
      })
      .where(eq(billingAccounts.userId, id))
    const key = randomUUID()
    fixture.checkoutCreate.mockRejectedValueOnce(
      new Error('Fixture transport interruption')
    )
    await expect(createImagePackCheckout(id, key)).rejects.toThrow(
      'transport interruption'
    )
    expect(await createImagePackCheckout(id, key)).toEqual({
      url: 'https://checkout.stripe.com/fixture'
    })
    expect(fixture.checkoutCreate.mock.calls[0]![1]).toEqual(
      fixture.checkoutCreate.mock.calls[1]![1]
    )
    const grants = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.userId, id))
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({ allowance: 0, used: 0, reserved: 0 })
  })
})

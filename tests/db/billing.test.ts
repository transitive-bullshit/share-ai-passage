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
import type Stripe from 'stripe'

import { readEntitlements } from '@/lib/billing'
import { deleteAccountData } from '@/lib/accounts'
import {
  reconcileStripeEvent,
  saveBillingCustomer
} from '@/lib/billing-reconciliation'
import { closeDatabase, getDb } from '@/lib/db'
import {
  authUsers,
  billingAccounts,
  billingEvents,
  imageCreditGrants
} from '@/lib/db/schema'

const fixture = vi.hoisted(() => ({
  subscriptions: [] as unknown[],
  invoices: [] as unknown[],
  lines: [] as unknown[],
  sessions: new Map<string, unknown>(),
  schedules: new Map<string, unknown>(),
  disputes: new Map<string, unknown[]>(),
  disputeLookupError: null as Error | null,
  payments: [] as unknown[],
  charges: new Map<string, unknown>(),
  cancel: vi.fn<() => Promise<unknown>>(),
  expire: vi.fn<() => Promise<unknown>>()
}))

vi.mock('stripe', () => {
  const pages = (items: unknown[]) =>
    (async function* () {
      yield* items
    })()
  return {
    default: class {
      subscriptions = {
        list: () => pages(fixture.subscriptions),
        cancel: fixture.cancel
      }
      invoices = {
        list: () => pages(fixture.invoices),
        listLineItems: (id: string) =>
          pages(
            fixture.lines.filter(
              (line) => (line as { invoice: string }).invoice === id
            )
          )
      }
      invoicePayments = { list: () => pages(fixture.payments) }
      charges = { retrieve: async (id: string) => fixture.charges.get(id) }
      disputes = {
        list: ({ charge }: { charge: string; limit: number }) =>
          (async function* () {
            if (fixture.disputeLookupError) throw fixture.disputeLookupError
            yield* fixture.disputes.get(charge) ?? []
          })()
      }
      subscriptionSchedules = {
        retrieve: async (id: string) => fixture.schedules.get(id)
      }
      checkout = {
        sessions: {
          retrieve: async (id: string) => fixture.sessions.get(id),
          list: () => pages([]),
          expire: fixture.expire
        }
      }
    }
  }
})

const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = []
const events: string[] = []
const now = Math.floor(Date.now() / 1000)
const periodEnd = now + 30 * 86400

function paidSubscription(plan = 'plus') {
  fixture.subscriptions = [
    {
      id: 'sub_fixture',
      status: 'active',
      created: now - 86400,
      start_date: now - 86400,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      schedule: null,
      items: {
        data: [
          {
            price: {
              id: `price_${plan}_month`,
              recurring: { interval: 'month' }
            },
            current_period_start: now - 86400,
            current_period_end: periodEnd
          }
        ]
      }
    }
  ]
}

function paidInvoice(plan = 'plus', end = periodEnd) {
  fixture.invoices = [{ id: 'invoice_fixture', status: 'paid' }]
  fixture.lines = [
    {
      invoice: 'invoice_fixture',
      amount: 1000,
      currency: 'usd',
      period: { start: now - 86400, end },
      pricing: { price_details: { price: `price_${plan}_month` } }
    }
  ]
}

function event(
  customer: string,
  type = 'invoice.paid',
  id?: string,
  objectId = 'invoice_fixture'
) {
  const eventId = id ?? `evt_${randomUUID()}`
  events.push(eventId)
  return {
    id: eventId,
    type,
    livemode: false,
    created: now,
    data: { object: { id: objectId, customer } }
  } as Stripe.Event
}

async function account() {
  const id = randomUUID()
  users.push(id)
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Billing fixture',
      email: `${id}@example.invalid`,
      emailVerified: true
    })
  const customer = `cus_${id}`
  await saveBillingCustomer(id, customer)
  return { id, customer }
}

describe.skipIf(!testUrl)(
  'PostgreSQL billing reconciliation with fixture Stripe',
  () => {
    beforeAll(() => {
      process.env.DATABASE_URL = testUrl!
    })
    beforeEach(() => {
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_not_a_credential')
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture')
      for (const plan of ['plus', 'pro'])
        for (const interval of ['month', 'year'])
          vi.stubEnv(
            `STRIPE_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'ANNUAL'}_PRICE_ID`,
            `price_${plan}_${interval}`
          )
      vi.stubEnv('STRIPE_IMAGE_PACK_PRICE_ID', 'price_pack')
      fixture.sessions.clear()
      fixture.schedules.clear()
      fixture.disputes.clear()
      fixture.charges.clear()
      fixture.payments = []
      fixture.disputeLookupError = null
      fixture.cancel.mockReset().mockResolvedValue({})
      fixture.expire.mockReset().mockResolvedValue({})
      paidSubscription()
      paidInvoice()
    })
    afterEach(() => vi.unstubAllEnvs())
    afterAll(async () => {
      if (events.length)
        await getDb()
          .delete(billingEvents)
          .where(inArray(billingEvents.id, events))
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
    })

    it('settles duplicate events once and ignores stale event snapshots in favor of current Stripe state', async () => {
      const owner = await account()
      const initial = event(owner.customer)
      await Promise.all([
        reconcileStripeEvent(initial),
        reconcileStripeEvent(initial)
      ])
      expect(await readEntitlements(owner.id)).toMatchObject({
        plan: 'plus',
        paidActions: true
      })
      const [record] = await getDb()
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, initial.id))
      expect(record!.attempts).toBe(1)
      const [first] = await getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, owner.id))
      paidSubscription('pro')
      paidInvoice('pro')
      const stale = event(owner.customer, 'customer.subscription.updated')
      stale.created -= 86400
      await reconcileStripeEvent(stale)
      expect(await readEntitlements(owner.id)).toMatchObject({
        plan: 'pro',
        allowanceAnchorAt: first!.allowanceAnchorAt
      })
    })

    it('refreshes future phases from schedule-only events and does not revive a released schedule from stale events', async () => {
      const owner = await account()
      paidSubscription('pro')
      paidInvoice('pro')
      const subscription = fixture.subscriptions[0] as {
        schedule: string | null
      }
      subscription.schedule = 'sub_sched_fixture'
      const currentPhase = {
        start_date: now - 86400,
        items: [{ price: 'price_pro_month' }]
      }
      fixture.schedules.set(subscription.schedule, { phases: [currentPhase] })
      await reconcileStripeEvent(
        event(owner.customer, 'customer.subscription.updated')
      )
      const [initial] = await getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, owner.id))
      expect(initial!.pendingPlan).toBeNull()
      fixture.schedules.set(subscription.schedule, {
        phases: [
          currentPhase,
          { start_date: periodEnd, items: [{ price: 'price_plus_year' }] }
        ]
      })
      const changed = event(
        owner.customer,
        'subscription_schedule.updated',
        undefined,
        'sub_sched_fixture'
      )
      await reconcileStripeEvent(changed)
      await reconcileStripeEvent(changed)
      const [scheduled] = await getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, owner.id))
      expect(scheduled).toMatchObject({
        paidPlan: 'pro',
        billingInterval: 'month',
        pendingPlan: 'plus',
        pendingBillingInterval: 'year',
        pendingEffectiveAt: new Date(periodEnd * 1000),
        allowanceAnchorAt: initial!.allowanceAnchorAt,
        paidThrough: initial!.paidThrough
      })
      const [record] = await getDb()
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, changed.id))
      expect(record).toMatchObject({
        attempts: 1,
        processedAt: expect.any(Date)
      })
      subscription.schedule = null
      const released = event(
        owner.customer,
        'subscription_schedule.released',
        undefined,
        'sub_sched_fixture'
      )
      await reconcileStripeEvent(released)
      const stale = event(owner.customer, 'subscription_schedule.updated')
      stale.created -= 86400
      await reconcileStripeEvent(stale)
      const [restored] = await getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, owner.id))
      expect(restored).toMatchObject({
        pendingPlan: null,
        pendingBillingInterval: null,
        pendingEffectiveAt: null,
        paidPlan: 'pro',
        billingInterval: 'month',
        allowanceAnchorAt: initial!.allowanceAnchorAt
      })
    })

    it('retains only the previous paid plan on an unpaid upgrade and suspends access on unpaid renewal', async () => {
      const owner = await account()
      await reconcileStripeEvent(event(owner.customer))
      paidSubscription('pro')
      await reconcileStripeEvent(
        event(owner.customer, 'invoice.payment_failed')
      )
      expect(await readEntitlements(owner.id)).toMatchObject({
        plan: 'plus',
        paidActions: true
      })
      paidInvoice('plus', now - 1)
      await reconcileStripeEvent(
        event(owner.customer, 'invoice.payment_failed')
      )
      expect(await readEntitlements(owner.id)).toMatchObject({
        plan: 'free',
        paidActions: false
      })
    })

    it('does not turn an active subscription without a paid invoice into an allowance', async () => {
      const owner = await account()
      fixture.invoices = []
      await reconcileStripeEvent(
        event(owner.customer, 'customer.subscription.created')
      )
      expect(await readEntitlements(owner.id)).toMatchObject({
        plan: 'free',
        paidActions: false
      })
    })

    it('uses authoritative dispute resolution for paid invoice coverage while retaining refund checks', async () => {
      const owner = await account()
      const charge = {
        id: 'invoice_charge_fixture',
        amount: 1000,
        amount_refunded: 0,
        disputed: true
      }
      fixture.charges.set(charge.id, charge)
      fixture.payments = [{ status: 'paid', payment: { charge: charge.id } }]
      fixture.disputes.set(charge.id, [
        { id: 'du_invoice', status: 'needs_response' }
      ])
      await reconcileStripeEvent(event(owner.customer))
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false,
        plan: 'free'
      })
      fixture.disputes.set(charge.id, [{ id: 'du_invoice', status: 'won' }])
      await reconcileStripeEvent(event(owner.customer, 'charge.dispute.closed'))
      expect(charge.disputed).toBe(true)
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: true,
        plan: 'plus'
      })
      fixture.disputes.set(charge.id, [
        { id: 'du_invoice', status: 'warning_closed' }
      ])
      await reconcileStripeEvent(event(owner.customer, 'charge.dispute.closed'))
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: true
      })
      charge.amount_refunded = 301
      await reconcileStripeEvent(event(owner.customer, 'charge.refunded'))
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: true
      })
      charge.amount_refunded = 1000
      await reconcileStripeEvent(event(owner.customer, 'charge.refunded'))
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false
      })
      charge.amount_refunded = 0
      fixture.disputes.set(charge.id, [{ id: 'du_invoice', status: 'lost' }])
      await reconcileStripeEvent(event(owner.customer, 'charge.dispute.closed'))
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false
      })
    })

    it('keeps late subscription cancellation retryable after account closure', async () => {
      const owner = await account()
      await getDb()
        .update(billingAccounts)
        .set({ closingAt: new Date() })
        .where(eq(billingAccounts.userId, owner.id))
      fixture.cancel.mockRejectedValueOnce(
        new Error('fixture provider unavailable')
      )
      const created = event(owner.customer, 'customer.subscription.created')
      await expect(reconcileStripeEvent(created)).rejects.toThrow(
        'fixture provider unavailable'
      )
      const [pending] = await getDb()
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, created.id))
      expect(pending!.processedAt).toBeNull()
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false
      })
      await reconcileStripeEvent(created)
      expect(fixture.cancel).toHaveBeenCalledTimes(2)
      const [completed] = await getDb()
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, created.id))
      expect(completed!.processedAt).toBeInstanceOf(Date)
    })

    it('rejects mismatched live events before reading payment state', async () => {
      const owner = await account()
      const live = event(owner.customer)
      live.livemode = true
      await expect(reconcileStripeEvent(live)).rejects.toThrow(
        'mode does not match'
      )
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false
      })
    })

    it('retains the real account-deletion marker through cancellation failure and a late webhook after profile removal', async () => {
      const owner = await account()
      fixture.cancel.mockRejectedValueOnce(
        new Error('fixture provider unavailable')
      )
      await expect(deleteAccountData(owner.id)).rejects.toThrow(
        'billing cancellation needs another attempt'
      )
      const [closing] = await getDb()
        .select()
        .from(billingAccounts)
        .where(eq(billingAccounts.userId, owner.id))
      expect(closing!.closingAt).toBeInstanceOf(Date)
      expect(closing!.cancellationCompletedAt).toBeNull()
      expect(closing!.stripeCustomerId).toBe(owner.customer)
      await deleteAccountData(owner.id)
      await getDb().delete(authUsers).where(eq(authUsers.id, owner.id))
      const late = event(owner.customer, 'customer.subscription.created')
      await reconcileStripeEvent(late)
      expect(fixture.cancel).toHaveBeenCalledTimes(3)
      expect(await readEntitlements(owner.id)).toMatchObject({
        paidActions: false
      })
      const [settled] = await getDb()
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, late.id))
      expect(settled!.processedAt).toBeInstanceOf(Date)
    })
  }
)

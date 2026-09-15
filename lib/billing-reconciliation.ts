import { and, eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'

import { accountSubject } from './accounts'
import {
  billingConfiguration,
  getStripe,
  imagePackPriceId,
  planForPrice
} from './billing-config'
import { getDb, type Transaction } from './db'
import {
  authUsers,
  billingAccounts,
  billingEvents,
  imageCreditGrants
} from './db/schema'
import { AppError } from './errors'
import { imagePack, type PaidPlanId } from './plans'
import { lockUsageSubjects } from './usage'

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : (value?.id ?? null)
}

function date(seconds: number | null | undefined) {
  return seconds == null ? null : new Date(seconds * 1000)
}

export async function saveBillingCustomer(userId: string, customerId: string) {
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await tx
      .insert(billingAccounts)
      .values({ userId, stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: billingAccounts.userId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() }
      })
  })
}

async function invoicePaymentAvailable(
  client: Stripe,
  invoice: Stripe.Invoice
) {
  for await (const payment of client.invoicePayments.list({
    invoice: invoice.id,
    limit: 100
  })) {
    if (payment.status !== 'paid') continue
    let charge: Stripe.Charge | null = null
    const intentId = objectId(payment.payment.payment_intent)
    if (intentId) {
      const intent = await client.paymentIntents.retrieve(intentId, {
        expand: ['latest_charge']
      })
      if (intent.latest_charge && typeof intent.latest_charge !== 'string')
        charge = intent.latest_charge
    } else {
      const chargeId = objectId(payment.payment.charge)
      if (chargeId) charge = await client.charges.retrieve(chargeId)
    }
    if (charge && (charge.disputed || charge.amount_refunded >= charge.amount))
      return false
  }
  return true
}

async function paidCoverage(client: Stripe, subscriptionId: string, now: Date) {
  for await (const invoice of client.invoices.list({
    subscription: subscriptionId,
    status: 'paid',
    limit: 100
  })) {
    const candidates: { plan: PaidPlanId; through: Date }[] = []
    for await (const line of client.invoices.listLineItems(invoice.id, {
      limit: 100
    })) {
      const plan = planForPrice(
        objectId(line.pricing?.price_details?.price) ?? ''
      )
      if (
        plan &&
        line.amount >= 0 &&
        line.currency === 'usd' &&
        line.period.start * 1000 <= now.getTime() &&
        line.period.end * 1000 > now.getTime()
      )
        candidates.push({
          plan: plan.plan,
          through: new Date(line.period.end * 1000)
        })
    }
    if (!candidates.length || !(await invoicePaymentAvailable(client, invoice)))
      continue
    // Paid upgrade invoices can contain a credited old item and a new item.
    const paid = candidates.sort((a, b) =>
      a.plan === b.plan
        ? b.through.getTime() - a.through.getTime()
        : a.plan === 'pro'
          ? -1
          : 1
    )[0]!
    return { ...paid, invoiceId: invoice.id }
  }
  return null
}

async function reconcileCustomer(
  tx: Transaction,
  userId: string,
  customerId: string,
  client: Stripe
) {
  const now = new Date()
  const [existing] = await tx
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  const subscriptions: Stripe.Subscription[] = []
  for await (const subscription of client.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100
  })) {
    if (subscription.items.data.some((item) => planForPrice(item.price.id)))
      subscriptions.push(subscription)
  }
  const renewable = subscriptions.filter(
    (sub) => !['canceled', 'incomplete_expired'].includes(sub.status)
  )
  if (renewable.length > 1)
    throw new AppError('More than one subscription needs billing review.', 409)
  const subscription =
    renewable[0] ?? subscriptions.sort((a, b) => b.created - a.created)[0]
  const item = subscription?.items.data.find((entry) =>
    planForPrice(entry.price.id)
  )
  const coverage = subscription
    ? await paidCoverage(client, subscription.id, now)
    : null
  let pendingPlan: PaidPlanId | null = null
  let pendingBillingInterval: string | null = null
  let pendingEffectiveAt: Date | null = null
  const scheduleId = objectId(subscription?.schedule)
  if (scheduleId) {
    const schedule = await client.subscriptionSchedules.retrieve(scheduleId)
    const next = schedule.phases.find(
      (phase) => phase.start_date > Math.floor(now.getTime() / 1000)
    )
    const nextPlan = next?.items
      .map((entry) => planForPrice(objectId(entry.price) ?? ''))
      .find(Boolean)
    if (next && nextPlan) {
      pendingPlan = nextPlan.plan
      pendingBillingInterval = nextPlan.interval
      pendingEffectiveAt = new Date(next.start_date * 1000)
    }
  }
  const values = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription?.id ?? null,
    paidPlan: coverage?.plan ?? ('free' as const),
    paidThrough: coverage?.through ?? null,
    paidInvoiceId: coverage?.invoiceId ?? null,
    allowanceAnchorAt:
      existing?.allowanceAnchorAt ??
      (coverage && subscription ? date(subscription.start_date) : null),
    periodStart: date(item?.current_period_start),
    periodEnd: date(item?.current_period_end),
    status: subscription?.status ?? 'free',
    billingInterval: item?.price.recurring?.interval ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
    cancelAt: date(subscription?.cancel_at),
    canceledAt: date(subscription?.canceled_at),
    endedAt: date(subscription?.ended_at),
    pendingPlan,
    pendingBillingInterval,
    pendingEffectiveAt,
    reconciledAt: now,
    updatedAt: now
  }
  await tx
    .insert(billingAccounts)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: billingAccounts.userId, set: values })
  const needsCancellation = Boolean(existing?.closingAt && renewable.length)
  if (needsCancellation)
    await tx
      .update(billingAccounts)
      .set({ cancellationCompletedAt: null })
      .where(eq(billingAccounts.userId, userId))
  return needsCancellation
}

async function reconcilePack(
  tx: Transaction,
  userId: string,
  sessionId: string,
  client: Stripe
) {
  const session = await client.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'payment_intent.latest_charge']
  })
  if (session.mode !== 'payment' || session.metadata?.kind !== 'image-pack')
    return
  const grantId = session.metadata.passagePackGrantId
  const [grant] = grantId
    ? await tx
        .select()
        .from(imageCreditGrants)
        .where(
          and(
            eq(imageCreditGrants.id, grantId),
            eq(imageCreditGrants.userId, userId)
          )
        )
    : []
  if (
    !grant ||
    grant.kind !== 'pack' ||
    session.metadata.passageUserId !== userId
  )
    throw new AppError('This image purchase needs billing review.', 409)
  const line = session.line_items?.data[0]
  if (
    session.line_items?.has_more ||
    session.line_items?.data.length !== 1 ||
    line?.price?.id !== imagePackPriceId() ||
    line.quantity !== 1 ||
    session.currency !== 'usd' ||
    session.amount_subtotal !== imagePack.priceCents
  )
    throw new AppError(
      'This image purchase does not match the configured pack.',
      409
    )
  if (session.payment_status !== 'paid') return
  const intent = session.payment_intent
  if (!intent || typeof intent === 'string' || intent.status !== 'succeeded')
    return
  const charge = intent.latest_charge
  if (!charge || typeof charge === 'string')
    throw new AppError('Payment confirmation is pending.', 409)
  const revoked = charge.disputed
    ? imagePack.generations
    : Math.min(
        imagePack.generations,
        Math.ceil(
          (imagePack.generations * charge.amount_refunded) / charge.amount
        )
      )
  await tx
    .update(imageCreditGrants)
    .set({
      allowance: imagePack.generations,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: intent.id,
      paidCents: session.amount_total,
      currency: session.currency,
      refundedCents: charge.amount_refunded,
      disputed: charge.disputed,
      revoked,
      updatedAt: new Date()
    })
    .where(eq(imageCreditGrants.id, grant.id))
}

async function eventCustomer(event: Stripe.Event, client: Stripe) {
  const object = event.data.object as {
    customer?: string | { id: string } | null
    charge?: string | { id: string } | null
  }
  const customer = objectId(object.customer)
  if (customer) return customer
  const chargeId = objectId(object.charge)
  return chargeId
    ? objectId((await client.charges.retrieve(chargeId)).customer)
    : null
}

const reconciledTypes = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'subscription_schedule.created',
  'subscription_schedule.updated',
  'subscription_schedule.released',
  'subscription_schedule.canceled',
  'subscription_schedule.completed',
  'subscription_schedule.aborted',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'refund.updated',
  'refund.failed'
])

/** Called only after native Stripe signature verification; this function grants no redirect-based access. */
export async function reconcileStripeEvent(event: Stripe.Event) {
  if (!reconciledTypes.has(event.type)) return
  const eventObjectId = 'id' in event.data.object ? event.data.object.id : null
  if (typeof eventObjectId !== 'string')
    throw new AppError('Billing event has no object identity.', 400)
  const config = billingConfiguration()
  if (event.livemode !== (config.mode === 'live'))
    throw new AppError(
      'Billing event mode does not match this environment.',
      400
    )
  const client = getStripe()
  const customerId = await eventCustomer(event, client)
  if (!customerId) return
  const [existing] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.stripeCustomerId, customerId))
  const [user] = existing
    ? []
    : await getDb()
        .select({ id: authUsers.id })
        .from(authUsers)
        .where(eq(authUsers.stripeCustomerId, customerId))
  const userId = existing?.userId ?? user?.id
  if (!userId) return
  await getDb()
    .insert(billingEvents)
    .values({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      objectId: eventObjectId,
      customerId,
      stripeCreatedAt: new Date(event.created * 1000)
    })
    .onConflictDoNothing()
  try {
    const needsCancellation = await getDb().transaction(async (tx) => {
      // Serialize retrieval and commit, so an older webhook cannot overwrite a newer snapshot.
      await lockUsageSubjects(tx, accountSubject(userId))
      const [record] = await tx
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.id, event.id))
        .for('update')
      if (record?.processedAt) return false
      if (event.type.startsWith('checkout.session.'))
        await reconcilePack(tx, userId, eventObjectId, client)
      else if (
        event.type.startsWith('charge.') ||
        event.type.startsWith('refund.')
      ) {
        const packs = await tx
          .select()
          .from(imageCreditGrants)
          .where(
            and(
              eq(imageCreditGrants.userId, userId),
              eq(imageCreditGrants.kind, 'pack')
            )
          )
        for (const pack of packs)
          if (pack.stripeCheckoutSessionId)
            await reconcilePack(
              tx,
              userId,
              pack.stripeCheckoutSessionId,
              client
            )
      }
      const closing = await reconcileCustomer(tx, userId, customerId, client)
      await tx
        .update(billingEvents)
        .set({
          processedAt: closing ? null : new Date(),
          attempts: sql`${billingEvents.attempts} + 1`,
          lastError: null
        })
        .where(eq(billingEvents.id, event.id))
      return closing
    })
    if (needsCancellation) {
      await cancelAccountSubscriptions(userId)
      await getDb().transaction(async (tx) => {
        await lockUsageSubjects(tx, accountSubject(userId))
        await tx
          .update(billingAccounts)
          .set({ cancellationCompletedAt: new Date() })
          .where(eq(billingAccounts.userId, userId))
        await tx
          .update(billingEvents)
          .set({ processedAt: new Date(), lastError: null })
          .where(eq(billingEvents.id, event.id))
      })
    }
  } catch (err) {
    await getDb()
      .update(billingEvents)
      .set({
        attempts: sql`${billingEvents.attempts} + 1`,
        lastError: 'Billing reconciliation failed; retry this event.'
      })
      .where(eq(billingEvents.id, event.id))
    throw err
  }
}

export async function reconcileBillingAccount(userId: string) {
  const [account] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  if (!account?.stripeCustomerId) return
  const client = getStripe()
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await reconcileCustomer(tx, userId, account.stripeCustomerId!, client)
  })
}

/** Called by the durable account-deletion orchestrator, outside its DB transaction. */
export async function cancelAccountSubscriptions(userId: string) {
  const [account] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  if (!account?.stripeCustomerId) return
  const client = getStripe()
  for await (const subscription of client.subscriptions.list({
    customer: account.stripeCustomerId,
    status: 'all',
    limit: 100
  }))
    if (!['canceled', 'incomplete_expired'].includes(subscription.status))
      await client.subscriptions.cancel(
        subscription.id,
        {},
        { idempotencyKey: `passage-delete:${userId}:${subscription.id}` }
      )
  for await (const checkout of client.checkout.sessions.list({
    customer: account.stripeCustomerId,
    status: 'open',
    limit: 100
  }))
    await client.checkout.sessions.expire(
      checkout.id,
      {},
      { idempotencyKey: `passage-delete-checkout:${checkout.id}` }
    )
}

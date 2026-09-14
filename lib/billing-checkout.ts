import { and, eq } from 'drizzle-orm'
import type Stripe from 'stripe'

import { accountSubject } from './accounts'
import { requirePaidAccount } from './billing'
import {
  getStripe,
  imagePackPriceId,
  requireBillingCheckout
} from './billing-config'
import { appUrl } from './config'
import { getDb } from './db'
import { authUsers, billingAccounts, imageCreditGrants } from './db/schema'
import { AppError } from './errors'
import { lockUsageSubjects } from './usage'
import type { BillingInterval } from './billing-config'
import type { PaidPlanId } from './plans'

/** Save the customer before Checkout can exist, so account closure can always find it. */
export async function prepareSubscriptionCheckout(
  userId: string,
  plan: PaidPlanId,
  interval: BillingInterval
) {
  const stripe = getStripe()
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    const [user] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
    const [billing] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
    if (
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt ||
      billing?.closingAt
    )
      throw new AppError('This account is unavailable.', 403)
    let customerId = billing?.stripeCustomerId || user.stripeCustomerId
    if (!customerId) {
      for await (const customer of stripe.customers.list({
        email: user.email,
        limit: 100
      })) {
        if (customer.metadata.userId === userId) {
          customerId = customer.id
          break
        }
      }
      customerId ??= (
        await stripe.customers.create(
          {
            email: user.email,
            name: user.name,
            metadata: { userId, customerType: 'user' }
          },
          { idempotencyKey: `passage-customer:${userId}` }
        )
      ).id
    }
    await tx
      .insert(billingAccounts)
      .values({ userId, stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: billingAccounts.userId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() }
      })
    await tx
      .update(authUsers)
      .set({ stripeCustomerId: customerId })
      .where(eq(authUsers.id, userId))
    for await (const subscription of stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100
    })) {
      if (!['canceled', 'incomplete_expired'].includes(subscription.status))
        return { customerId, url: null, pending: true }
    }
    for await (const session of stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 100
    })) {
      if (session.mode !== 'subscription') continue
      if (
        session.metadata?.passagePlan === plan &&
        session.metadata.passageInterval === interval &&
        session.url
      )
        return { customerId, url: session.url }
      await stripe.checkout.sessions.expire(
        session.id,
        {},
        { idempotencyKey: `passage-replace-checkout:${session.id}` }
      )
    }
    return { customerId, url: null }
  })
}

export async function subscriptionCheckoutParameters(
  userId: string,
  plan: string,
  interval: BillingInterval
) {
  const [billing] = await getDb()
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  if (!billing?.stripeCustomerId || billing.closingAt)
    throw new AppError('This account is unavailable.', 403)
  let expiredAttempt = 'none'
  // Expired Checkout sessions cannot be paid; a new explicit attempt can use a new identity.
  for await (const session of getStripe().checkout.sessions.list({
    customer: billing.stripeCustomerId,
    status: 'expired',
    limit: 100
  })) {
    if (session.mode === 'subscription') {
      expiredAttempt = session.id
      break
    }
  }
  return {
    params: {
      allow_promotion_codes: false,
      metadata: { passagePlan: plan, passageInterval: interval }
    },
    options: {
      idempotencyKey: `passage-subscription:${userId}:${billing.stripeSubscriptionId || 'first'}:${expiredAttempt}`
    }
  }
}

/** A zero-credit grant records purchase identity before a provider request. Only payment reconciliation fills it. */
export async function createImagePackCheckout(
  userId: string,
  requestKey: string
) {
  requireBillingCheckout(true)
  const { grant, customerId } = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requirePaidAccount(userId, tx)
    const [billing] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
    if (!billing?.stripeCustomerId)
      throw new AppError('Billing is not ready. Please try again.', 409)
    const grantKey = `pack:${userId}:${requestKey}`
    await tx
      .insert(imageCreditGrants)
      .values({
        userId,
        grantKey,
        kind: 'pack',
        startsAt: new Date(),
        allowance: 0
      })
      .onConflictDoNothing()
    const [saved] = await tx
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.grantKey, grantKey))
    return { grant: saved!, customerId: billing.stripeCustomerId }
  })
  const stripe = getStripe()
  if (grant.stripeCheckoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(
      grant.stripeCheckoutSessionId
    )
    if (session.status === 'complete') return { alreadyPurchased: true }
    if (session.status === 'open' && session.url) return { url: session.url }
    if (session.status === 'expired') return { expired: true }
    throw new AppError(
      'This checkout expired. Start a new image-pack purchase.',
      409
    )
  }
  // Find a previously accepted request before reusing Stripe's bounded idempotency cache.
  let existingSession: Stripe.Checkout.Session | null = null
  for await (const session of stripe.checkout.sessions.list({
    customer: customerId,
    limit: 100
  })) {
    if (session.metadata?.passagePackGrantId === grant.id) {
      existingSession = session
      break
    }
  }
  if (
    !existingSession &&
    Date.now() - grant.createdAt.getTime() > 23 * 60 * 60 * 1000
  )
    throw new AppError(
      'This purchase needs billing review before it can be retried.',
      409
    )
  const session =
    existingSession ??
    (await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: imagePackPriceId(), quantity: 1 }],
        allow_promotion_codes: false,
        success_url: `${appUrl()}/account/billing?pack=complete`,
        cancel_url: `${appUrl()}/account/billing`,
        metadata: {
          kind: 'image-pack',
          passageUserId: userId,
          passagePackGrantId: grant.id
        }
      },
      { idempotencyKey: `passage-pack:${grant.id}` }
    ))
  const closing = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await tx
      .update(imageCreditGrants)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(
        and(
          eq(imageCreditGrants.id, grant.id),
          eq(imageCreditGrants.userId, userId)
        )
      )
    const [billing] = await tx
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
    return Boolean(billing?.closingAt)
  })
  if (closing) {
    if (session.status === 'open')
      await stripe.checkout.sessions.expire(session.id)
    throw new AppError('This account is closing.', 403)
  }
  if (session.status === 'complete') return { alreadyPurchased: true }
  if (session.status === 'expired') return { expired: true }
  if (!session.url)
    throw new AppError('Checkout is unavailable. Please try again.', 503)
  return { url: session.url }
}

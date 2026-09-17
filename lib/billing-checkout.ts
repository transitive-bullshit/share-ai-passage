import { eq } from 'drizzle-orm'

import { accountSubject } from './accounts'
import { getStripe } from './billing-config'
import { getDb } from './db'
import { authUsers, billingAccounts } from './db/schema'
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

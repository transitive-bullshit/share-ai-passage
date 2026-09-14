import { stripe } from '@better-auth/stripe'
import {
  APIError,
  createAuthMiddleware,
  sessionMiddleware
} from 'better-auth/api'
import { eq } from 'drizzle-orm'

import { readEntitlements } from './billing'
import {
  prepareSubscriptionCheckout,
  subscriptionCheckoutParameters
} from './billing-checkout'
import {
  billingConfiguration,
  billingPriceId,
  getStripe,
  requireBillingCheckout
} from './billing-config'
import { reconcileStripeEvent } from './billing-reconciliation'
import { getDb } from './db'
import { authUsers, billingAccounts } from './db/schema'
import { isPaidPlan, paidPlanIds, planCatalog } from './plans'
import { AppError } from './errors'

/** The native plugin skips authorizeReference for own-user references. */
const guardBilling = createAuthMiddleware(
  { use: [sessionMiddleware] },
  async (ctx) => {
    const session = ctx.context.session
    if (
      !session ||
      !ctx.headers?.get('cookie') ||
      ctx.headers.get('x-api-key') ||
      ctx.headers.get('authorization')
    )
      throw new APIError('UNAUTHORIZED', {
        message: 'Sign in to manage billing.'
      })
    const [user] = await getDb()
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, session.user.id))
    if (
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt
    )
      throw new APIError('FORBIDDEN', {
        message: 'A verified account is required.'
      })
    const input = ctx.body ?? ctx.query ?? {}
    if (
      (input.referenceId && input.referenceId !== user.id) ||
      (input.customerType && input.customerType !== 'user') ||
      (input.seats !== undefined && input.seats !== 1) ||
      input.metadata
    )
      throw new APIError('FORBIDDEN', {
        message: 'Manage billing for your own account.'
      })
    const [billing] = await getDb()
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, user.id))
    if (billing?.closingAt)
      throw new APIError('FORBIDDEN', { message: 'This account is closing.' })
    if (ctx.path !== '/subscription/upgrade') return
    try {
      requireBillingCheckout()
    } catch {
      throw new APIError('SERVICE_UNAVAILABLE', {
        message: 'Paid plans are not available yet.'
      })
    }
    const plan: unknown = input.plan
    if (!isPaidPlan(plan))
      throw new APIError('BAD_REQUEST', { message: 'Choose Plus or Pro.' })
    const active =
      billing?.stripeSubscriptionId &&
      !['canceled', 'incomplete_expired', 'free'].includes(billing.status)
    if (active && input.subscriptionId !== billing.stripeSubscriptionId)
      throw new APIError('BAD_REQUEST', {
        message: 'Use your current subscription when changing plans.'
      })
    if (!active && input.subscriptionId)
      throw new APIError('BAD_REQUEST', {
        message: 'This subscription is not available.'
      })
    if (active && !['active', 'trialing'].includes(billing.status))
      throw new APIError('CONFLICT', {
        message:
          'Resolve your current payment in Manage billing before changing plans.'
      })
    const entitlements = await readEntitlements(user.id)
    const interval = input.annual ? 'year' : 'month'
    const deferred =
      active &&
      (planCatalog[plan].summaryGenerations < entitlements.summaryLimit ||
        (billing.billingInterval && interval !== billing.billingInterval))
    if (deferred && input.scheduleAtPeriodEnd !== true)
      throw new APIError('BAD_REQUEST', {
        message:
          'Downgrades and billing interval changes take effect at period end.'
      })
    if (!active) {
      try {
        const checkout = await prepareSubscriptionCheckout(
          user.id,
          plan,
          interval
        )
        ctx.context.session.user.stripeCustomerId = checkout.customerId
        if (checkout.pending)
          throw new AppError(
            'Your subscription is being confirmed. Refresh billing before starting another checkout.',
            409
          )
        if (checkout.url)
          return ctx.json({ url: checkout.url, redirect: false })
      } catch (err) {
        throw new APIError(
          err instanceof AppError && err.status === 409
            ? 'CONFLICT'
            : 'SERVICE_UNAVAILABLE',
          {
            message:
              err instanceof AppError
                ? err.message
                : 'Checkout could not start. Please try again.'
          }
        )
      }
    }
  }
)

export function createBillingAuthPlugin() {
  if (!billingConfiguration().configured) return null
  const plugin = stripe({
    stripeClient: getStripe(),
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!.trim(),
    createCustomerOnSignUp: false,
    subscription: {
      enabled: true,
      requireEmailVerification: true,
      plans: paidPlanIds.map((id) => ({
        name: id,
        priceId: billingPriceId(id, 'month'),
        annualDiscountPriceId: billingPriceId(id, 'year')
      })),
      authorizeReference: async ({ user, referenceId }) =>
        user.id === referenceId,
      getCheckoutSessionParams: ({ user, plan }, _request, ctx) =>
        subscriptionCheckoutParameters(
          user.id,
          plan.name,
          ctx.body.annual ? 'year' : 'month'
        )
    },
    onCustomerCreate: async ({ user, stripeCustomer }) => {
      // Customer creation alone grants no access. Webhook reconciliation owns payment state.
      const { saveBillingCustomer } = await import('./billing-reconciliation')
      await saveBillingCustomer(user.id, stripeCustomer.id)
    },
    onEvent: reconcileStripeEvent
  })
  return {
    ...plugin,
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) =>
            Boolean(ctx.path?.startsWith('/subscription/')),
          handler: guardBilling
        }
      ]
    }
  }
}

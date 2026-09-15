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
  requireBillingCheckout,
  type BillingInterval
} from './billing-config'
import { reconcileStripeEvent } from './billing-reconciliation'
import { getDb } from './db'
import { authUsers, billingAccounts } from './db/schema'
import { isPaidPlan, paidPlanIds, planCatalog, type PaidPlanId } from './plans'
import { AppError } from './errors'

/** A separate Portal configuration permits only the upgrade selected here;
 * general billing management must keep subscription updates disabled. */
async function upgradeConfirmation(
  billing: typeof billingAccounts.$inferSelect,
  plan: PaidPlanId,
  interval: BillingInterval,
  returnUrl: string
) {
  const configuration =
    process.env.STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID?.trim()
  if (!configuration)
    throw new APIError('SERVICE_UNAVAILABLE', {
      message:
        'Plan upgrades are not configured yet. Your current plan remains active.'
    })
  if (
    !billing.stripeCustomerId ||
    !billing.stripeSubscriptionId ||
    !isPaidPlan(billing.paidPlan) ||
    billing.billingInterval !== interval
  )
    throw new APIError('CONFLICT', {
      message: 'Refresh billing before changing this subscription.'
    })
  const client = getStripe()
  const subscription = await client.subscriptions.retrieve(
    billing.stripeSubscriptionId
  )
  const item = subscription.items.data[0]
  const currentPrice = item?.price
  const expectedAmount = (id: PaidPlanId) =>
    interval === 'year'
      ? planCatalog[id].annualPriceCents
      : planCatalog[id].monthlyPriceCents
  const targetPriceId = billingPriceId(plan, interval)
  if (
    subscription.id !== billing.stripeSubscriptionId ||
    subscription.customer !== billing.stripeCustomerId ||
    subscription.status !== 'active' ||
    subscription.livemode !== (billingConfiguration().mode === 'live') ||
    subscription.currency !== 'usd' ||
    subscription.items.data.length !== 1 ||
    item?.quantity !== 1 ||
    currentPrice?.id !== billingPriceId(billing.paidPlan, interval) ||
    currentPrice.currency !== 'usd' ||
    currentPrice.unit_amount !== expectedAmount(billing.paidPlan) ||
    currentPrice.recurring?.interval !== interval ||
    currentPrice.recurring.interval_count !== 1 ||
    currentPrice.recurring.usage_type !== 'licensed' ||
    expectedAmount(plan) <= expectedAmount(billing.paidPlan)
  )
    throw new APIError('CONFLICT', {
      message: 'Your subscription changed. Refresh billing before upgrading.'
    })
  if (subscription.cancel_at || subscription.cancel_at_period_end)
    throw new APIError('CONFLICT', {
      message:
        'Your plan is scheduled to end. Choose Keep current plan before upgrading.'
    })
  if (subscription.schedule)
    throw new APIError('CONFLICT', {
      message:
        'A billing change is scheduled. Choose Keep current plan before upgrading.'
    })
  if (subscription.pending_update)
    throw new APIError('CONFLICT', {
      message:
        'A subscription payment is still pending. Resolve it in Manage billing before upgrading.'
    })
  const price = await client.prices.retrieve(targetPriceId)
  if (
    price.id !== targetPriceId ||
    !price.active ||
    price.currency !== 'usd' ||
    price.unit_amount !== expectedAmount(plan) ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== 'licensed'
  )
    throw new APIError('SERVICE_UNAVAILABLE', {
      message: 'This upgrade price is not available.'
    })
  return client.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    configuration,
    return_url: returnUrl,
    flow_data: {
      type: 'subscription_update_confirm',
      after_completion: {
        type: 'redirect',
        redirect: { return_url: returnUrl }
      },
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [{ id: item.id, price: price.id, quantity: 1 }]
      }
    }
  })
}

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
    if (
      active &&
      !deferred &&
      input.scheduleAtPeriodEnd !== true &&
      planCatalog[plan].summaryGenerations > entitlements.summaryLimit
    ) {
      if (!entitlements.paidActions)
        throw new APIError('CONFLICT', {
          message: 'Confirm your current payment before upgrading.'
        })
      try {
        const portal = await upgradeConfirmation(
          billing,
          plan,
          interval,
          new URL('/account/billing', ctx.context.baseURL).href
        )
        return ctx.json({ url: portal.url, redirect: !input.disableRedirect })
      } catch (err) {
        if (err instanceof APIError) throw err
        throw new APIError('SERVICE_UNAVAILABLE', {
          message:
            'Upgrade confirmation could not start. Your current plan remains active.'
        })
      }
    }
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

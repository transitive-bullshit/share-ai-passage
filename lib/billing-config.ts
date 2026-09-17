import Stripe from 'stripe'

import { AppError } from './errors'
import type { PaidPlanId } from './plans'

export type BillingInterval = 'month' | 'year'

const priceVariables = {
  plus: {
    month: 'STRIPE_PLUS_MONTHLY_PRICE_ID',
    year: 'STRIPE_PLUS_ANNUAL_PRICE_ID'
  },
  pro: {
    month: 'STRIPE_PRO_MONTHLY_PRICE_ID',
    year: 'STRIPE_PRO_ANNUAL_PRICE_ID'
  }
} as const

export function billingPriceId(plan: PaidPlanId, interval: BillingInterval) {
  return process.env[priceVariables[plan][interval]]?.trim() || ''
}

export function billingConfiguration() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() || ''
  const mode = secret.startsWith('sk_test_')
    ? 'test'
    : secret.startsWith('sk_live_')
      ? 'live'
      : null
  const configured = Boolean(
    mode &&
    process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
    Object.values(priceVariables).every((variables) =>
      Object.values(variables).every((name) => process.env[name]?.trim())
    )
  )
  const checkoutEnabled =
    configured &&
    (mode === 'test' || process.env.STRIPE_LIVE_CHECKOUT_ENABLED === 'true')
  return {
    configured,
    mode,
    checkoutEnabled
  }
}

export function requireBillingCheckout() {
  const config = billingConfiguration()
  if (!config.checkoutEnabled)
    throw new AppError(
      'Paid plans are not available yet. Your saved work remains available.',
      503,
      undefined,
      { code: 'BILLING_UNAVAILABLE' }
    )
}

/** No environment reads or Stripe client construction at import time. */
export function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secret || !/^(sk_test_|sk_live_)/.test(secret))
    throw new AppError('Billing is not configured.', 503, undefined, {
      code: 'BILLING_UNAVAILABLE'
    })
  return new Stripe(secret, { maxNetworkRetries: 0, timeout: 15_000 })
}

export function planForPrice(priceId: string) {
  for (const plan of ['plus', 'pro'] as const)
    for (const interval of ['month', 'year'] as const)
      if (billingPriceId(plan, interval) === priceId) return { plan, interval }
  return null
}

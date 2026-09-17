import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { billingRequest } from '@/lib/billing-http'
import {
  billingConfiguration,
  requireBillingCheckout
} from '@/lib/billing-config'
import { readEntitlements } from '@/lib/billing'
import { getDb } from '@/lib/db'
import { billingAccounts } from '@/lib/db/schema'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import { planCatalog } from '@/lib/plans'

type NativeBillingBody = {
  plan?: 'plus' | 'pro'
  annual?: boolean
  subscriptionId?: string | null
  scheduleAtPeriodEnd?: boolean
  successUrl?: string
  cancelUrl?: string
  returnUrl?: string
  disableRedirect?: boolean
}

const actionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('change'),
    plan: z.enum(['plus', 'pro']),
    interval: z.enum(['month', 'year'])
  }),
  z.strictObject({ action: z.enum(['cancel', 'restore', 'portal']) })
])

export function POST(request: Request) {
  return billingRequest(request, async (userId) => {
    const parsed = actionSchema.safeParse(await readJson(request))
    if (!parsed.success) throw new AppError('Choose a billing action.')
    const input = parsed.data
    if (!billingConfiguration().configured)
      throw new AppError('Billing is not configured.', 503, undefined, {
        code: 'BILLING_UNAVAILABLE'
      })
    const [billing] = await getDb()
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, userId))
    const active =
      billing?.stripeSubscriptionId &&
      !['canceled', 'incomplete_expired', 'free'].includes(billing.status)
    let path: string
    let body: NativeBillingBody
    if (input.action === 'change') {
      requireBillingCheckout()
      const entitlements = await readEntitlements(userId)
      path = 'upgrade'
      body = {
        plan: input.plan,
        annual: input.interval === 'year',
        scheduleAtPeriodEnd: Boolean(
          active &&
          (planCatalog[input.plan].summaryGenerations <
            entitlements.summaryLimit ||
            (billing.billingInterval &&
              input.interval !== billing.billingInterval))
        ),
        successUrl: '/account/billing?checkout=complete',
        cancelUrl: '/account/billing',
        returnUrl: '/account/billing',
        disableRedirect: true
      }
      if (active) body.subscriptionId = billing.stripeSubscriptionId
    } else {
      if (!billing?.stripeCustomerId)
        throw new AppError('No billing account exists yet.', 409)
      if (input.action !== 'portal' && !active)
        throw new AppError('No active subscription is available.', 409)
      path = input.action === 'portal' ? 'billing-portal' : input.action
      body = {}
      if (input.action !== 'portal')
        body.subscriptionId = billing.stripeSubscriptionId
      if (input.action !== 'restore') body.returnUrl = '/account/billing'
    }
    const { getAuth } = await import('@/lib/auth')
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    return getAuth().handler(
      new Request(new URL(`/api/auth/subscription/${path}`, request.url), {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
    )
  })
}

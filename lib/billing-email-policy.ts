import type { BillingInterval } from './billing-config'
import { isPaidPlan, planCatalog, type PaidPlanId, type PlanId } from './plans'

/** Payment-confirmed state, independent of Stripe's latest unpaid price changes. */
export type BillingEmailState = {
  subscriptionId: string | null
  plan: PlanId
  interval: BillingInterval | null
  ended?: boolean
  paidThrough?: string | null
  cancellation: { effectiveAt: string | null } | null
  scheduledChange: {
    plan: PaidPlanId
    interval: BillingInterval
    effectiveAt: string
  } | null
  paymentIssue: boolean
}

export type BillingEmailMessage = {
  subject: string
  paragraphs: string[]
  billingUrl: string
}

function planDescription(plan: PaidPlanId, interval: BillingInterval | null) {
  const entry = planCatalog[plan]
  const annual = interval === 'year'
  const price =
    (annual ? entry.annualPriceCents : entry.monthlyPriceCents) / 100
  return `${entry.name} ($${price} USD/${annual ? 'year' : 'month'})`
}

function effectiveDate(value: string | null) {
  return value
    ? ` on ${new Intl.DateTimeFormat('en-US', {
        dateStyle: 'long',
        timeZone: 'UTC'
      }).format(new Date(value))} (UTC)`
    : ' at the end of your billing period'
}

/** Ignore routine renewals, metadata updates and unpaid Checkout attempts. */
export function subscriptionEmailChange(
  previous: BillingEmailState | null,
  current: BillingEmailState
): Omit<BillingEmailMessage, 'billingUrl'> | null {
  const wasPaid = previous && isPaidPlan(previous.plan)
  const paid = isPaidPlan(current.plan)
  if (!wasPaid && !paid) return null
  const paragraphs: string[] = []
  let subject = 'Your Passage subscription is updated'
  const planChanged =
    previous?.plan !== current.plan ||
    previous?.interval !== current.interval ||
    previous?.subscriptionId !== current.subscriptionId
  if (planChanged) {
    if (isPaidPlan(current.plan)) {
      subject = wasPaid
        ? 'Your Passage plan has changed'
        : `Your Passage ${planCatalog[current.plan].name} plan is active`
      paragraphs.push(
        `Your ${planDescription(current.plan, current.interval)} plan is active.`
      )
      paragraphs.push(
        `Your plan includes ${planCatalog[current.plan].summaryGenerations} summary generations each month and custom card templates, uploaded backgrounds, and branding.`
      )
    } else {
      subject = 'Your Passage plan is now Free'
      paragraphs.push(
        'Your paid access has ended. Your account is now on Free, and your saved passages remain available.'
      )
    }
  }
  if (
    JSON.stringify(previous?.cancellation ?? null) !==
    JSON.stringify(current.cancellation)
  ) {
    if (current.cancellation && !current.ended) {
      subject = 'Your Passage subscription is scheduled to end'
      paragraphs.push(
        `Your subscription is scheduled to end${effectiveDate(current.cancellation.effectiveAt)}. Your saved passages remain available. You can keep your subscription from Plans and billing before it ends.`
      )
    } else if (paid && !planChanged && !current.ended) {
      subject = 'Your Passage subscription will continue'
      paragraphs.push(
        'Your scheduled cancellation has been removed. Your subscription will continue renewing.'
      )
    }
  }
  if (
    JSON.stringify(previous?.scheduledChange ?? null) !==
    JSON.stringify(current.scheduledChange)
  ) {
    if (current.scheduledChange && !current.ended) {
      subject = 'Your Passage plan change is scheduled'
      const change = current.scheduledChange
      paragraphs.push(
        `Your subscription will change to ${planDescription(change.plan, change.interval)}${effectiveDate(change.effectiveAt)}. You can remove this scheduled change from Plans and billing before it takes effect.`
      )
    } else if (paid && !planChanged && !current.ended) {
      subject = 'Your scheduled Passage plan change was removed'
      paragraphs.push(
        'Your scheduled plan change has been removed. Your current plan and billing cycle will continue.'
      )
    }
  }
  if (current.ended && !previous?.ended) {
    subject = 'Your Passage subscription has ended'
    paragraphs.push(
      `Your subscription has ended and will not renew.${paid ? ` Paid access remains available and ends${effectiveDate(current.paidThrough ?? null)}.` : ''} Your saved passages remain available.`
    )
  }
  if (current.paymentIssue && !previous?.paymentIssue && !current.ended) {
    subject = 'Your Passage subscription needs payment attention'
    paragraphs.push(
      'Stripe could not complete your subscription payment. Review your payment method and invoices in Plans and billing. Paid features depend on confirmed payment coverage.'
    )
  } else if (
    previous?.paymentIssue &&
    !current.paymentIssue &&
    paid &&
    !current.ended
  ) {
    paragraphs.push('Your subscription payment issue has been resolved.')
    if (!planChanged)
      subject = 'Your Passage subscription payment has recovered'
  }
  if (!paragraphs.length) return null
  paragraphs.push(
    'Review Plans and billing for your current subscription and Stripe invoices, including any taxes or prorated charges.'
  )
  return { subject, paragraphs }
}

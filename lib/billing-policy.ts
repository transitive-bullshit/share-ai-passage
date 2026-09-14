import { isPaidPlan, planCatalog, type PlanId } from './plans'
import { utcUsagePeriod } from './usage-policy'

/** Each boundary uses the original day, so January 31 becomes Feb 28, then March 31. */
export function anchoredAllowanceWindow(anchor: Date, now = new Date()) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isFinite(now.getTime()))
    throw new Error('Invalid billing date.')
  function boundary(offset: number) {
    const month = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1)
    )
    const lastDay = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)
    ).getUTCDate()
    return new Date(
      Date.UTC(
        month.getUTCFullYear(),
        month.getUTCMonth(),
        Math.min(anchor.getUTCDate(), lastDay),
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds()
      )
    )
  }
  let offset = Math.max(
    0,
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      anchor.getUTCMonth()
  )
  if (offset > 0 && boundary(offset) > now) offset--
  return { startsAt: boundary(offset), endsAt: boundary(offset + 1) }
}

export type ConfirmedBillingState = {
  paidPlan: string
  paidThrough: Date | null
  allowanceAnchorAt: Date | null
  closingAt: Date | null
  endedAt: Date | null
  cancelAt: Date | null
}

export function entitlementsFromBilling(
  state: ConfirmedBillingState | null,
  now = new Date()
) {
  const paidActions = Boolean(
    state &&
    !state.closingAt &&
    isPaidPlan(state.paidPlan) &&
    state.paidThrough &&
    state.paidThrough > now &&
    (!state.endedAt || state.endedAt > now) &&
    (!state.cancelAt || state.cancelAt > now)
  )
  const plan: PlanId =
    paidActions && state && isPaidPlan(state.paidPlan) ? state.paidPlan : 'free'
  return {
    plan,
    paidActions,
    paidThrough: state?.paidThrough ?? null,
    allowanceAnchorAt: state?.allowanceAnchorAt ?? null,
    allowanceWindow:
      paidActions && state?.allowanceAnchorAt
        ? anchoredAllowanceWindow(state.allowanceAnchorAt, now)
        : utcUsagePeriod(now),
    summaryLimit: planCatalog[plan].summaryGenerations,
    imageLimit: planCatalog[plan].imageGenerations
  }
}

export type BillingEntitlements = ReturnType<typeof entitlementsFromBilling>

import { AppError } from './errors'
import { imagePack, type PaidPlanId } from './plans'

// Operational ceilings from the launch's 70% contribution scenario, including
// the stated US payment-fee and non-model reserves. These are admission limits,
// not provider-enforced caps or guarantees about merchant/serving costs.
const subscriptionCeilings = {
  plus: { month: 1_840_000, year: 1_587_000 },
  pro: { month: 5_300_000, year: 4_255_000 }
} as const
const packCeilingMicros = 2_210_000

export function subscriptionAiSpendLimit(
  plan: PaidPlanId,
  interval: string | null
) {
  // Missing historical cadence uses the more conservative annual allowance.
  return subscriptionCeilings[plan][interval === 'month' ? 'month' : 'year']
}

export type PackFunding = {
  paidCents: number | null
  refundedCents: number
  disputed: boolean
  currency: string
}

/** Taxes never increase funding; refunds/disputes reduce it without erasing cost. */
export function purchasedAiSpendLimit(grants: PackFunding[]) {
  return grants.reduce((total, grant) => {
    const paid = grant.paidCents
    if (
      grant.disputed ||
      grant.currency !== 'usd' ||
      paid === null ||
      !Number.isSafeInteger(paid) ||
      paid <= 0 ||
      !Number.isSafeInteger(grant.refundedCents) ||
      grant.refundedCents < 0
    )
      return total
    const net = Math.max(0, paid - grant.refundedCents)
    const funded =
      (BigInt(packCeilingMicros) *
        BigInt(Math.min(paid, imagePack.priceCents)) *
        BigInt(net)) /
      (BigInt(imagePack.priceCents) * BigInt(paid))
    return total + Number(funded)
  }, 0)
}

export type AiSpending = {
  scope: 'subscription' | 'purchased-images'
  limitMicros: number
  liabilityMicros: number
  resetAt?: Date
}

export function aiSpendingAvailable(spending: AiSpending, nextMicros: number) {
  return spending.liabilityMicros + nextMicros <= spending.limitMicros
}

export function aiSpendingPause(
  spending: Pick<AiSpending, 'scope' | 'resetAt'>
) {
  return new AppError(
    spending.scope === 'subscription'
      ? 'AI generation is temporarily paused after unusually high processing costs. Your remaining generations and saved work are unchanged.'
      : 'AI backgrounds from purchased credits are paused after unusually high processing costs. Your remaining image credits and saved work are unchanged.',
    429,
    60,
    {
      code: 'AI_SPEND_LIMIT',
      resetAt: spending.resetAt?.toISOString()
    }
  )
}

export function requireAiSpending(spending: AiSpending, nextMicros: number) {
  if (!aiSpendingAvailable(spending, nextMicros))
    throw aiSpendingPause(spending)
}

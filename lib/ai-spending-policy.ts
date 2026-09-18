import { AppError } from './errors'
import type { PaidPlanId } from './plans'

// Operational ceilings from the launch's 70% contribution scenario, including
// the stated US payment-fee and non-model reserves. These are admission limits,
// not provider-enforced caps or guarantees about merchant/serving costs.
const subscriptionCeilings = {
  plus: { month: 1_840_000, year: 1_587_000 },
  pro: { month: 5_300_000, year: 4_255_000 }
} as const

export function subscriptionAiSpendLimit(
  plan: PaidPlanId,
  interval: string | null
) {
  // Missing historical cadence uses the more conservative annual allowance.
  return subscriptionCeilings[plan][interval === 'month' ? 'month' : 'year']
}

export type AiSpending = {
  scope: 'subscription'
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
    'Summary generation is temporarily paused after unusually high processing costs. Your remaining generations and saved work are unchanged.',
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

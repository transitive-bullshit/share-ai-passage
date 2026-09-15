import type { LanguageModelUsage } from 'ai'

import { AppError } from './errors'

export const SUMMARY_RESERVATION_MICROS = 20_000
export const FREE_AI_MONTHLY_BUDGET_MICROS = 25_000_000

// The configured nano task accepts <=20,000 UTF-16 units (<=60,000 UTF-8
// bytes), plus <=20,000 tokens for instructions/schema/framing, and <=700
// output tokens. At $0.20/$1.25 per million tokens this is <=16,875 micros.
// The dispatcher must reject unpriced model overrides and changes to these
// input/output bounds; this reservation is not an average cost estimate.
export function utcUsagePeriod(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid usage date.')
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  return {
    startsAt: new Date(Date.UTC(year, month, 1)),
    endsAt: new Date(Date.UTC(year, month + 1, 1))
  }
}

export function validateCostMicros(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647) {
    throw new Error('Generation cost must be a nonnegative integer in micros.')
  }
  return value
}

export function validateSummaryAllowance(allowance: number) {
  if (![5, 25, 100, 300].includes(allowance)) {
    throw new Error('Summary allowance must match a supported plan.')
  }
}

export function usageLimitError(endsAt: Date, now: Date, global = false) {
  return new AppError(
    global
      ? 'Free AI generation is paused until the monthly service budget resets. Saved work and publishing remain available.'
      : 'You have used this month’s summary generations. Saved work and publishing remain available.',
    429,
    Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 1000)),
    {
      code: global ? 'FREE_BUDGET_LIMIT' : 'SUMMARY_LIMIT',
      resetAt: endsAt.toISOString(),
      billingUrl: '/account/billing'
    }
  )
}

/** Nano only: price observed totals conservatively, including cached input at full rate. */
export function nanoSummaryCostMicros(
  usage: Pick<LanguageModelUsage, 'inputTokens' | 'outputTokens'> | undefined
): number | null {
  const input = usage?.inputTokens
  const output = usage?.outputTokens
  if (
    input === undefined ||
    output === undefined ||
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    input < 0 ||
    output < 0
  )
    return null
  // $0.20/M input and $1.25/M output, rounded up to a whole micro-dollar.
  // Integer weighting avoids rounding a fractional micro down through FP error.
  const weighted = input * 4 + output * 25
  if (!Number.isSafeInteger(weighted)) return null
  const cost = Math.ceil(weighted / 20)
  return cost <= 2_147_483_647 ? cost : null
}

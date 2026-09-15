import { describe, expect, it } from 'vitest'

import {
  aiSpendingAvailable,
  aiSpendingPause,
  purchasedAiSpendLimit,
  subscriptionAiSpendLimit
} from '@/lib/ai-spending-policy'

const funded = {
  paidCents: 1000,
  refundedCents: 0,
  disputed: false,
  currency: 'usd'
}

describe('AI spending admission policy', () => {
  it('uses the chosen monthly ceilings and conservative cadence fallback', () => {
    expect(subscriptionAiSpendLimit('plus', 'month')).toBe(1_840_000)
    expect(subscriptionAiSpendLimit('plus', 'year')).toBe(1_587_000)
    expect(subscriptionAiSpendLimit('pro', 'month')).toBe(5_300_000)
    expect(subscriptionAiSpendLimit('pro', 'year')).toBe(4_255_000)
    expect(subscriptionAiSpendLimit('plus', null)).toBe(1_587_000)
    expect(subscriptionAiSpendLimit('pro', 'unknown')).toBe(4_255_000)
  })

  it.each([
    { paidCents: 1000, refundedCents: 0, expected: 2_210_000 },
    { paidCents: 1100, refundedCents: 0, expected: 2_210_000 },
    { paidCents: 1100, refundedCents: 550, expected: 1_105_000 },
    { paidCents: 1000, refundedCents: 301, expected: 1_544_790 },
    { paidCents: 900, refundedCents: 0, expected: 1_989_000 }
  ])(
    'funds paid=$paidCents/refunded=$refundedCents without treating tax as income',
    ({ paidCents, refundedCents, expected }) => {
      expect(
        purchasedAiSpendLimit([{ ...funded, paidCents, refundedCents }])
      ).toBe(expected)
    }
  )

  it('pools funded packs while missing payment, dispute, non-USD and full refund contribute nothing', () => {
    expect(
      purchasedAiSpendLimit([
        funded,
        { ...funded, refundedCents: 500 },
        { ...funded, paidCents: null },
        { ...funded, disputed: true },
        { ...funded, currency: 'eur' },
        { ...funded, refundedCents: 1000 },
        { ...funded, refundedCents: 1200 }
      ])
    ).toBe(3_315_000)
  })

  it('admits the exact budget boundary and reports a definite pause with only a real reset date', () => {
    const spending = {
      scope: 'subscription' as const,
      limitMicros: 1_840_000,
      liabilityMicros: 1_820_000
    }
    expect(aiSpendingAvailable(spending, 20_000)).toBe(true)
    expect(aiSpendingAvailable(spending, 20_001)).toBe(false)
    const resetAt = new Date('2026-10-15T00:00:00.000Z')
    expect(aiSpendingPause({ ...spending, resetAt })).toMatchObject({
      status: 429,
      retryAfter: 60,
      details: { code: 'AI_SPEND_LIMIT', resetAt: resetAt.toISOString() }
    })
    expect(
      aiSpendingPause({ scope: 'purchased-images' }).details?.resetAt
    ).toBeUndefined()
  })
})

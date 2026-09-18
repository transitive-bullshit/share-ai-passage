import { describe, expect, it } from 'vitest'

import {
  getSummaryMonthlyBudgetMicros,
  nanoSummaryCostMicros,
  utcUsagePeriod,
  usageLimitError,
  validateCostMicros,
  validateSummaryAllowance
} from '@/lib/usage-policy'

describe('summary usage policy', () => {
  it('accepts explicit positive service budgets and leaves defaults unchanged when unset', () => {
    expect(getSummaryMonthlyBudgetMicros({})).toBeNull()
    expect(
      getSummaryMonthlyBudgetMicros({ SUMMARY_AI_MONTHLY_BUDGET_USD: ' ' })
    ).toBeNull()
    expect(
      getSummaryMonthlyBudgetMicros({ SUMMARY_AI_MONTHLY_BUDGET_USD: '1' })
    ).toBe(1_000_000)
    expect(
      getSummaryMonthlyBudgetMicros({
        SUMMARY_AI_MONTHLY_BUDGET_USD: '0.000001'
      })
    ).toBe(1)
    for (const value of ['0', '-1', 'NaN', '1e3', '0.0000001', '2147.483648'])
      expect(() =>
        getSummaryMonthlyBudgetMicros({ SUMMARY_AI_MONTHLY_BUDGET_USD: value })
      ).toThrow()
    expect(
      usageLimitError(new Date('2028-02-01'), new Date('2028-01-15'), 'service')
    ).toMatchObject({
      status: 429,
      details: { code: 'SUMMARY_BUDGET_LIMIT' }
    })
  })
  it('uses the UTC calendar month independently of the caller timezone', () => {
    expect(utcUsagePeriod(new Date('2028-03-01T00:30:00+07:00'))).toEqual({
      startsAt: new Date('2028-02-01T00:00:00Z'),
      endsAt: new Date('2028-03-01T00:00:00Z')
    })
    expect(utcUsagePeriod(new Date('2028-12-31T23:59:59.999Z'))).toEqual({
      startsAt: new Date('2028-12-01T00:00:00Z'),
      endsAt: new Date('2029-01-01T00:00:00Z')
    })
    expect(utcUsagePeriod(new Date('2029-01-01T00:00:00Z')).startsAt).toEqual(
      new Date('2029-01-01T00:00:00Z')
    )
  })

  it('prices observed token totals without discounting cache or discarding reasoning output', () => {
    expect(
      nanoSummaryCostMicros({ inputTokens: 6_000, outputTokens: 300 })
    ).toBe(1_575)
    expect(nanoSummaryCostMicros({ inputTokens: 1, outputTokens: 1 })).toBe(2)
    expect(nanoSummaryCostMicros({ inputTokens: 0, outputTokens: 0 })).toBe(0)
    expect(
      nanoSummaryCostMicros({ inputTokens: 80_000, outputTokens: 700 })
    ).toBe(16_875)
  })

  it('keeps cost unknown when provider counters are incomplete or malformed', () => {
    expect(nanoSummaryCostMicros(undefined)).toBeNull()
    expect(
      nanoSummaryCostMicros({ inputTokens: undefined, outputTokens: 20 })
    ).toBeNull()
    expect(
      nanoSummaryCostMicros({ inputTokens: 20, outputTokens: undefined })
    ).toBeNull()
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(
        nanoSummaryCostMicros({ inputTokens: value, outputTokens: 20 })
      ).toBeNull()
      expect(
        nanoSummaryCostMicros({ inputTokens: 20, outputTokens: value })
      ).toBeNull()
    }
  })

  it('rejects costs that would corrupt integer accounting', () => {
    for (const value of [-1, 0.5, NaN, Infinity, 2_147_483_648]) {
      expect(() => validateCostMicros(value)).toThrow()
    }
    expect(validateCostMicros(0)).toBe(0)
    expect(validateCostMicros(25_000_000)).toBe(25_000_000)
  })

  it('rejects unsupported allowances and invalid dates', () => {
    for (const allowance of [0, 1, 99, 301, Infinity]) {
      expect(() => validateSummaryAllowance(allowance)).toThrow()
    }
    expect(() => validateSummaryAllowance(5)).not.toThrow()
    expect(() => validateSummaryAllowance(25)).not.toThrow()
    expect(() => utcUsagePeriod(new Date('invalid'))).toThrow()
  })

  it('reports the remaining time without extending the reset boundary', () => {
    const error = usageLimitError(
      new Date('2029-01-01T00:00:00Z'),
      new Date('2028-12-31T23:59:59.500Z')
    )
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(1)
    expect(error.message).toContain(
      'Saved work and publishing remain available'
    )
  })
})

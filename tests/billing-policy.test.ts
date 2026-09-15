import { afterEach, describe, expect, it, vi } from 'vitest'

import { billingConfiguration } from '@/lib/billing-config'
import {
  anchoredAllowanceWindow,
  entitlementsFromBilling
} from '@/lib/billing-policy'

afterEach(() => vi.unstubAllEnvs())

describe('monthly paid allowances and payment coverage', () => {
  it('clamps each month from the original anchor instead of drifting after February', () => {
    const anchor = new Date('2027-01-31T14:05:06Z')
    expect(
      anchoredAllowanceWindow(anchor, new Date('2027-03-15T00:00:00Z'))
    ).toEqual({
      startsAt: new Date('2027-02-28T14:05:06Z'),
      endsAt: new Date('2027-03-31T14:05:06Z')
    })
    expect(
      anchoredAllowanceWindow(anchor, new Date('2028-02-29T14:05:06Z'))
    ).toEqual({
      startsAt: new Date('2028-02-29T14:05:06Z'),
      endsAt: new Date('2028-03-31T14:05:06Z')
    })
  })

  it('keeps annual allowance monthly and returns Free exactly when paid coverage expires', () => {
    const state = {
      paidPlan: 'plus',
      paidThrough: new Date('2028-01-31T14:05:06Z'),
      allowanceAnchorAt: new Date('2027-01-31T14:05:06Z'),
      closingAt: null,
      endedAt: null,
      cancelAt: null
    }
    expect(
      entitlementsFromBilling(state, new Date('2027-05-01T00:00:00Z'))
    ).toMatchObject({
      plan: 'plus',
      summaryLimit: 100,
      imageLimit: 10,
      allowanceWindow: {
        startsAt: new Date('2027-04-30T14:05:06Z'),
        endsAt: new Date('2027-05-31T14:05:06Z')
      }
    })
    expect(entitlementsFromBilling(state, state.paidThrough)).toMatchObject({
      plan: 'free',
      paidActions: false,
      summaryLimit: 25,
      imageLimit: 0
    })
  })

  it('blocks paid actions immediately for closing or terminated accounts without deleting their stored design data', () => {
    const now = new Date('2027-03-01T00:00:00Z')
    const state = {
      paidPlan: 'pro',
      paidThrough: new Date('2028-01-01T00:00:00Z'),
      allowanceAnchorAt: new Date('2027-01-01T00:00:00Z'),
      closingAt: null,
      endedAt: null,
      cancelAt: null
    }
    for (const change of [
      { closingAt: now },
      { endedAt: now },
      { cancelAt: now }
    ])
      expect(
        entitlementsFromBilling({ ...state, ...change }, now).paidActions
      ).toBe(false)
    expect(
      entitlementsFromBilling(
        { ...state, cancelAt: new Date('2027-04-01T00:00:00Z') },
        now
      ).paidActions
    ).toBe(true)
  })

  it('does not expose live Checkout until the explicit launch switch is enabled', () => {
    for (const key of [
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PLUS_MONTHLY_PRICE_ID',
      'STRIPE_PLUS_ANNUAL_PRICE_ID',
      'STRIPE_PRO_MONTHLY_PRICE_ID',
      'STRIPE_PRO_ANNUAL_PRICE_ID',
      'STRIPE_IMAGE_PACK_PRICE_ID'
    ])
      vi.stubEnv(key, 'fixture-value')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture_not_a_credential')
    vi.stubEnv('STRIPE_LIVE_CHECKOUT_ENABLED', '')
    expect(billingConfiguration()).toMatchObject({
      configured: true,
      checkoutEnabled: false,
      packsEnabled: false
    })
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_not_a_credential')
    expect(billingConfiguration()).toMatchObject({
      checkoutEnabled: true,
      packsEnabled: true
    })
  })
})

import { expect, it } from 'vitest'

import {
  subscriptionEmailChange,
  type BillingEmailState
} from '@/lib/billing-email-policy'

const free: BillingEmailState = {
  subscriptionId: null,
  plan: 'free',
  interval: null,
  cancellation: null,
  scheduledChange: null,
  paymentIssue: false
}
const plus: BillingEmailState = {
  ...free,
  subscriptionId: 'sub_fixture',
  plan: 'plus',
  interval: 'month'
}
const end = '2026-10-15T12:00:00.000Z'

it('announces confirmed paid activation with the catalog price and allowance', () => {
  expect(subscriptionEmailChange(free, plus)).toMatchObject({
    subject: 'Your Passage Plus plan is active',
    paragraphs: expect.arrayContaining([
      'Your Plus ($10 USD/month) plan is active.',
      expect.stringContaining('100 summary generations each month')
    ])
  })
  expect(
    subscriptionEmailChange(null, { ...plus, plan: 'pro', interval: 'year' })
      ?.paragraphs
  ).toContain('Your Pro ($240 USD/year) plan is active.')
})

it('does not announce free defaults, incomplete Checkout, or unchanged renewals', () => {
  expect(subscriptionEmailChange(null, free)).toBeNull()
  expect(
    subscriptionEmailChange(free, {
      ...free,
      subscriptionId: 'sub_incomplete',
      paymentIssue: true
    })
  ).toBeNull()
  expect(subscriptionEmailChange(plus, { ...plus })).toBeNull()
})

it('distinguishes effective upgrades and billing cadence changes', () => {
  expect(
    subscriptionEmailChange(plus, { ...plus, plan: 'pro' })?.paragraphs
  ).toContain('Your Pro ($25 USD/month) plan is active.')
  expect(
    subscriptionEmailChange(plus, { ...plus, interval: 'year' })?.paragraphs
  ).toContain('Your Plus ($96 USD/year) plan is active.')
})

it('explains scheduled cancellation, its removal and eventual loss of paid access', () => {
  const canceled = { ...plus, cancellation: { effectiveAt: end } }
  expect(subscriptionEmailChange(plus, canceled)).toMatchObject({
    subject: 'Your Passage subscription is scheduled to end',
    paragraphs: expect.arrayContaining([
      expect.stringContaining('October 15, 2026 (UTC)')
    ])
  })
  expect(subscriptionEmailChange(canceled, plus)?.subject).toBe(
    'Your Passage subscription will continue'
  )
  const ended = subscriptionEmailChange(canceled, free)
  expect(ended?.subject).toBe('Your Passage plan is now Free')
  expect(ended?.paragraphs.join(' ')).toContain(
    'saved passages remain available'
  )
})

it('announces a future downgrade and its removal or application without claiming early access', () => {
  const pro = { ...plus, plan: 'pro' as const }
  const scheduled: BillingEmailState = {
    ...pro,
    scheduledChange: { plan: 'plus', interval: 'year', effectiveAt: end }
  }
  const notice = subscriptionEmailChange(pro, scheduled)
  expect(notice?.subject).toBe('Your Passage plan change is scheduled')
  expect(notice?.paragraphs.join(' ')).toContain(
    'will change to Plus ($96 USD/year) on October 15, 2026 (UTC)'
  )
  expect(subscriptionEmailChange(scheduled, pro)?.subject).toBe(
    'Your scheduled Passage plan change was removed'
  )
  expect(
    subscriptionEmailChange(scheduled, { ...plus, interval: 'year' })?.subject
  ).toBe('Your Passage plan has changed')
})

it('does not call an immediate cancellation a restoration or payment recovery while prepaid access remains', () => {
  const previous = {
    ...plus,
    paymentIssue: true,
    cancellation: { effectiveAt: end }
  }
  const notice = subscriptionEmailChange(previous, {
    ...plus,
    ended: true,
    paidThrough: end
  })
  expect(notice?.subject).toBe('Your Passage subscription has ended')
  expect(notice?.paragraphs.join(' ')).toContain(
    'Paid access remains available and ends on October 15, 2026 (UTC)'
  )
  expect(notice?.paragraphs.join(' ')).not.toContain('will continue renewing')
  expect(notice?.paragraphs.join(' ')).not.toContain(
    'payment issue has been resolved'
  )
})

it('reports payment failure and recovery, without claiming a refund cancels the subscription', () => {
  const failed = { ...plus, paymentIssue: true }
  expect(subscriptionEmailChange(plus, failed)?.subject).toContain(
    'payment attention'
  )
  expect(subscriptionEmailChange(failed, plus)?.subject).toContain(
    'payment has recovered'
  )
  const refunded = subscriptionEmailChange(plus, {
    ...free,
    subscriptionId: plus.subscriptionId
  })
  expect(refunded?.subject).toBe('Your Passage plan is now Free')
  expect(refunded?.paragraphs.join(' ')).not.toContain('cancelled')
})

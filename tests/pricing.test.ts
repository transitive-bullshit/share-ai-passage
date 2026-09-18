// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import BillingPage from '@/app/account/billing/page'
import { BillingSettings } from '@/components/billing-settings'
import { PricingPlans } from '@/components/pricing-plans'

const account = vi.hoisted(() => ({
  user: null as {
    id: string
    emailVerified: boolean
    isAnonymous: boolean
  } | null,
  isPending: false
}))
vi.mock('@/components/account-session', () => ({
  useAccountSession: () => ({
    data: account.user ? { user: account.user } : null,
    isPending: account.isPending
  })
}))

let container: HTMLDivElement
let root: Root
let requests: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  account.user = null
  account.isPending = false
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  requests = vi.fn<typeof fetch>(() => {
    throw new Error('Public pricing must not make account or billing requests')
  })
  vi.stubGlobal('fetch', requests)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function link(label: string) {
  const result = [...container.querySelectorAll('a')].find(
    (element) => element.textContent?.trim() === label
  )
  expect(result).toBeDefined()
  return result!
}
function interval(label: string) {
  const group = container.querySelector('[aria-label="Billing interval"]')
  expect(group).not.toBeNull()
  const button = [...group!.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label
  )
  expect(button).toBeDefined()
  return button!
}

it('switches annual totals and monthly equivalents with matching cadence links and no billing requests', async () => {
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  expect(
    [...container.querySelectorAll('h2, h3')].map(
      (element) => element.textContent
    )
  ).toEqual(expect.arrayContaining(['Free', 'Plus', 'Pro']))
  expect(link('Choose Plus').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(link('Choose Pro').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(link('Create a free account').getAttribute('href')).toBe(
    '/sign-up?returnTo=%2Fpassages'
  )
  expect(
    container.querySelector('[aria-labelledby="pricing-plus"]')!.textContent
  ).toContain('$10 / month')
  expect(
    container.querySelector('[aria-labelledby="pricing-pro"]')!.textContent
  ).toContain('$25 / month')
  expect(container.textContent).not.toContain('$96 billed annually')
  await act(async () => interval('Annual · Save 20%').click())
  expect(container.textContent).toContain('$96 billed annually')
  expect(container.textContent).toContain('$240 billed annually')
  expect(
    container.querySelector('[aria-labelledby="pricing-plus"]')!.textContent
  ).toContain('$8 / month')
  expect(
    container.querySelector('[aria-labelledby="pricing-pro"]')!.textContent
  ).toContain('$20 / month')
  expect(link('Choose Plus').getAttribute('href')).toBe(
    '/account/billing?interval=year'
  )
  expect(link('Choose Pro').getAttribute('href')).toBe(
    '/account/billing?interval=year'
  )
  await act(async () => interval('Monthly').click())
  expect(container.textContent).not.toContain('$96 billed annually')
  expect(link('Choose Plus').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(requests).not.toHaveBeenCalled()
})

it('keeps paid prices inspectable when checkout is closed without promising an available purchase', async () => {
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: false }))
  )
  expect(link('View Plus plan').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(link('View Pro plan').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(container.textContent).not.toContain('Choose Plus')
  expect(container.textContent).not.toContain('Choose Pro')
  await act(async () => interval('Annual · Save 20%').click())
  expect(link('View Plus plan').getAttribute('href')).toBe(
    '/account/billing?interval=year'
  )
  expect(container.textContent).toContain('$96 billed annually')
  expect(requests).not.toHaveBeenCalled()
})

it('marks a registered Free account as current without offering signup, including after an interval change', async () => {
  account.user = { id: 'free-account', emailVerified: true, isAnonymous: false }
  requests.mockResolvedValue(Response.json({ entitlements: { plan: 'free' } }))
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  const free = container.querySelector('[aria-labelledby="pricing-free"]')!
  expect(free.querySelector('button')?.textContent).toContain('Current plan')
  expect(free.querySelector('button')?.disabled).toBe(true)
  expect(container.textContent).not.toContain('Create a free account')
  expect(requests).toHaveBeenCalledWith('/api/billing', { cache: 'no-store' })
  await act(async () => interval('Annual · Save 20%').click())
  expect(free.textContent).toContain('Current plan')
  expect(link('Choose Plus').getAttribute('href')).toBe(
    '/account/billing?interval=year'
  )
  expect(requests).toHaveBeenCalledTimes(1)
})

it('marks the actual paid tier and sends Free selection to billing instead of signup', async () => {
  account.user = { id: 'plus-account', emailVerified: true, isAnonymous: false }
  requests.mockResolvedValue(Response.json({ entitlements: { plan: 'plus' } }))
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  const plus = container.querySelector('[aria-labelledby="pricing-plus"]')!
  expect(plus.querySelector('button')?.textContent).toContain('Current plan')
  expect(plus.querySelector('button')?.disabled).toBe(true)
  expect(link('Switch to Free').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(container.textContent).not.toContain('Create a free account')
})

it('keeps plan actions pending until the session and billing resolve, then restores guest signup on sign-out', async () => {
  account.isPending = true
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  expect(container.textContent).not.toContain('Create a free account')
  expect(requests).not.toHaveBeenCalled()
  let resolve!: (response: Response) => void
  requests.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done
      })
  )
  account.isPending = false
  account.user = { id: 'account', emailVerified: true, isAnonymous: false }
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  expect(container.textContent).toContain('Loading plan')
  expect(container.textContent).not.toContain('Current plan')
  await act(async () =>
    resolve(Response.json({ entitlements: { plan: 'free' } }))
  )
  expect(container.textContent).toContain('Current plan')
  account.user = null
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  expect(link('Create a free account').getAttribute('href')).toBe(
    '/sign-up?returnTo=%2Fpassages'
  )
  expect(container.textContent).not.toContain('Current plan')
})

it('offers billing instead of signup or an assumed Free plan when membership fails to load', async () => {
  account.user = { id: 'account', emailVerified: true, isAnonymous: false }
  requests.mockRejectedValue(new Error('Offline'))
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  expect(link('Manage your plan').getAttribute('href')).toBe(
    '/account/billing?interval=month'
  )
  expect(container.textContent).not.toContain('Create a free account')
  expect(container.textContent).not.toContain('Current plan')
  expect(container.textContent).not.toContain('Loading plan')
})

it('ignores a previous account response after switching to another account', async () => {
  account.user = {
    id: 'first-account',
    emailVerified: true,
    isAnonymous: false
  }
  let resolveFirst!: (response: Response) => void
  requests.mockImplementationOnce(
    () =>
      new Promise<Response>((done) => {
        resolveFirst = done
      })
  )
  requests.mockResolvedValue(Response.json({ entitlements: { plan: 'pro' } }))
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  account.user = {
    id: 'second-account',
    emailVerified: true,
    isAnonymous: false
  }
  await act(async () =>
    root.render(createElement(PricingPlans, { paidPlansAvailable: true }))
  )
  await act(async () =>
    resolveFirst(Response.json({ entitlements: { plan: 'free' } }))
  )
  expect(
    container.querySelector('[aria-labelledby="pricing-pro"]')!.textContent
  ).toContain('Current plan')
  expect(
    container.querySelector('[aria-labelledby="pricing-free"]')!.textContent
  ).not.toContain('Current plan')
})

it('passes only a valid annual query from the server route into billing settings', async () => {
  const annual = await BillingPage({
    searchParams: Promise.resolve({ interval: 'year' })
  })
  expect(annual.type).toBe(BillingSettings)
  expect(annual.props).toMatchObject({ initialInterval: 'year' })
  const invalid = await BillingPage({
    searchParams: Promise.resolve({ interval: 'unrecognized' })
  })
  expect(invalid.type).toBe(BillingSettings)
  expect(invalid.props).toMatchObject({ initialInterval: 'month' })
  expect(requests).not.toHaveBeenCalled()
})

// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import BillingPage from '@/app/account/billing/page'
import { BillingSettings } from '@/components/billing-settings'
import { PricingPlans } from '@/components/pricing-plans'

let container: HTMLDivElement
let root: Root
let requests: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
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

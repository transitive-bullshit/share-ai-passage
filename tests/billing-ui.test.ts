// @vitest-environment happy-dom

import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { BillingSettings } from '@/components/billing-settings'
import { ApiKeySettings } from '@/components/api-key-settings'
import { planCatalog } from '@/lib/plans'

const state = vi.hoisted(() => ({ userId: 'fixture-reader' as string | null }))
vi.mock('@/components/account-session', () => ({
  useAccountSession: () => ({
    data: state.userId
      ? {
          user: { id: state.userId, emailVerified: true, isAnonymous: false }
        }
      : null,
    isPending: false
  })
}))
let container: HTMLDivElement
let root: Root
let requests: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  state.userId = 'fixture-reader'
  window.localStorage.clear()
  window.history.replaceState(null, '', '/account/billing')
  requests = vi.fn<typeof fetch>()
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
const billing = {
  configuration: {
    configured: true,
    mode: 'test',
    checkoutEnabled: true
  },
  plans: planCatalog,
  entitlements: {
    plan: 'plus',
    paidActions: true,
    summaryLimit: 100,
    allowanceWindow: {
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: '2026-10-01T00:00:00Z'
    }
  },
  subscription: {
    status: 'active',
    billingInterval: 'month',
    hasCustomer: true
  }
}

it('shows confirmed billing data without treating a hosted return query as payment', async () => {
  window.history.replaceState(null, '', '/account/billing?checkout=complete')
  requests.mockResolvedValue(Response.json(billing))
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain('100 summary generations per month.')
  expect(container.textContent).toContain('Annual · Save 20%')
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests.mock.calls[0]![0]).toBe('/api/billing')
})

it('preserves an annual pricing choice in the anonymous sign-in continuation without fetching billing', async () => {
  state.userId = null
  window.history.replaceState(null, '', '/account/billing?interval=year')
  await act(async () =>
    root.render(createElement(BillingSettings, { initialInterval: 'year' }))
  )
  const signIn = [...container.querySelectorAll('a')].find(
    (link) => link.textContent === 'Sign in'
  )
  expect(signIn).toBeDefined()
  expect(new URL(signIn!.href).searchParams.get('returnTo')).toBe(
    '/account/billing?interval=year'
  )
  const signUp = [...container.querySelectorAll('a')].find(
    (link) => link.textContent === 'Create account'
  )
  expect(signUp).toBeDefined()
  expect(new URL(signUp!.href).pathname).toBe('/sign-up')
  expect(new URL(signUp!.href).searchParams.get('returnTo')).toBe(
    '/account/billing?interval=year'
  )
  expect(requests).not.toHaveBeenCalled()
})

it('selects annual billing from the pricing link and submits that cadence only after an explicit choice', async () => {
  window.history.replaceState(null, '', '/account/billing?interval=year')
  requests.mockResolvedValueOnce(Response.json(billing))
  await act(async () =>
    root.render(createElement(BillingSettings, { initialInterval: 'year' }))
  )
  const buttons = [...container.querySelectorAll('button')]
  expect(
    buttons
      .find((button) => button.textContent === 'Annual · Save 20%')!
      .getAttribute('aria-pressed')
  ).toBe('true')
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests.mock.calls[0]![0]).toBe('/api/billing')
  requests
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json(billing))
  await act(async () =>
    buttons.find((button) => button.textContent === 'Choose Pro')!.click()
  )
  expect(requests.mock.calls[1]![0]).toBe('/api/billing/action')
  expect(JSON.parse(requests.mock.calls[1]![1]!.body as string)).toEqual({
    action: 'change',
    plan: 'pro',
    interval: 'year'
  })
})

it('shows timestamp-only cancellation and restores it through the existing action', async () => {
  const cancelAt = '2026-10-15T05:30:18.000Z'
  requests.mockResolvedValueOnce(
    Response.json({
      ...billing,
      subscription: {
        ...billing.subscription,
        cancelAtPeriodEnd: false,
        cancelAt,
        periodEnd: cancelAt
      }
    })
  )
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain(
    `Your plan ends ${new Date(cancelAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
  )
  const restore = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Keep current plan'
  )
  expect(restore).toBeDefined()
  requests.mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(
    Response.json({
      ...billing,
      subscription: {
        ...billing.subscription,
        cancelAtPeriodEnd: false,
        cancelAt: null
      }
    })
  )
  await act(async () => restore!.click())
  expect(requests.mock.calls[1]![0]).toBe('/api/billing/action')
  expect(JSON.parse(requests.mock.calls[1]![1]!.body as string)).toEqual({
    action: 'restore'
  })
  expect(container.textContent).not.toContain('Your plan ends')
  expect(container.textContent).not.toContain('Keep current plan')
})

it('keeps live Checkout disabled when the server launch gate is closed', async () => {
  requests.mockResolvedValue(
    Response.json({
      ...billing,
      configuration: {
        configured: true,
        mode: 'live',
        checkoutEnabled: false
      }
    })
  )
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain('Paid plans are not available yet')
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button')
  )
  expect(
    buttons.find((button) => button.textContent?.includes('Choose Pro'))!
      .disabled
  ).toBe(true)
  expect(buttons.some((button) => button.textContent?.includes('Buy 50'))).toBe(
    false
  )
})

it('ignores a late request failure from StrictMode cleanup', async () => {
  const stale = Promise.withResolvers<Response>()
  requests
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValueOnce(Response.json(billing))
  await act(async () =>
    root.render(createElement(StrictMode, null, createElement(BillingSettings)))
  )
  expect(requests).toHaveBeenCalledTimes(2)
  expect(container.textContent).toContain('100 summary generations per month.')
  await act(async () => stale.reject(new Error('Stale billing failure')))
  expect(container.textContent).not.toContain('Stale billing failure')
  expect(container.textContent).toContain('100 summary generations per month.')
})

it('ignores a late response body after switching accounts', async () => {
  const staleBody = Promise.withResolvers<unknown>()
  const staleResponse = Response.json(billing)
  staleResponse.json = () => staleBody.promise
  requests.mockResolvedValueOnce(staleResponse).mockResolvedValueOnce(
    Response.json({
      ...billing,
      entitlements: { ...billing.entitlements, summaryLimit: 300 }
    })
  )
  await act(async () => root.render(createElement(BillingSettings)))
  state.userId = 'different-reader'
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain('300 summary generations per month.')
  await act(async () => staleBody.resolve(billing))
  expect(container.textContent).not.toContain(
    '100 summary generations per month.'
  )
  expect(container.textContent).toContain('300 summary generations per month.')
})

it('shows current request errors and clears them after a successful refresh', async () => {
  requests
    .mockResolvedValueOnce(
      Response.json(
        { error: 'Billing is temporarily unavailable.' },
        { status: 503 }
      )
    )
    .mockResolvedValueOnce(Response.json(billing))
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain('Billing is temporarily unavailable.')
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Refresh billing')!
      .click()
  })
  expect(container.textContent).not.toContain(
    'Billing is temporarily unavailable.'
  )
  expect(container.textContent).toContain('100 summary generations per month.')
})

it('shows a newly created key only in the current account view and clears it on identity change', async () => {
  requests.mockImplementation(async (_input, options) =>
    options?.method === 'POST'
      ? Response.json({ id: 'fixture-key-id', key: 'passage_fixture_secret' })
      : Response.json({ keys: [] })
  )
  await act(async () => root.render(createElement(ApiKeySettings)))
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('#key-name')!
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'Laptop')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="New API key"]'
    )!.value
  ).toBe('passage_fixture_secret')
  expect(window.localStorage.length).toBe(0)
  state.userId = 'different-reader'
  await act(async () => root.render(createElement(ApiKeySettings)))
  expect(container.querySelector('[aria-label="New API key"]')).toBeNull()
})

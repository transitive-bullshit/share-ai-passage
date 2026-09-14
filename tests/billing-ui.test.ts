// @vitest-environment happy-dom

import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { BillingSettings } from '@/components/billing-settings'
import { ApiKeySettings } from '@/components/api-key-settings'
import { planCatalog, imagePack } from '@/lib/plans'

const state = vi.hoisted(() => ({ userId: 'fixture-reader' }))
vi.mock('@/components/account-session', () => ({
  useAccountSession: () => ({
    data: {
      user: { id: state.userId, emailVerified: true, isAnonymous: false }
    },
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
    checkoutEnabled: true,
    packsEnabled: true
  },
  plans: planCatalog,
  imagePack,
  entitlements: {
    plan: 'plus',
    paidActions: true,
    summaryLimit: 100,
    imageLimit: 10,
    allowanceWindow: {
      startsAt: '2026-09-01T00:00:00Z',
      endsAt: '2026-10-01T00:00:00Z'
    }
  },
  subscription: {
    status: 'active',
    billingInterval: 'month',
    hasCustomer: true
  },
  imageBalance: { included: 8, purchased: 43 }
}

it('shows confirmed billing data without treating a hosted return query as payment', async () => {
  window.history.replaceState(null, '', '/account/billing?pack=complete')
  window.localStorage.setItem('passage:pack:fixture-reader', 'old-request-key')
  requests.mockResolvedValue(Response.json(billing))
  await act(async () => root.render(createElement(BillingSettings)))
  expect(container.textContent).toContain('8 included and 43 purchased')
  expect(container.textContent).toContain('Annual · Save 20%')
  expect(window.localStorage.getItem('passage:pack:fixture-reader')).toBeNull()
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests.mock.calls[0]![0]).toBe('/api/billing')
})

it('keeps live Checkout disabled when the server launch gate is closed', async () => {
  requests.mockResolvedValue(
    Response.json({
      ...billing,
      configuration: {
        configured: true,
        mode: 'live',
        checkoutEnabled: false,
        packsEnabled: false
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
  expect(
    buttons.find((button) => button.textContent?.includes('Buy 50'))!.disabled
  ).toBe(true)
})

it('handles aborted requests during StrictMode cleanup and subsequent account navigation', async () => {
  requests.mockImplementation(
    (_input, options) =>
      new Promise<Response>((_resolve, reject) => {
        options!.signal!.addEventListener(
          'abort',
          () =>
            reject(
              new DOMException('The operation was aborted.', 'AbortError')
            ),
          { once: true }
        )
      })
  )
  await act(async () =>
    root.render(createElement(StrictMode, null, createElement(BillingSettings)))
  )
  expect(requests).toHaveBeenCalledTimes(2)
  expect(container.textContent).not.toContain('The operation was aborted')
  await act(async () => root.render(createElement('p', null, 'Navigated')))
  expect(container.textContent).toBe('Navigated')
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

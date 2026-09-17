import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/cron/billing-emails/route'
import type { deliverBillingEmails } from '@/lib/billing-emails'

const deliver = vi.hoisted(() => vi.fn<typeof deliverBillingEmails>())
vi.mock('@/lib/billing-emails', () => ({ deliverBillingEmails: deliver }))
const counts = { examined: 2, sent: 2, skipped: 0, failed: 0, needsReview: 0 }
const secret = 'fixture-cron-secret'
function request(authorization?: string) {
  return new Request('http://localhost:3000/api/cron/billing-emails', {
    headers: authorization ? { authorization } : undefined
  })
}
beforeEach(() => {
  vi.stubEnv('CRON_SECRET', secret)
  deliver.mockReset().mockResolvedValue(counts)
})
afterEach(() => vi.unstubAllEnvs())

it.each([undefined, 'Bearer wrong', `Basic ${secret}`])(
  'refuses unauthorized delivery %s',
  async (authorization) => {
    expect((await GET(request(authorization))).status).toBe(401)
    expect(deliver).not.toHaveBeenCalled()
  }
)
it('refuses an unconfigured secret before connecting to email or storage', async () => {
  vi.stubEnv('CRON_SECRET', '')
  expect((await GET(request('Bearer '))).status).toBe(401)
  expect(deliver).not.toHaveBeenCalled()
})
it('sends a bounded batch and returns only private aggregate counts', async () => {
  deliver.mockResolvedValue({
    ...counts,
    recipient: 'private@example.invalid'
  } as typeof counts)
  const response = await GET(request(`Bearer ${secret}`))
  expect(response.status).toBe(200)
  expect(deliver).toHaveBeenCalledExactlyOnceWith({ limit: 10 })
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('x-robots-tag')).toContain('noindex')
  expect(await response.json()).toEqual(counts)
})
it.each(['failed', 'needsReview'] as const)(
  'exposes %s as an unhealthy batch',
  async (failure) => {
    deliver.mockResolvedValue({ ...counts, [failure]: 1 })
    expect((await GET(request(`Bearer ${secret}`))).status).toBe(503)
  }
)
it('sanitizes provider or database failures', async () => {
  deliver.mockRejectedValue(new Error('private credential and message'))
  const response = await GET(request(`Bearer ${secret}`))
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({
    error: 'Subscription email delivery needs another attempt.'
  })
})

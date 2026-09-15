import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/cron/cleanup-assets/route'
import type { cleanupPrivateAssets } from '@/lib/assets'

const cleanup = vi.hoisted(() => vi.fn<typeof cleanupPrivateAssets>())
vi.mock('@/lib/assets', () => ({ cleanupPrivateAssets: cleanup }))

const secret = 'fixture-cron-secret-for-local-tests'
const counts = { examined: 4, cleaned: 3, skipped: 1, failed: 0 }
function request(authorization?: string) {
  return new Request('http://localhost:3000/api/cron/cleanup-assets', {
    headers: authorization === undefined ? undefined : { authorization }
  })
}

beforeEach(() => {
  cleanup.mockReset()
  cleanup.mockResolvedValue(counts)
  vi.stubEnv('CRON_SECRET', secret)
})
afterEach(() => vi.unstubAllEnvs())

describe('private asset cleanup cron', () => {
  it.each([undefined, '', '   '])(
    'refuses unconfigured secret %j before cleanup',
    async (configured) => {
      vi.stubEnv('CRON_SECRET', configured)
      const response = await GET(request(`Bearer ${configured}`))
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      expect(cleanup).not.toHaveBeenCalled()
    }
  )

  it.each([
    undefined,
    'Bearer wrong-secret',
    `Basic ${secret}`,
    `bearer ${secret}`
  ])('refuses an inexact Authorization header %j', async (authorization) => {
    const response = await GET(request(authorization))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized.' })
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('runs one bounded batch and exposes only safe private counts', async () => {
    const internalResult = {
      ...counts,
      objectKey: 'private/fixture',
      ownerId: 'fixture-owner'
    }
    cleanup.mockResolvedValue(internalResult)
    const response = await GET(request(`Bearer ${secret}`))
    expect(cleanup).toHaveBeenCalledExactlyOnceWith(100)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(await response.json()).toEqual(counts)
  })

  it('reports partial cleanup failure with counts and a failing HTTP status', async () => {
    const partial = { examined: 4, cleaned: 2, skipped: 1, failed: 1 }
    cleanup.mockResolvedValue(partial)
    const response = await GET(request(`Bearer ${secret}`))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual(partial)
  })

  it('sanitizes thrown storage or database errors', async () => {
    cleanup.mockRejectedValue(
      new Error('fixture private endpoint and credential details')
    )
    const response = await GET(request(`Bearer ${secret}`))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      error: 'Private asset cleanup failed.'
    })
  })
})

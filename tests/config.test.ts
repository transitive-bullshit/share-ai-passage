import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appUrl } from '@/lib/config'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_TARGET_ENV', '')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'passage.example')
  vi.stubEnv('VERCEL_BRANCH_URL', 'passage-git-feature.vercel.app')
  vi.stubEnv('VERCEL_URL', 'passage-deployment.vercel.app')
  vi.stubEnv('PORTLESS_URL', '')
  vi.stubEnv('PORT', '')
  vi.stubEnv('APP_URL', 'https://stale-manual-setting.example')
})

afterEach(() => vi.unstubAllEnvs())

describe('automatic public application origin', () => {
  it('uses the production domain supplied by Vercel and follows domain changes', () => {
    expect(appUrl()).toBe('https://passage.example')
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'new-brand.example')
    expect(appUrl()).toBe('https://new-brand.example')
  })

  it('keeps preview links on the branch even when a production domain is available', () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(appUrl()).toBe('https://passage-git-feature.vercel.app')
    vi.stubEnv('VERCEL_BRANCH_URL', '')
    expect(appUrl()).toBe('https://passage-deployment.vercel.app')
  })

  it('treats custom Vercel environments as separate from production', () => {
    vi.stubEnv('VERCEL_TARGET_ENV', 'staging')
    expect(appUrl()).toBe('https://passage-git-feature.vercel.app')
  })

  it('falls back to the deployment URL when the production domain is unavailable', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    expect(appUrl()).toBe('https://passage-deployment.vercel.app')
  })

  it('does not silently use localhost when Vercel has no deployment URL', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
    vi.stubEnv('VERCEL_URL', '')
    expect(() => appUrl()).toThrow('Vercel deployment URL is unavailable')
  })

  it('uses the Portless public URL despite its different internal PORT', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PORTLESS_URL', 'https://feature.passage.localhost/')
    vi.stubEnv('PORT', '4321')
    expect(appUrl()).toBe('https://feature.passage.localhost')
    vi.stubEnv('PORTLESS_URL', 'http://passage.localhost:1355')
    expect(appUrl()).toBe('http://passage.localhost:1355')
  })

  it('uses Next PORT for direct local development, ignoring pulled Vercel values', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PORT', '3101')
    expect(appUrl()).toBe('http://localhost:3101')
  })

  it('builds and serves locally without requiring an APP_URL setting', () => {
    vi.stubEnv('VERCEL', '0')
    vi.stubEnv('APP_URL', '')
    expect(appUrl()).toBe('http://localhost:3000')
    vi.stubEnv('PORT', '3001')
    expect(appUrl()).toBe('http://localhost:3001')
  })

  it.each([
    'https://user:password@passage.localhost',
    'https://passage.localhost/path',
    'https://passage.localhost?query=1',
    'https://passage.localhost#fragment',
    'file:///tmp/local'
  ])('rejects an invalid platform origin: %s', (value) => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PORTLESS_URL', value)
    expect(() => appUrl()).toThrow()
  })
})

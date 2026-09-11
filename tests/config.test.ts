import { afterEach, describe, expect, it, vi } from 'vitest'

import { appUrl } from '@/lib/config'

afterEach(() => vi.unstubAllEnvs())

describe('public application origin', () => {
  it('requires an explicit origin for production share links', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', '')
    vi.stubEnv('PORTLESS_URL', 'http://development.localhost:1355')
    expect(() => appUrl()).toThrow('APP_URL')
  })

  it('uses the configured public origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', 'https://passage.example/')
    vi.stubEnv('PORTLESS_URL', 'http://development.localhost:1355')
    expect(appUrl()).toBe('https://passage.example')
  })

  it('keeps the assigned development origin and local fallback', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_URL', '')
    vi.stubEnv('PORTLESS_URL', 'http://development.localhost:1355')
    expect(appUrl()).toBe('http://development.localhost:1355')
    vi.stubEnv('PORTLESS_URL', '')
    expect(appUrl()).toBe('http://localhost:3000')
  })
})

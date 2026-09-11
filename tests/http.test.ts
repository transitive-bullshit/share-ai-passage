import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDraftToken, previewHash, readDraftToken } from '@/lib/drafts'
import { clientKey, readJson, requireSameOrigin } from '@/lib/http'

afterEach(() => vi.unstubAllEnvs())

describe('mutation boundaries', () => {
  it('requires the configured origin and JSON', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000')
    const request = (origin: string) =>
      new Request('http://localhost:3000/api/prepare', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' }
      })
    expect(() =>
      requireSameOrigin(request('https://attacker.example'))
    ).toThrow()
    expect(() =>
      requireSameOrigin(request('http://localhost:3000'))
    ).not.toThrow()
  })

  it('enforces the streamed body limit when Content-Length is absent', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: 'x'.repeat(200)
    })
    await expect(readJson(request, 100)).rejects.toMatchObject({ status: 413 })
  })

  it('does not trust spoofed forwarded headers by default', () => {
    vi.stubEnv('TRUST_PROXY', 'none')
    const request = (address: string) =>
      new Request('http://localhost', {
        headers: { 'x-forwarded-for': address, 'x-real-ip': address }
      })
    expect(clientKey(request('8.8.8.8'))).toBe(clientKey(request('1.1.1.1')))
    vi.stubEnv('TRUST_PROXY', 'single')
    expect(clientKey(request('8.8.8.8'))).not.toBe(
      clientKey(request('1.1.1.1'))
    )
  })
})

describe('private draft capability', () => {
  it('authenticates the snapshot, source generation, and exact expiry boundary', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const preview = {
      title: 'Generated title',
      highlights: ['A concise takeaway.']
    }
    const token = createDraftToken(id, 2, preview, 1000)
    expect(readDraftToken(token, 1001)).toMatchObject({
      snapshotId: id,
      generation: 2,
      previewHash: previewHash(preview)
    })
    expect(() => readDraftToken(`${token}tampered`, 1001)).toThrow()
    expect(() => readDraftToken(token, 1000 + 86_400_000)).toThrow()
    const [payload, signature] = token.split('.')
    const changed = Buffer.from(
      Buffer.from(payload!, 'base64url')
        .toString()
        .replace('"generation":2', '"generation":3')
    ).toString('base64url')
    expect(() => readDraftToken(`${changed}.${signature}`, 1001)).toThrow()
  })
})

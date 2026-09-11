import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ClientRequestError,
  clientErrorMessage,
  parseRetryAfter,
  postBlob,
  postJson
} from '@/lib/client-request'

afterEach(() => vi.restoreAllMocks())

describe('browser request recovery', () => {
  it('preserves the useful API error and retry deadline without retrying', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json(
          { error: 'Preview generation is busy. Please try again.' },
          { status: 503, headers: { 'Retry-After': '30' } }
        )
      )
    const startedAt = Date.now()
    const error = await postJson('/api/prepare', {
      url: 'public-source'
    }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ClientRequestError)
    expect(error).toMatchObject({
      message: 'Preview generation is busy. Please try again.',
      status: 503,
      retryAt: expect.any(Number)
    })
    expect((error as ClientRequestError).retryAt).toBeGreaterThanOrEqual(
      startedAt + 30_000
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([502, 504, 429])(
    'handles an HTML %s response without exposing parser text',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html>PRIVATE_GATEWAY_DETAILS</html>', {
          status,
          headers: { 'Retry-After': '60', 'Content-Type': 'text/html' }
        })
      )
      await expect(postJson('/api/prepare', {})).rejects.toMatchObject({
        message: 'The server could not finish the request. Please try again.',
        status,
        retryAt: expect.any(Number)
      })
    }
  )

  it('turns a transport failure into a useful connection message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch')
    )
    await expect(postJson('/api/publish', {})).rejects.toThrow(
      'We couldn’t connect. Check your connection and try again.'
    )
    expect(
      clientErrorMessage(new SyntaxError('private response contents'))
    ).toBe('We couldn’t connect. Check your connection and try again.')
  })

  it('handles non-JSON success responses consistently', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>bad gateway</html>')
    )
    await expect(postJson('/api/publish', {})).rejects.toThrow(
      'The server could not finish the request. Please try again.'
    )
  })

  it('keeps card cancellation separate from a request failure', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Cancelled', 'AbortError')
    controller.abort(reason)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(reason)
    await expect(postBlob('/api/card', {}, controller.signal)).rejects.toBe(
      reason
    )
  })

  it('returns successful JSON and image data', async () => {
    const result = { shareUrl: 'https://passage.example/chatgpt/test' }
    const fetch = vi.spyOn(globalThis, 'fetch')
    fetch.mockResolvedValueOnce(Response.json(result))
    expect(await postJson('/api/publish', {})).toEqual(result)
    fetch.mockResolvedValueOnce(
      new Response('webp fixture', {
        headers: { 'Content-Type': 'image/webp' }
      })
    )
    const image = await postBlob('/api/card', {})
    expect(image.type).toBe('image/webp')
    expect(await image.text()).toBe('webp fixture')
  })

  it('accepts future Retry-After seconds and dates, ignoring invalid or expired values', () => {
    const now = Date.parse('2026-09-11T00:00:00Z')
    expect(parseRetryAfter('30', now)).toBe(now + 30_000)
    expect(parseRetryAfter('Fri, 11 Sep 2026 00:01:00 GMT', now)).toBe(
      now + 60_000
    )
    for (const value of [
      null,
      '',
      '-1',
      '0',
      'tomorrow',
      '1.5',
      'Infinity',
      'Thu, 10 Sep 2026 00:00:00 GMT'
    ]) {
      expect(parseRetryAfter(value, now)).toBeUndefined()
    }
  })
})

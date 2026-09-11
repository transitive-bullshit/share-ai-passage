import { createServer, get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import type { AddressInfo } from 'node:net'

import { describe, expect, it } from 'vitest'

const blocked = 'Unit tests cannot access external services.'

describe('unit tests stay offline and cannot spend AI credits', () => {
  it.each([
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'AI_GATEWAY_API_KEY',
    'VERCEL_OIDC_TOKEN'
  ])('starts without an inherited %s credential', (name) => {
    expect(process.env[name]).toBe('')
  })

  it('blocks unmocked fetch calls before contacting a model provider', async () => {
    await expect(
      fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-only' },
        body: '{}'
      })
    ).rejects.toThrow(blocked)
  })

  it('also blocks Node HTTP and HTTPS clients before opening a connection', () => {
    expect(() => httpGet('http://example.test/')).toThrow(blocked)
    expect(() => httpsGet('https://api.openai.com/v1/responses')).toThrow(
      blocked
    )
  })

  it('allows local fixtures but refuses their redirects to external services', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, {
          location: 'https://api.openai.com/v1/responses'
        })
      }
      response.end('local fixture')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      expect(await (await fetch(baseUrl)).text()).toBe('local fixture')
      await expect(fetch(`${baseUrl}/redirect`)).rejects.toMatchObject({
        cause: { message: expect.stringContaining(blocked) }
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

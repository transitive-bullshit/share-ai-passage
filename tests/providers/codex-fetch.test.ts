import type { LookupAddress } from 'node:dns'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import type { RequestOptions } from 'node:https'
import type { LookupFunction } from 'node:net'
import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { messageMarkdown, messageText } from '../../lib/messages'
import { fetchSource, parseSourceUrl } from '../../lib/providers'
import { downloadSourceImage } from '../../lib/conversation-images'

const network = vi.hoisted(() => ({
  lookup:
    vi.fn<
      (hostname: string, options: { all: true }) => Promise<LookupAddress[]>
    >(),
  request:
    vi.fn<
      (
        url: URL,
        options: RequestOptions,
        onResponse: (response: IncomingMessage) => void
      ) => EventEmitter & { end: () => void }
    >()
}))
vi.mock('node:dns/promises', () => ({ lookup: network.lookup }))
vi.mock('node:https', () => ({ request: network.request }))

const source = parseSourceUrl(
  'https://chatgpt.com/s/cx_6aa2a886a0a481918fa34fcbbeb42121'
)
const upstream = `https://chatgpt.com/backend-api/wham/shared_threads/${source.shareId}`
const snapshot = JSON.stringify({
  version: 1,
  title: 'A public Codex conversation',
  turns: [
    {
      items: [
        {
          type: 'userMessage',
          content: [{ type: 'text', text: 'Explain the first step.' }]
        },
        { type: 'agentMessage', text: 'Start with a **small** example.' }
      ]
    },
    {
      items: [
        {
          type: 'userMessage',
          content: [{ type: 'text', text: 'What comes next?' }]
        },
        { type: 'agentMessage', text: 'Check the result.' }
      ]
    }
  ]
})

function downloadUrl(host: string) {
  return `https://${host}/files/8d523f18-86c8-44af-8002-a5bcf45ffbb5/raw?se=2026-09-10T12%3A00%3A00Z&sp=r&sv=2024-08-04&sr=b&sig=fixture`
}

function respond(
  statusCode: number,
  body = '',
  location?: string,
  contentType = 'application/json'
) {
  network.request.mockImplementationOnce(
    (
      _url: URL,
      _options: RequestOptions,
      onResponse: (response: IncomingMessage) => void
    ) =>
      Object.assign(new EventEmitter(), {
        end() {
          const response = Object.assign(Readable.from([body]), {
            statusCode,
            headers: {
              'content-type': contentType,
              ...(location ? { location } : {})
            }
          })
          onResponse(response as IncomingMessage)
        }
      })
  )
}

beforeEach(() => {
  network.lookup.mockReset()
  network.request.mockReset()
  network.lookup.mockResolvedValue([{ address: '104.18.10.10', family: 4 }])
})

describe('public Codex downloads through the provider fetch boundary', () => {
  it('downloads shared image bytes across CDN redirects and pins every connection', async () => {
    respond(302, '', downloadUrl('cdn.oaiusercontent.com'))
    respond(200, 'binary image bytes', undefined, 'image/png')
    const bytes = await downloadSourceImage(
      'codex:shared-asset/asset-1',
      source,
      AbortSignal.timeout(1000)
    )
    expect(bytes).toEqual(Buffer.from('binary image bytes'))
    expect(network.request.mock.calls[0]![0].href).toBe(
      `${upstream}/assets/asset-1`
    )
    expect(network.lookup.mock.calls.map(([host]) => host)).toEqual([
      'chatgpt.com',
      'cdn.oaiusercontent.com'
    ])
  })

  it('refuses shared-image redirects outside provider storage', async () => {
    respond(302, '', 'https://untrusted.example/image.png')
    await expect(
      downloadSourceImage(
        'codex:shared-asset/asset-1',
        source,
        AbortSignal.timeout(1000)
      )
    ).rejects.toThrow('outside its supported public endpoint')
    expect(network.request).toHaveBeenCalledTimes(1)
  })

  it('rejects private DNS for ordinary HTTPS images before requesting bytes', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
    await expect(
      downloadSourceImage(
        'https://images.example/image.png',
        source,
        AbortSignal.timeout(1000)
      )
    ).rejects.toThrow('unsupported network address')
    expect(network.request).not.toHaveBeenCalled()
  })
  it.each([
    'sdmntprnznorth.oaiusercontent.com',
    'sdmntprwestus.oaiusercontent.com'
  ])('imports the complete conversation from %s', async (host) => {
    const download = downloadUrl(host)
    respond(302, '', download)
    respond(200, snapshot)

    const result = await fetchSource(source)

    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error(result.reason)
    expect(
      result.conversation.messages.map((entry) => ({
        role: entry.role,
        text: messageText(entry)
      }))
    ).toEqual([
      { role: 'user', text: 'Explain the first step.' },
      { role: 'assistant', text: 'Start with a small example.' },
      { role: 'user', text: 'What comes next?' },
      { role: 'assistant', text: 'Check the result.' }
    ])
    expect(messageMarkdown(result.conversation.messages[1]!)).toBe(
      'Start with a **small** example.'
    )
    expect(
      network.request.mock.calls.map(([url]) => (url as URL).href)
    ).toEqual([upstream, download])
    expect(network.lookup.mock.calls.map(([host]) => host)).toEqual([
      'chatgpt.com',
      host
    ])
  })

  it.each([403, 404])(
    'keeps a download HTTP %s inconclusive',
    async (status) => {
      respond(302, '', downloadUrl('sdmntprwestus.oaiusercontent.com'))
      respond(
        307,
        '',
        'https://cdn.oaiusercontent.com/snapshots/latest?token=fixture'
      )
      respond(status, JSON.stringify({ detail: 'Share not found' }))

      expect(await fetchSource(source)).toEqual({
        status: 'inconclusive',
        reason: 'The provider download could not be read. Try again later.'
      })
      expect(network.request).toHaveBeenCalledTimes(3)
    }
  )

  it('follows delegated CDN redirects and pins each request to its validated DNS answer', async () => {
    const downloads = [
      'https://storage.oaiusercontent.com/exports/thread.json?Policy=fixture&Signature=fixture&Key-Pair-Id=fixture',
      'https://cdn.oaiusercontent.com/objects/nested/snapshot?X-Amz-Algorithm=fixture&X-Amz-Signature=fixture&new-option=enabled'
    ]
    const addresses = ['104.18.10.10', '20.1.2.3', '34.1.2.3']
    for (const address of addresses)
      network.lookup.mockResolvedValueOnce([{ address, family: 4 }])
    respond(302, '', downloads[0])
    respond(307, '', downloads[1])
    respond(200, snapshot)

    expect((await fetchSource(source)).status).toBe('available')
    expect(network.request.mock.calls.map(([url]) => url.href)).toEqual([
      upstream,
      ...downloads
    ])
    expect(network.lookup.mock.calls.map(([host]) => host)).toEqual([
      'chatgpt.com',
      'storage.oaiusercontent.com',
      'cdn.oaiusercontent.com'
    ])
    for (const [
      index,
      [url, options]
    ] of network.request.mock.calls.entries()) {
      const callback = vi.fn<Parameters<LookupFunction>[2]>()
      expect(options.lookup).toBeTypeOf('function')
      options.lookup!(url.hostname, {}, callback)
      expect(callback).toHaveBeenCalledWith(null, addresses[index], 4)
    }
    expect(network.lookup).toHaveBeenCalledTimes(3)
  })

  it.each(['application/octet-stream', 'text/plain', ''])(
    'recognizes a JSON conversation with content type %j',
    async (contentType) => {
      respond(
        302,
        '',
        'https://cdn.oaiusercontent.com/new/storage/layout?token=fixture'
      )
      respond(200, snapshot, undefined, contentType)

      const result = await fetchSource(source)

      expect(result.status).toBe('available')
      if (result.status !== 'available') throw new Error(result.reason)
      expect(result.conversation.messages).toHaveLength(4)
    }
  )

  it('never uses a submitted download URL as the initial request', async () => {
    const canonicalUrl =
      'https://cdn.oaiusercontent.com/exports/thread.json?token=fixture'

    expect(() => parseSourceUrl(canonicalUrl)).toThrow()
    expect((await fetchSource({ ...source, canonicalUrl })).status).toBe(
      'inconclusive'
    )
    expect(network.lookup).not.toHaveBeenCalled()
    expect(network.request).not.toHaveBeenCalled()
  })

  it.each([
    'http://cdn.oaiusercontent.com/snapshot',
    'https://reader:password@cdn.oaiusercontent.com/snapshot',
    'https://cdn.oaiusercontent.com:8443/snapshot',
    'https://cdn.example.net/snapshot',
    'https://claude.ai/api/chat_snapshots/fixture',
    'https://oaiusercontent.com.example.net/snapshot'
  ])(
    'refuses unsafe redirect target %s before requesting it',
    async (target) => {
      respond(302, '', target)

      expect((await fetchSource(source)).status).toBe('inconclusive')
      expect(network.lookup).toHaveBeenCalledTimes(1)
      expect(network.request).toHaveBeenCalledTimes(1)
      expect(network.request.mock.calls[0]![0].href).toBe(upstream)
    }
  )

  it('refuses private DNS answers on a later CDN hop before requesting it', async () => {
    network.lookup
      .mockResolvedValueOnce([{ address: '104.18.10.10', family: 4 }])
      .mockResolvedValueOnce([{ address: '20.1.2.3', family: 4 }])
      .mockResolvedValueOnce([
        { address: '104.18.10.10', family: 4 },
        { address: '127.0.0.1', family: 4 }
      ])
    respond(302, '', downloadUrl('sdmntprwestus.oaiusercontent.com'))
    respond(302, '', 'https://cdn.oaiusercontent.com/snapshot')

    expect(await fetchSource(source)).toEqual({
      status: 'inconclusive',
      reason: 'The provider resolved to an unsupported network address.'
    })
    expect(network.lookup).toHaveBeenCalledTimes(3)
    expect(network.request).toHaveBeenCalledTimes(2)
  })

  it('stops before requesting a third redirect', async () => {
    for (let hop = 1; hop <= 3; hop++)
      respond(302, '', `https://cdn.oaiusercontent.com/snapshots/${hop}`)

    expect(await fetchSource(source)).toEqual({
      status: 'inconclusive',
      reason: 'The provider returned too many redirects.'
    })
    expect(network.lookup).toHaveBeenCalledTimes(3)
    expect(network.request).toHaveBeenCalledTimes(3)
  })
})

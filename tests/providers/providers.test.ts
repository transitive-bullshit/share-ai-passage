import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { createGunzip, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { parseChatgpt } from '../../lib/providers/chatgpt'
import { parseClaude } from '../../lib/providers/claude'
import { classifyResponse } from '../../lib/providers'
import { messageMarkdown, messageText, plainText } from '../../lib/messages'
import {
  isPublicAddress,
  readBoundedBody
} from '../../lib/providers/safe-fetch'
import {
  isAllowedRedirect,
  parseSourceUrl,
  upstreamUrl
} from '../../lib/providers/urls'

const id = '8d523f18-86c8-44af-8002-a5bcf45ffbb5'
const chatgpt = parseSourceUrl(`https://chatgpt.com/share/${id}`)
const claude = parseSourceUrl(`https://claude.ai/share/${id}`)
const codex = {
  provider: 'chatgpt' as const,
  shareId: 'cx_6aa21047e1c88191ae37e18eaa1d6532',
  canonicalUrl: 'https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532'
}
const fixture = async (name: string) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')
  )

describe('public share URLs and fetch destinations', () => {
  it('accepts public Codex chats shared from ChatGPT', () => {
    expect(
      parseSourceUrl(
        'https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532'
      )
    ).toEqual(codex)
    expect(parseSourceUrl(` ${codex.canonicalUrl.toUpperCase()}/ `)).toEqual(
      codex
    )
    expect(upstreamUrl(codex).href).toBe(
      `https://chatgpt.com/backend-api/wham/shared_threads/${codex.shareId}`
    )
    expect(isAllowedRedirect(upstreamUrl(codex), codex)).toBe(true)
    expect(isAllowedRedirect(upstreamUrl(chatgpt), codex)).toBe(false)
    expect(isAllowedRedirect(upstreamUrl(codex), chatgpt)).toBe(false)
    expect(() => upstreamUrl({ ...codex, shareId: id })).toThrow()
    expect(() => upstreamUrl({ ...codex, provider: 'claude' })).toThrow()
  })

  it('canonicalizes supported provider URLs', () => {
    expect(
      parseSourceUrl(` https://chatgpt.com/share/${id.toUpperCase()}/ `)
    ).toEqual(chatgpt)
    expect(upstreamUrl(claude).href).toBe(
      `https://claude.ai/api/chat_snapshots/${id}?rendering_mode=messages&render_all_tools=true`
    )
  })

  it.each([chatgpt, claude, codex])(
    'ignores copied query parameters and fragments for $provider sources',
    (source) => {
      const copied = `${source.canonicalUrl}/?utm_source=copy&redirect=https://example.com&token=not-forwarded#message-2`
      const parsed = parseSourceUrl(copied)
      expect(parsed).toEqual(source)
      expect(upstreamUrl(parsed).href).toBe(upstreamUrl(source).href)
    }
  )

  it.each([
    `http://chatgpt.com/share/${id}`,
    `https://chatgpt.com.evil.test/share/${id}`,
    `https://chatgpt.com@127.0.0.1/share/${id}`,
    `https://user:password@chatgpt.com/share/${id}`,
    `https://chatgpt.com:8080/share/${id}`,
    `https://chatgpt.com/c/${id}`,
    `https://claude.ai/chat/${id}`,
    `https://claude.ai/public/artifacts/${id}`,
    'https://chatgpt.com/s/unknown',
    'https://claude.ai/s/cx_6aa21047e1c88191ae37e18eaa1d6532',
    'https://chatgpt.com/s/cx_bad-id',
    `${codex.canonicalUrl}/extra`,
    codex.canonicalUrl.replace('chatgpt.com', 'chatgpt.com.evil.test'),
    'https://127.0.0.1/share/anything'
  ])('rejects unsupported or unsafe source %s', (url) => {
    expect(() => parseSourceUrl(url)).toThrow()
  })

  it('rejects every redirect outside the exact validated provider endpoint', () => {
    expect(isAllowedRedirect(upstreamUrl(chatgpt), chatgpt)).toBe(true)
    for (const url of [
      'https://localhost/',
      'https://127.0.0.1/',
      'https://chatgpt.com/auth/login',
      `https://chatgpt.com/backend-api/share/${id}?url=internal`,
      upstreamUrl(claude).href
    ]) {
      expect(isAllowedRedirect(new URL(url), chatgpt)).toBe(false)
    }
    expect(() => upstreamUrl({ ...chatgpt, provider: 'claude' })).toThrow()
  })

  it('requires a safe OpenAI download origin rather than a particular signed URL shape', () => {
    const download = new URL(
      `https://sdmntprnznorth.oaiusercontent.com/files/${id}/raw?se=2026-09-10T12%3A00%3A00Z&sp=r&sv=2024-08-04&sr=b&sig=fixture`
    )
    expect(isAllowedRedirect(download, codex)).toBe(true)
    expect(isAllowedRedirect(download, chatgpt)).toBe(false)
    expect(isAllowedRedirect(download, claude)).toBe(false)
    expect(isAllowedRedirect(download, codex, download)).toBe(true)
    expect(isAllowedRedirect(upstreamUrl(codex), codex, download)).toBe(false)
    for (const unsafe of [
      download.href.replace('https:', 'http:'),
      download.href.replace(
        'sdmntprnznorth.oaiusercontent.com',
        'oaiusercontent.com.evil.test'
      ),
      download.href.replace('https://', 'https://user:secret@'),
      download.href.replace('.com/', '.com:8443/')
    ]) {
      expect(isAllowedRedirect(new URL(unsafe), codex)).toBe(false)
    }
    for (const compatible of [
      download.href.replace('/raw?', '/download?'),
      download.href.replace('sp=r', 'sp=rw'),
      download.href.replace('sig=fixture', 'new_signature_format=fixture'),
      `${download.href}&region=west&region=backup`,
      `${download.href}#preview`,
      'https://cdn.oaiusercontent.com/a/new/storage/layout?provider_signature=fixture'
    ]) {
      expect(isAllowedRedirect(new URL(compatible), codex)).toBe(true)
    }
  })

  it.each([
    'sdmntprnznorth.oaiusercontent.com',
    'sdmntprwestus.oaiusercontent.com',
    'another-region.oaiusercontent.com'
  ])(
    'accepts a Codex download from the OpenAI content namespace: %s',
    (hostname) => {
      const source = parseSourceUrl(
        'https://chatgpt.com/s/cx_6aa2a886a0a481918fa34fcbbeb42121'
      )
      const download = new URL(
        `https://${hostname}/files/${id}/raw?se=2026-09-10T12%3A00%3A00Z&sp=r&sv=2024-08-04&sr=b&sig=fixture`
      )
      expect(isAllowedRedirect(download, source)).toBe(true)
      expect(isAllowedRedirect(download, source, download)).toBe(true)
      expect(isAllowedRedirect(download, chatgpt)).toBe(false)
      expect(() => parseSourceUrl(download.href)).toThrow()
    }
  )

  it.each([
    'oaiusercontent.com',
    'eviloaiusercontent.com',
    'oaiusercontent.com.evil.test',
    'sdmntprwestus.oaiusercontent.com.evil.test',
    'sdmntprwestus.oaiusercontent-com.test',
    '127.0.0.1'
  ])('rejects content-download hostname lookalikes: %s', (hostname) => {
    const download = new URL(
      `https://${hostname}/files/${id}/raw?se=2026-09-10T12%3A00%3A00Z&sp=r&sv=2024-08-04&sr=b&sig=fixture`
    )
    expect(isAllowedRedirect(download, codex)).toBe(false)
  })

  it.each([
    '127.0.0.1',
    '10.20.30.40',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.2.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
    'not-an-address'
  ])('rejects nonpublic DNS address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(['104.18.10.10', '172.64.32.1', '1.1.1.1', '2606:4700::1111'])(
    'accepts globally routable DNS address %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true)
    }
  )

  it('enforces the byte budget across chunks and after decompression', async () => {
    await expect(
      readBoundedBody(Readable.from([Buffer.from('ab'), Buffer.from('cd')]), 4)
    ).resolves.toBe('abcd')
    await expect(
      readBoundedBody(Readable.from([Buffer.from('ab'), Buffer.from('cde')]), 4)
    ).rejects.toThrow('5 MiB')
    const compressed = Readable.from([gzipSync('a'.repeat(1000))]).pipe(
      createGunzip()
    )
    await expect(readBoundedBody(compressed, 100)).rejects.toThrow('5 MiB')
  })
})

describe('observed sanitized provider payloads', () => {
  it.each(['', 'text/plain', 'application/octet-stream'])(
    'reads a valid conversation despite the content-type label %j',
    (contentType) => {
      const result = classifyResponse(codex, {
        status: 200,
        challenged: false,
        contentType,
        body: JSON.stringify({
          version: 1,
          turns: [
            {
              items: [
                {
                  type: 'agentMessage',
                  text: 'Example HTML: <title>Just a moment</title>\n\nHere is the explanation.'
                }
              ]
            }
          ]
        })
      })
      expect(result.status).toBe('available')
    }
  )
  it('extracts the ordered ChatGPT conversation while excluding hidden provider messages', async () => {
    const input = await fixture('chatgpt-code')
    const expected = input.linear_conversation.filter(
      (node: {
        message?: {
          metadata: { is_visually_hidden_from_conversation?: boolean }
        }
      }) =>
        node.message &&
        !node.message.metadata.is_visually_hidden_from_conversation
    )
    const result = parseChatgpt(input, 200)
    expect(result.status).toBe('available')
    if (result.status !== 'available') return
    expect(result.conversation.messages.map((entry) => entry.id)).toEqual(
      expected.map((node: { message: { id: string } }) => node.message.id)
    )
    expect(
      result.conversation.messages.some((entry) =>
        messageMarkdown(entry).includes('```python')
      )
    ).toBe(true)
    expect(
      result.conversation.messages.some((entry) =>
        messageText(entry).includes('```')
      )
    ).toBe(false)
  })

  it('extracts Claude legacy Markdown and explicit tool placeholders from observed payloads', async () => {
    const result = parseClaude(await fixture('claude-code'), 200)
    expect(result.status).toBe('available')
    if (result.status !== 'available') return
    expect(result.conversation.messages.map((entry) => entry.role)).toEqual([
      'user',
      'assistant'
    ])
    expect(messageMarkdown(result.conversation.messages[1]!)).toContain(
      '```python'
    )
    const tools = parseClaude(await fixture('claude-tools'), 200)
    expect(tools.status).toBe('available')
    if (tools.status !== 'available') return
    expect(messageMarkdown(tools.conversation.messages[1]!)).toContain(
      '[Tool or interactive artifact omitted]'
    )
  })

  it('derives plain text from Markdown, code, Unicode, and link labels', () => {
    const text = plainText(
      '# Heading\n\nA **bold** choice with [a link](https://example.com) and café 🧑🏽‍💻.\n\n```ts\nconst x = 1\n```'
    )
    expect(text).toContain('A bold choice with a link and café 🧑🏽‍💻.')
    expect(text).toContain('const x = 1')
    expect(text).not.toContain('https://example.com')
  })

  it('marks unsupported ChatGPT media without silently dropping the turn', async () => {
    const input = await fixture('chatgpt-code')
    const visible = input.linear_conversation.find(
      (node: { message?: { author: { role: string } } }) =>
        node.message?.author.role === 'user'
    )
    visible.message.content.parts = [
      'Look at this.',
      { content_type: 'image_asset_pointer', asset_pointer: 'file://redacted' }
    ]
    const result = parseChatgpt(input, 200)
    expect(result.status).toBe('available')
    if (result.status !== 'available') return
    const captured = result.conversation.messages.find(
      (entry) => entry.id === visible.message.id
    )!
    expect(messageMarkdown(captured)).toContain('[Image omitted]')
    expect(messageText(captured)).toBe('Look at this.')
    expect(captured.content.slice(0, 2)).toEqual([
      { type: 'input_text', text: 'Look at this.' },
      { type: 'omitted', kind: 'image', reason: 'not_exposed' }
    ])
  })

  it('excludes omission labels from original source text', async () => {
    const input = await fixture('claude-tools')
    const result = parseClaude(input, 200)
    if (result.status !== 'available')
      throw new Error('Fixture should be available')
    expect(
      result.conversation.messages.map(messageText).join('')
    ).not.toContain('omitted]')
    for (const entry of input.chat_messages) entry.content = [{ type: 'image' }]
    expect(() => parseClaude(input, 200)).toThrow(
      'did not contain a readable conversation'
    )
  })

  it('preserves mixed content order without mistaking source text for omission labels', () => {
    const result = parseChatgpt(
      {
        is_public: true,
        linear_conversation: [
          {
            message: {
              id: 'mixed',
              author: { role: 'user' },
              content: {
                parts: [
                  '**Before.**',
                  {
                    content_type: 'image_asset_pointer',
                    asset_pointer: 'file://not-saved'
                  },
                  'The source literally says [Image omitted].',
                  {
                    content_type: 'future_media',
                    url: 'https://not-saved.example/media'
                  }
                ]
              },
              metadata: {
                attachments: [{ url: 'https://not-saved.example/file' }]
              }
            }
          }
        ]
      },
      200
    )
    if (result.status !== 'available')
      throw new Error('Expected a public message')
    const captured = result.conversation.messages[0]!
    expect(captured.content).toEqual([
      { type: 'input_text', text: '**Before.**' },
      { type: 'omitted', kind: 'image', reason: 'not_exposed' },
      {
        type: 'input_text',
        text: 'The source literally says [Image omitted].'
      },
      { type: 'omitted', kind: 'unknown', reason: 'unsupported' },
      { type: 'omitted', kind: 'file', reason: 'not_exposed', count: 1 }
    ])
    expect(messageText(captured)).toBe(
      'Before.\n\nThe source literally says [Image omitted].'
    )
    expect(JSON.stringify(captured)).not.toContain('not-saved')
    expect(captured).not.toHaveProperty('speaker')
    expect(captured).not.toHaveProperty('markdown')
    expect(captured).not.toHaveProperty('text')
  })

  it('maps provider roles to Responses text kinds while retaining the local tool role', () => {
    const roles = ['user', 'assistant', 'system', 'developer', 'tool']
    const result = parseChatgpt(
      {
        is_public: true,
        linear_conversation: roles.map((role) => ({
          message: { id: role, author: { role }, content: { parts: [role] } }
        }))
      },
      200
    )
    if (result.status !== 'available')
      throw new Error('Expected public messages')
    expect(result.conversation.messages.map(({ role }) => role)).toEqual(roles)
    expect(
      result.conversation.messages.map(({ content }) => content.at(-1)?.type)
    ).toEqual([
      'input_text',
      'output_text',
      'input_text',
      'input_text',
      'input_text'
    ])
    const tool = result.conversation.messages.at(-1)!
    expect(tool.content[0]).toEqual({
      type: 'omitted',
      kind: 'tool',
      reason: 'unsupported'
    })
    expect(messageText(tool)).toBe('tool')
  })

  it('preserves Claude text and inline images while accounting for unexposed media counts', () => {
    const result = parseClaude(
      {
        is_public: true,
        chat_messages: [
          {
            uuid: 'mixed',
            index: 0,
            sender: 'human',
            image_count: 2,
            file_count: 2,
            attachments: [{}, {}],
            content: [
              { type: 'text', text: 'Before.' },
              { type: 'image' },
              { type: 'text', text: 'After.' }
            ]
          }
        ]
      },
      200
    )
    if (result.status !== 'available')
      throw new Error('Expected a public message')
    expect(result.conversation.messages[0]!.content).toEqual([
      { type: 'input_text', text: 'Before.' },
      { type: 'omitted', kind: 'image', reason: 'not_exposed' },
      { type: 'input_text', text: 'After.' },
      { type: 'omitted', kind: 'image', reason: 'not_exposed', count: 1 },
      { type: 'omitted', kind: 'file', reason: 'not_exposed', count: 2 }
    ])
    expect(messageText(result.conversation.messages[0]!)).toBe(
      'Before.\n\nAfter.'
    )
  })

  it('rejects oversize and explicitly truncated transcripts rather than losing turns', async () => {
    const input = await fixture('claude-code')
    input.chat_messages[0].text = 'x'.repeat(1024 * 1024)
    expect(() => parseClaude(input, 200)).toThrow('1 MiB')
    input.chat_messages[0].truncated = true
    expect(() => parseClaude(input, 200)).toThrow('truncated')
  })

  it('only confirms removal from the exact observed provider errors', async () => {
    expect(parseChatgpt(await fixture('chatgpt-unavailable'), 404).status).toBe(
      'unavailable'
    )
    expect(parseClaude(await fixture('claude-unavailable'), 404).status).toBe(
      'unavailable'
    )
    expect(parseChatgpt({ detail: 'not found' }, 404).status).toBe(
      'inconclusive'
    )
    expect(parseClaude({ error: 'not found' }, 404).status).toBe('inconclusive')
    expect(parseClaude(await fixture('claude-unavailable'), 403).status).toBe(
      'inconclusive'
    )
    const codexMissing = {
      status: 404,
      body: JSON.stringify({ detail: 'Share not found' }),
      contentType: 'application/json',
      challenged: false
    }
    expect(classifyResponse(codex, codexMissing).status).toBe('unavailable')
    expect(
      classifyResponse(codex, { ...codexMissing, redirected: true }).status
    ).toBe('inconclusive')
    expect(classifyResponse(chatgpt, codexMissing).status).toBe('inconclusive')
  })

  it.each([403, 429, 500, 502, 503])(
    'never classifies HTTP %s as confirmed removal',
    async (status) => {
      const body = await readBoundedBody(
        createReadStream(
          new URL('./fixtures/claude-unavailable.json', import.meta.url)
        )
      )
      expect(
        classifyResponse(claude, {
          status,
          body,
          contentType: 'application/json',
          challenged: false
        }).status
      ).toBe('inconclusive')
    }
  )

  it('keeps challenges, shells, malformed JSON, and changed payloads inconclusive', () => {
    for (const response of [
      {
        status: 403,
        body: '<html>Challenge</html>',
        contentType: 'text/html',
        challenged: true
      },
      {
        status: 200,
        body: '<title>Claude</title>',
        contentType: 'text/html',
        challenged: false
      },
      {
        status: 200,
        body: '{bad-json',
        contentType: 'application/json',
        challenged: false
      },
      {
        status: 200,
        body: '{}',
        contentType: 'application/json',
        challenged: false
      }
    ])
      expect(classifyResponse(claude, response).status).toBe('inconclusive')
  })
})

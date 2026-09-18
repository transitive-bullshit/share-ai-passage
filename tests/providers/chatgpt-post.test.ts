import { describe, expect, it } from 'vitest'
import { classifyResponse } from '../../lib/providers'
import { parseSourceUrl, upstreamUrl } from '../../lib/providers/urls'

const url = 'https://chatgpt.com/s/t_6aac1592586c8191a64acab3214f895c'
const source = {
  provider: 'chatgpt' as const,
  shareId: url.split('/').at(-1)!,
  canonicalUrl: url
}

// Sanitized public-page structure: a reference table inside an inert JSON string.
function page(post: unknown) {
  const table: unknown[] = []
  function encode(value: unknown): number {
    if (value === null) return -5
    const index = table.length
    table.push(value)
    if (Array.isArray(value)) table[index] = value.map(encode)
    else if (typeof value === 'object' && value)
      table[index] = Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          `_${encode(key)}`,
          encode(child)
        ])
      )
    return index
  }
  encode({
    loaderData: {
      'routes/s.$postId': {
        kind: 'post_with_profile',
        postWithProfile: { post }
      }
    }
  })
  return `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(table) + '\n')});</script><script>window.__reactRouterContext.streamController.enqueue("P993:[{}]\\n");</script>`
}
const post = {
  id: source.shareId,
  text: 'A shared answer',
  permissions: { can_read: true, share_setting: 'public' },
  attachments: [
    {
      kind: 'message_slice',
      messages: [
        {
          id: 'answer',
          author: { role: 'assistant' },
          content: {
            content_type: 'text',
            parts: ['The publicly shared answer.']
          }
        }
      ]
    }
  ]
}
function classify(body: string, status = 200) {
  return classifyResponse(source, {
    body,
    status,
    contentType: 'text/html',
    challenged: false
  })
}

describe('ChatGPT shared message posts', () => {
  it('accepts the reported URL and fetches its public page', () => {
    expect(parseSourceUrl(url)).toEqual(source)
    expect(parseSourceUrl(`${url.toUpperCase()}/?copied=true#message`)).toEqual(
      source
    )
    expect(upstreamUrl(source).href).toBe(url)
  })
  it('extracts only the exposed messages from a public post', () => {
    const result = classify(page(post))
    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error('Expected available')
    expect(result.conversation.messages).toHaveLength(1)
    expect(result.conversation.messages[0]?.content).toEqual([
      { type: 'output_text', text: 'The publicly shared answer.' }
    ])
  })
  it.each([
    { ...post, id: 't_other' },
    { ...post, permissions: { can_read: true, share_setting: 'private' } },
    { ...post, attachments: [{ kind: 'code_block', content: 'artifact' }] },
    { ...post, attachments: [] }
  ])('keeps unsupported or unverified posts inconclusive', (value) => {
    expect(classify(page(value)).status).toBe('inconclusive')
  })
  it('never executes scripts or treats missing posts as confirmed removal', () => {
    expect(
      classify('<script>throw new Error("never execute")</script>').status
    ).toBe('inconclusive')
    expect(classify(page(post), 404).status).toBe('inconclusive')
    expect(
      classify(
        '<script>window.__reactRouterContext.streamController.enqueue("invalid");</script>'
      ).status
    ).toBe('inconclusive')
  })
  it('bounds cyclic serialized data', () => {
    const table = [
      { _1: 2 },
      'loaderData',
      { _3: 4 },
      'routes/s.$postId',
      { _5: 6, _7: 8 },
      'kind',
      'post_with_profile',
      'postWithProfile',
      { _9: 10 },
      'post',
      { _9: 10 }
    ]
    const html = `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(table))});</script>`
    expect(classify(html).status).toBe('inconclusive')
  })
  it.each([
    'https://claude.ai/s/t_6aac1592586c8191a64acab3214f895c',
    `${url}/extra`,
    url.replace('t_', 't_bad'),
    url.replace('chatgpt.com', 'chatgpt.com.evil.test')
  ])('rejects unsafe or malformed URLs: %s', (value) => {
    expect(() => parseSourceUrl(value)).toThrow()
  })
})

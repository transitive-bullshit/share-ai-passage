import { describe, expect, it } from 'vitest'

import { messageMarkdown, messageText } from '../../lib/messages'
import { parseCodex } from '../../lib/providers/codex'

// Sanitized shapes observed in the user's anonymous public Codex snapshot.
const observedSnapshot = () => ({
  version: 1,
  title: 'A shared code discussion',
  turns: [
    {
      durationMs: 1000,
      items: [
        {
          type: 'userMessage',
          content: [{ type: 'text', text: 'Explain this code.' }]
        },
        { type: 'reasoning', summary: 'Consider the public example.' },
        {
          type: 'agentMessage',
          text: 'I will inspect the example.',
          phase: 'commentary'
        },
        {
          type: 'fileChange',
          status: 'completed',
          changes: [{ path: 'example.ts', diff: '+const greeting = "café"' }]
        },
        {
          type: 'agentMessage',
          text: '**Done.**\n\n```ts\nconst greeting = "café"\n```',
          phase: 'final_answer'
        }
      ]
    }
  ]
})

const snapshot = (items: unknown[]) => ({ version: 1, turns: [{ items }] })

describe('public Codex snapshots', () => {
  it('preserves public user text, summaries, commentary, and final answers in order', () => {
    const result = parseCodex(observedSnapshot(), 200)
    expect(result.status).toBe('available')
    if (result.status !== 'available') return
    expect(result.conversation.title).toBe('A shared code discussion')
    expect(result.conversation.parserVersion).toBe('codex-public-json-v2')
    expect(result.conversation.messages.map((entry) => entry.role)).toEqual([
      'user',
      'assistant',
      'assistant',
      'tool',
      'assistant'
    ])
    expect(result.conversation.messages.map(messageText)).toEqual([
      'Explain this code.',
      'Consider the public example.',
      'I will inspect the example.',
      '',
      'Done.\n\nconst greeting = "café"'
    ])
    expect(result.conversation.messages[1]!.content).toEqual([
      { type: 'output_text', text: 'Consider the public example.' }
    ])
    expect(result.conversation.messages.map((entry) => entry.phase)).toEqual([
      undefined,
      undefined,
      'commentary',
      undefined,
      'final_answer'
    ])
    expect(messageMarkdown(result.conversation.messages[3]!)).toBe(
      '[Attachment omitted]'
    )
    expect(messageMarkdown(result.conversation.messages[4]!)).toContain('```ts')
  })

  it('assigns stable distinct identities across turns', () => {
    const input = observedSnapshot()
    input.turns.push(structuredClone(input.turns[0]!))
    const first = parseCodex(input, 200)
    const second = parseCodex(input, 200)
    expect(first).toEqual(second)
    if (first.status !== 'available')
      throw new Error('Expected a readable snapshot')
    expect(
      new Set(first.conversation.messages.map((entry) => entry.id)).size
    ).toBe(10)
  })

  it('marks client-supported image items without turning placeholders into quotes', () => {
    // These image shapes come from the public viewer validator; this case is synthetic.
    const result = parseCodex(
      snapshot([
        {
          type: 'userMessage',
          content: [
            { type: 'image', url: 'codex:shared-image-unavailable' },
            { type: 'text', text: 'Describe the picture.' }
          ]
        },
        { type: 'imageView', url: 'codex:shared-image-unavailable' },
        {
          type: 'imageGeneration',
          status: 'completed',
          result: 'codex:shared-image-unavailable'
        },
        { type: 'agentMessage', text: 'A blue circle.' }
      ]),
      200
    )
    if (result.status !== 'available')
      throw new Error('Expected a readable snapshot')
    expect(result.conversation.messages.map(messageText)).toEqual([
      'Describe the picture.',
      '',
      '',
      'A blue circle.'
    ])
    expect(result.conversation.messages[0]!.content).toEqual([
      { type: 'omitted', kind: 'image', reason: 'not_exposed' },
      { type: 'input_text', text: 'Describe the picture.' }
    ])
    expect(messageMarkdown(result.conversation.messages[2]!)).toBe(
      '[Image omitted]'
    )
  })

  it('rejects an image-only snapshot rather than treating omission labels as text', () => {
    expect(() =>
      parseCodex(
        snapshot([
          {
            type: 'userMessage',
            content: [{ type: 'image', url: 'codex:shared-image-unavailable' }]
          }
        ]),
        200
      )
    ).toThrow('did not contain a readable conversation')
  })

  it.each([
    null,
    { version: 2, turns: [] },
    { version: 1, turns: [] },
    { version: 1, turns: [null] },
    snapshot([]),
    snapshot([null]),
    snapshot([{ type: 'agentMessage', text: ['invalid'] }]),
    snapshot([{ type: 'agentMessage', text: 'Incomplete', phase: 'analysis' }]),
    snapshot([{ type: 'userMessage', content: [] }]),
    snapshot([{ type: 'userMessage', content: [{ type: 'text', text: 42 }] }]),
    snapshot([{ type: 'userMessage', content: [{ type: 'futureContent' }] }]),
    snapshot([{ type: 'reasoning', summary: null }]),
    snapshot([{ type: 'fileChange', status: 'pending', changes: [] }]),
    snapshot([{ type: 'fileChange', status: 'completed', changes: [null] }]),
    snapshot([{ type: 'imageView', url: null }]),
    snapshot([{ type: 'imageGeneration', status: 'completed', result: null }]),
    snapshot([{ type: 'newProviderItem', text: 'Unrecognized schema' }])
  ])('keeps malformed or changed snapshots inconclusive: %j', (input) => {
    expect(parseCodex(input, 200).status).toBe('inconclusive')
  })

  it('does not publish a partial transcript when a later item is unrecognized', () => {
    expect(
      parseCodex(
        snapshot([
          { type: 'agentMessage', text: 'A readable beginning.' },
          { type: 'newProviderItem', text: 'A changed schema.' }
        ]),
        200
      ).status
    ).toBe('inconclusive')
  })

  it('only confirms removal from the exact observed missing-share response', () => {
    expect(parseCodex({ detail: 'Share not found' }, 404).status).toBe(
      'unavailable'
    )
    expect(parseCodex({ detail: 'Share not found' }, 403).status).toBe(
      'inconclusive'
    )
    expect(parseCodex({ detail: 'Not found' }, 404).status).toBe('inconclusive')
    expect(
      parseCodex({ detail: 'Share not found', other: true }, 404).status
    ).toBe('inconclusive')
  })

  it.each([401, 403, 404, 429, 500, 502, 503])(
    'does not parse HTTP %s as available',
    (status) => {
      expect(parseCodex(observedSnapshot(), status).status).toBe('inconclusive')
    }
  )

  it('enforces the shared normalized transcript limit', () => {
    expect(() =>
      parseCodex(
        snapshot([
          {
            type: 'userMessage',
            content: [{ type: 'text', text: 'A readable opening.' }]
          },
          { type: 'agentMessage', text: 'x'.repeat(1024 * 1024) }
        ]),
        200
      )
    ).toThrow('1 MiB')
  })
})

import { describe, expect, it } from 'vitest'

import type { MessageContent } from '../../lib/domain'
import { message, messageMarkdown, messageText } from '../../lib/messages'
import { finishConversation } from '../../lib/providers/normalize'

describe('saved message content', () => {
  it('preserves text around explicit media omissions without presenting labels as source text', () => {
    const content: MessageContent[] = [
      { type: 'input_text', text: '**Compare these.**' },
      { type: 'omitted', kind: 'audio', reason: 'not_exposed' },
      { type: 'input_text', text: 'Then inspect the clip.' },
      { type: 'omitted', kind: 'video', reason: 'unsupported' },
      { type: 'omitted', kind: 'file', reason: 'not_exposed', count: 2 }
    ]
    const captured = message('mixed', 'user', content)
    expect(captured.content).toEqual(content)
    expect(messageMarkdown(captured)).toBe(
      '**Compare these.**\n\n[Audio omitted]\n\nThen inspect the clip.\n\n[Video omitted]\n\n[2 attachments omitted]'
    )
    expect(messageText(captured)).toBe(
      'Compare these.\n\nThen inspect the clip.'
    )
  })

  it('keeps Markdown meaning when the source splits text across content blocks', () => {
    const captured = message('code', 'assistant', [
      { type: 'output_text', text: '```ts\nconst value =' },
      { type: 'output_text', text: '1\n```' }
    ])
    expect(messageText(captured)).toBe('const value =\n\n1')
  })

  it('does not treat media-only content as a readable conversation', () => {
    const captured = message('media', 'user', [
      { type: 'omitted', kind: 'image', reason: 'not_exposed' },
      { type: 'omitted', kind: 'audio', reason: 'not_exposed' },
      { type: 'omitted', kind: 'video', reason: 'unsupported' }
    ])
    expect(messageText(captured)).toBe('')
    expect(() => finishConversation('Media', [captured], 'test')).toThrow(
      'did not contain a readable conversation'
    )
  })

  it('counts stored structured content toward the transcript size limit', () => {
    const captured = message('oversize', 'user', [
      { type: 'input_text', text: 'A readable sentence.' },
      ...Array.from({ length: 20_000 }, (): MessageContent => ({
        type: 'omitted',
        kind: 'image',
        reason: 'not_exposed'
      }))
    ])
    expect(() => finishConversation('Media', [captured], 'test')).toThrow(
      '1 MiB'
    )
  })
})

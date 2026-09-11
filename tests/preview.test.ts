import { describe, expect, it } from 'vitest'

import { type ExtractedConversation, type Message } from '../lib/domain'
import {
  excerptFor,
  fallbackSuggestion,
  validateSelection
} from '../lib/preview'

const messages: Message[] = [
  {
    id: 'first',
    speaker: 'user',
    markdown: 'A 🦊 walks.\n\nNext line.',
    text: 'A 🦊 walks.\n\nNext line.'
  },
  {
    id: 'second',
    speaker: 'assistant',
    markdown: 'Entirely different.',
    text: 'Entirely different.'
  }
]

const selection = {
  title: 'A little forest story',
  messageId: 'first',
  start: 2,
  end: 9
}
const conversation: ExtractedConversation = {
  title: 'Forest stories',
  messages,
  parserVersion: 'test'
}

describe('faithful preview selections', () => {
  it('uses code-point offsets and preserves the speaker', () => {
    expect(excerptFor(messages, selection)).toEqual({
      text: '🦊 walks',
      speaker: 'user'
    })
    expect(excerptFor(messages, { ...selection, end: 3 }).text).toBe('🦊')
  })

  it('derives quotes from saved text and ignores caller-supplied quote text', () => {
    const validated = validateSelection(messages, {
      ...selection,
      quote: 'An invented quote'
    })
    expect(excerptFor(messages, validated).text).toBe('🦊 walks')
    expect(validated).not.toHaveProperty('quote')
  })

  it('preserves internal whitespace and line breaks in excerpts', () => {
    expect(excerptFor(messages, { ...selection, start: 9, end: 22 }).text).toBe(
      '.\n\nNext line.'
    )
  })

  it('normalizes title whitespace without rewriting the excerpt', () => {
    expect(
      validateSelection(messages, {
        ...selection,
        title: '  A\n little\tstory  '
      }).title
    ).toBe('A little story')
  })

  it('counts non-BMP characters once in both limits', () => {
    const unicode = [{ ...messages[0]!, text: '🦊'.repeat(241) }]
    expect(
      validateSelection(unicode, {
        ...selection,
        title: '🌱'.repeat(60),
        start: 0,
        end: 240
      }).end
    ).toBe(240)
    expect(() =>
      validateSelection(unicode, { ...selection, title: '🌱'.repeat(61) })
    ).toThrow('60 characters')
    expect(() =>
      validateSelection(unicode, { ...selection, start: 0, end: 241 })
    ).toThrow('240 characters')
  })

  it.each([
    null,
    [],
    {},
    { ...selection, title: '' },
    { ...selection, title: '\n\t ' },
    { ...selection, title: '\uD800' },
    { ...selection, title: 'invalid\0title' },
    { ...selection, messageId: 'missing' },
    { ...selection, start: -1 },
    { ...selection, start: 0.5 },
    { ...selection, start: '2' },
    { ...selection, start: Number.NaN },
    { ...selection, end: Number.POSITIVE_INFINITY },
    { ...selection, end: 2 },
    { ...selection, end: 100 },
    { ...selection, start: 10, end: 12 }
  ])('rejects invalid selection %j', (input) => {
    expect(() => validateSelection(messages, input)).toThrow()
  })

  it('rejects malformed surrogate text', () => {
    expect(() =>
      validateSelection([{ ...messages[0]!, text: '\uD800' }], {
        ...selection,
        start: 0,
        end: 1
      })
    ).toThrow('valid text')
  })
})

describe('legacy excerpt selection', () => {
  it('uses the source title and the first usable saved passage', () => {
    const input = {
      ...conversation,
      messages: [{ ...messages[0]!, id: 'empty', text: '\n  ' }, ...messages]
    }
    const fallback = fallbackSuggestion(input)
    expect(fallback.title).toBe('Forest stories')
    expect(fallback.messageId).toBe('first')
    expect(excerptFor(input.messages, fallback).text).toBe(messages[0]!.text)
    expect(fallbackSuggestion(input)).toEqual(fallback)
  })

  it('trims only the selected range while leaving saved text intact', () => {
    const input = {
      ...conversation,
      title: '',
      messages: [{ ...messages[0]!, text: ` \n${'forest path '.repeat(30)}  ` }]
    }
    const original = input.messages[0]!.text
    const fallback = fallbackSuggestion(input)
    const excerpt = excerptFor(input.messages, fallback).text
    expect(fallback.title).toBe('A conversation worth sharing')
    expect(excerpt.length).toBeLessThanOrEqual(240)
    expect(excerpt).toBe(excerpt.trim())
    expect(original.includes(excerpt)).toBe(true)
    expect(input.messages[0]!.text).toBe(original)
  })

  it('supports long words without splitting surrogate pairs', () => {
    const input = {
      ...conversation,
      title: '🦊'.repeat(61),
      messages: [{ ...messages[0]!, text: '🌱'.repeat(300) }]
    }
    const fallback = fallbackSuggestion(input)
    expect(Array.from(fallback.title)).toHaveLength(60)
    expect(Array.from(excerptFor(input.messages, fallback).text)).toHaveLength(
      240
    )
  })

  it('rejects a conversation with no usable text', () => {
    expect(() => fallbackSuggestion({ ...conversation, messages: [] })).toThrow(
      'no text'
    )
  })
})

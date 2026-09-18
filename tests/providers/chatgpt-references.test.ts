import { describe, expect, it } from 'vitest'
import { parseChatgpt } from '../../lib/providers/chatgpt'
import { messageMarkdown } from '../../lib/messages'

const sourceUrl = 'https://chatgpt.com/s/t_6aac1592586c8191a64acab3214f895c'
const citation = 'citeturn125365view2'
const text = `😀 Evidence. ${citation}\n\n- Explain the argument`
const references = [
  {
    type: 'grouped_webpages',
    matched_text: citation,
    start_idx: 12,
    end_idx: 34,
    items: [
      {
        attribution: 'Oxford Academic',
        url: 'https://academic.oup.com/book/60794/chapter/530063399'
      }
    ]
  },
  {
    type: 'followup_a',
    matched_text: 'Explain the argument',
    start_idx: 38,
    end_idx: 58,
    prompt_text: 'Explain the argument in detail.'
  }
]
function imported(refs: unknown = references, input = text) {
  const result = parseChatgpt(
    {
      is_public: true,
      title: 'Example',
      linear_conversation: [
        {
          message: {
            id: 'answer',
            author: { role: 'assistant' },
            content: { parts: [input] },
            metadata: { content_references: refs }
          }
        }
      ]
    },
    200,
    sourceUrl
  )
  if (result.status !== 'available') throw new Error('Expected available')
  return messageMarkdown(result.conversation.messages[0]!)
}
describe('ChatGPT source references', () => {
  it('restores citation destinations and follow-up prompts from public metadata', () => {
    const result = imported()
    expect(result).not.toContain(citation)
    expect(result).toContain(
      '[Oxford Academic](https://academic.oup.com/book/60794/chapter/530063399)'
    )
    expect(result).toContain(
      `[Explain the argument](${sourceUrl} "Explain the argument in detail.")`
    )
  })
})

it('retains unresolved markers instead of inventing destinations', () => {
  expect(
    imported([{ ...references[0], items: [{ url: 'javascript:alert(1)' }] }])
  ).toBe(text)
  expect(imported([{ ...references[0], start_idx: 0 }])).toBe(text)
  expect(imported([{ ...references[0], items: [] }])).toBe(text)
})
it('preserves distinct sources and deduplicates repeated destinations in grouped citations', () => {
  const result = imported([
    {
      ...references[0],
      items: [
        { attribution: 'First', url: 'https://example.com/one' },
        { attribution: 'Second', url: 'https://example.com/two' },
        { attribution: 'First', url: 'https://example.com/one' }
      ]
    }
  ])
  expect(result).toContain(
    '([First](https://example.com/one), [Second](https://example.com/two))'
  )
})
it('replaces legacy follow-up placeholder links without nesting links', () => {
  const input = '- [Continue](f)'
  const result = imported(
    [
      {
        type: 'followup_a',
        start_idx: 3,
        end_idx: 11,
        matched_text: 'Continue',
        prompt_text: 'Explain more.'
      }
    ],
    input
  )
  expect(result).toBe(`- [Continue](${sourceUrl} "Explain more.")`)
})
it('escapes labels and destination punctuation rather than importing metadata as Markdown', () => {
  const result = imported([
    {
      ...references[0],
      items: [
        {
          attribution: '[fake](https://evil.test)',
          url: 'https://example.com/a(b)'
        }
      ]
    }
  ])
  expect(result).toContain('https://example.com/a%28b%29')
  expect(result).not.toContain('[fake](https://evil.test)')
})

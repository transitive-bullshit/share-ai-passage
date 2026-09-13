import { describe, expect, it } from 'vitest'

import { message } from '../lib/messages'
import { groupReaderMessages } from '../lib/reader'

describe('conversation reading projection', () => {
  it.each([undefined, 'final_answer'] as const)(
    'folds legacy Codex activity around an answer with phase %s',
    (phase) => {
      const messages = [
        message('codex-0-0', 'user', 'Question'),
        message('codex-0-1', 'assistant', 'Old flattened summary'),
        message('codex-0-2', 'assistant', 'Progress', 'commentary'),
        message('codex-0-3', 'assistant', 'Another summary'),
        message('codex-0-4', 'assistant', 'Answer', phase),
        message('codex-0-5', 'tool', 'File change')
      ]
      const original = structuredClone(messages)
      const groups = groupReaderMessages(messages, 'codex-public-json-v2')
      expect(
        groups.map((group) => [
          group.type,
          group.entries.map((entry) => entry.index)
        ])
      ).toEqual([
        ['message', [0]],
        ['activity', [1, 2, 3]],
        ['message', [4]],
        ['activity', [5]]
      ])
      expect(messages).toEqual(original)
      expect(
        groups.flatMap((group) => group.entries.map((entry) => entry.message))
      ).toEqual(messages)
    }
  )

  it('keeps an answer per Codex turn, including earlier explicit final answers', () => {
    const groups = groupReaderMessages(
      [
        message('codex-0-0', 'user', 'First question'),
        message('codex-0-1', 'assistant', 'Summary'),
        message('codex-0-2', 'assistant', 'First answer', 'final_answer'),
        message('codex-0-3', 'assistant', 'Additional answer', 'final_answer'),
        message('codex-1-0', 'user', 'Follow-up'),
        message('codex-1-1', 'assistant', 'Summary'),
        message('codex-1-2', 'assistant', 'Second answer')
      ],
      'codex-public-json-v2'
    )
    expect(
      groups
        .filter((group) => group.type === 'message')
        .flatMap((group) => group.entries.map((entry) => entry.index))
    ).toEqual([0, 2, 3, 4, 6])
  })

  it('does not infer reasoning from ordinary assistant messages or text', () => {
    const messages = [
      message('codex-0-0', 'assistant', 'Planning is useful.'),
      message('codex-0-1', 'assistant', 'Here is another reply.')
    ]
    for (const version of [
      '',
      'chatgpt-public-json-v2',
      'claude-public-json-v2',
      'codex-public-json-v3'
    ]) {
      expect(
        groupReaderMessages(messages, version).every(
          (group) => group.type === 'message'
        )
      ).toBe(true)
    }
  })

  it('still exposes a last unphased legacy reply when the source has no explicit final', () => {
    const groups = groupReaderMessages(
      [message('codex-0-0', 'assistant', 'Partial response')],
      'codex-public-json-v2'
    )
    expect(groups[0]?.type).toBe('message')
  })
})

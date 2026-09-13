import type { Message } from './domain'
import { messageMarkdown } from './messages'

/** Codex's public share displays the input inside its delegation envelope. */
export function readerMessageContent(message: Message) {
  const markdown = messageMarkdown(message)
  const delegated =
    message.role === 'user' && /^codex-\d+-\d+$/.test(message.id)
      ? /^<codex_delegation>\s*<source_thread_id>[\w-]*<\/source_thread_id>\s*<input>([\s\S]*)<\/input>\s*<\/codex_delegation>$/.exec(
          markdown.trim()
        )
      : null
  return {
    markdown: delegated ? delegated[1]!.trim() : markdown,
    fromTask: Boolean(delegated)
  }
}

export type ReaderEntry = { message: Message; index: number }
export type ReaderGroup = {
  type: 'message' | 'activity'
  entries: ReaderEntry[]
}

/** A reading projection only: saved messages and source phases stay intact. */
export function groupReaderMessages(messages: Message[], parserVersion = '') {
  const legacyCodex = /^codex-public-json-v[12]$/.test(parserVersion)
  const lastLegacyReply = new Map<string, number>()
  const codexTurn = (entry: Message) => /^codex-(\d+)-\d+$/.exec(entry.id)?.[1]

  // Older Codex captures flattened summaries into unphased assistant text.
  // Keep the last unphased answer (or every explicit final) in each saved turn.
  // Earlier work remains available in the disclosure, never deleted or retyped.
  if (legacyCodex) {
    messages.forEach((entry, index) => {
      const turn = codexTurn(entry)
      if (
        turn !== undefined &&
        entry.role === 'assistant' &&
        entry.phase !== 'commentary'
      ) {
        lastLegacyReply.set(turn, index)
      }
    })
  }

  const groups: ReaderGroup[] = []
  messages.forEach((entry, index) => {
    const turn = codexTurn(entry)
    const activity =
      entry.kind === 'reasoning_summary' ||
      entry.phase === 'commentary' ||
      entry.role === 'tool' ||
      (legacyCodex &&
        turn !== undefined &&
        entry.role === 'assistant' &&
        !entry.phase &&
        lastLegacyReply.get(turn) !== index)
    const previous = groups.at(-1)
    if (activity && previous?.type === 'activity') {
      previous.entries.push({ message: entry, index })
    } else {
      groups.push({
        type: activity ? 'activity' : 'message',
        entries: [{ message: entry, index }]
      })
    }
  })
  return groups
}

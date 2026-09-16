import type { Message } from './domain'
import { messageMarkdown } from './messages'

export type QuestionReply = { question: string; answer: string }

function questionReplies(value: string): QuestionReply[] | null {
  const payload = value.trim()
  if (!payload.startsWith('[') || !payload.endsWith(']')) return null

  try {
    const parsed: unknown = JSON.parse(payload)
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (entry): entry is QuestionReply =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as QuestionReply).question === 'string' &&
          typeof (entry as QuestionReply).answer === 'string'
      )
    ) {
      return parsed.map(({ question, answer }) => ({ question, answer }))
    }
  } catch {
    // Codex currently emits an unescaped array in questionItemId. The visible
    // question and answer fields remain valid JSON strings, so recover only
    // those exact adjacent fields and reject anything else as ordinary text.
  }

  const fieldPattern =
    /"question"\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*"answer"\s*:\s*("(?:\\.|[^"\\])*")/g
  const matches = [...payload.matchAll(fieldPattern)]
  const questionCount = payload.match(/"question"\s*:/g)?.length ?? 0
  const answerCount = payload.match(/"answer"\s*:/g)?.length ?? 0
  if (
    matches.length === 0 ||
    matches.length !== questionCount ||
    matches.length !== answerCount
  ) {
    return null
  }
  try {
    return matches.map((match) => ({
      question: JSON.parse(match[1]!) as string,
      answer: JSON.parse(match[2]!) as string
    }))
  } catch {
    return null
  }
}

/** Codex's public share displays the input inside its delegation envelope. */
export function readerMessageContent(message: Message) {
  const markdown = messageMarkdown(message)
  const codexUser =
    message.role === 'user' && /^codex-\d+-\d+$/.test(message.id)
  const delegated = codexUser
    ? /^<codex_delegation>\s*<source_thread_id>[\w-]*<\/source_thread_id>\s*<input>([\s\S]*)<\/input>\s*<\/codex_delegation>$/.exec(
        markdown.trim()
      )
    : null
  const replyEnvelope = codexUser
    ? /^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/.exec(
        markdown.trim()
      )
    : null
  return {
    markdown: delegated ? delegated[1]!.trim() : markdown,
    fromTask: Boolean(delegated),
    questionReplies: replyEnvelope ? questionReplies(replyEnvelope[1]!) : null
  }
}

type ReaderEntry = { message: Message; index: number }
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

import { limits, type ExtractedConversation, type Message } from '../domain'
import { messageText } from '../messages'

export { message, textContent } from '../messages'

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function finishConversation(
  title: unknown,
  messages: Message[],
  parserVersion: string
): ExtractedConversation {
  if (
    !messages.length ||
    !messages.some((entry) => messageText(entry).trim())
  ) {
    throw new Error('The public share did not contain a readable conversation.')
  }
  if (new Set(messages.map((entry) => entry.id)).size !== messages.length) {
    throw new Error('The provider returned duplicate message identities.')
  }
  if (Buffer.byteLength(JSON.stringify(messages)) > limits.transcriptBytes) {
    throw new Error(
      'This conversation exceeds the supported 1 MiB normalized transcript limit.'
    )
  }
  return {
    title:
      typeof title === 'string' && title.trim()
        ? title.trim()
        : 'A shared conversation',
    messages,
    parserVersion
  }
}

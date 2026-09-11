import {
  type ExtractedConversation,
  limits,
  type Message,
  type PreviewSelection
} from './domain'

const invalidUnicode = /[\uD800-\uDFFF]/u

function cleanTitle(title: string) {
  return title.replace(/\s+/gu, ' ').trim()
}

/** Validate ranges against the saved message. Never accept caller-supplied quote text. */
export function validateSelection(
  messages: Message[],
  input: unknown
): PreviewSelection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Choose a title and a passage from the conversation.')
  }

  const value = input as Record<string, unknown>
  if (typeof value.title !== 'string') {
    throw new Error('Enter a title for your preview.')
  }

  const title = cleanTitle(value.title)
  if (!title || invalidUnicode.test(title) || title.includes('\0')) {
    throw new Error('Enter a title containing valid text.')
  }
  if (Array.from(title).length > limits.title) {
    throw new Error(`Keep your title within ${limits.title} characters.`)
  }

  const message = messages.find((candidate) => candidate.id === value.messageId)
  if (!message) {
    throw new Error('Choose a message from this saved conversation.')
  }

  const { start, end } = value
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start
  ) {
    throw new Error('Choose a valid, nonempty passage from one message.')
  }

  const characters = Array.from(message.text)
  if (end > characters.length) {
    throw new Error('The selected passage extends beyond this message.')
  }
  if (end - start > limits.excerpt) {
    throw new Error(`Keep your excerpt within ${limits.excerpt} characters.`)
  }

  const text = characters.slice(start, end).join('')
  if (!text.trim() || invalidUnicode.test(text) || text.includes('\0')) {
    throw new Error('Choose a passage containing valid text.')
  }

  return { title, messageId: message.id, start, end }
}

export function excerptFor(messages: Message[], selection: PreviewSelection) {
  const validated = validateSelection(messages, selection)
  const message = messages.find(
    (candidate) => candidate.id === validated.messageId
  )!

  return {
    text: Array.from(message.text)
      .slice(validated.start, validated.end)
      .join(''),
    speaker: message.speaker
  }
}

export function fallbackSuggestion(
  conversation: ExtractedConversation
): PreviewSelection {
  const message = conversation.messages.find((candidate) =>
    candidate.text.trim()
  )
  if (!message) {
    throw new Error('This conversation has no text to use in a preview.')
  }

  const characters = Array.from(message.text)
  const start = characters.findIndex((character) => character.trim())
  let end = Math.min(start + limits.excerpt, characters.length)

  // Prefer a word boundary when trimming, without changing the original passage.
  if (end < characters.length && characters[end]?.trim()) {
    for (let index = end - 1; index > start + limits.excerpt / 2; index--) {
      if (!characters[index]!.trim()) {
        end = index
        break
      }
    }
  }
  while (end > start && !characters[end - 1]!.trim()) end--

  const title =
    Array.from(cleanTitle(conversation.title))
      .slice(0, limits.title)
      .join('')
      .trim() || 'A conversation worth sharing'

  return validateSelection(conversation.messages, {
    title,
    messageId: message.id,
    start,
    end
  })
}

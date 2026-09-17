import type {
  ImageSource,
  Message,
  MessageContent,
  ProviderResult
} from '../domain'
import { finishConversation, message, record } from './normalize'

const invalidSnapshot = (): ProviderResult => ({
  status: 'inconclusive',
  reason: 'ChatGPT did not return a supported public Codex conversation.'
})

export function parseCodex(payload: unknown, status: number): ProviderResult {
  const data = record(payload)
  // Observed from the anonymous endpoint using a nonexistent Codex share ID.
  if (
    status === 404 &&
    data?.detail === 'Share not found' &&
    Object.keys(data).length === 1
  ) {
    return {
      status: 'unavailable',
      reason:
        'ChatGPT confirms that the public conversation is no longer available.'
    }
  }
  if (
    status !== 200 ||
    data?.version !== 1 ||
    !Array.isArray(data.turns) ||
    !data.turns.length ||
    (data.title !== undefined && typeof data.title !== 'string')
  ) {
    return invalidSnapshot()
  }

  const messages: Message[] = []
  const imageSources: ImageSource[] = []
  const image = (url: string, messageId: string, contentIndex = 0) => {
    if (
      /^codex:shared-asset\/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(url) ||
      url.startsWith('https://')
    )
      imageSources.push({ messageId, contentIndex, url })
    return omittedImage(url)
  }
  for (const [turnIndex, turnValue] of data.turns.entries()) {
    const turn = record(turnValue)
    if (!Array.isArray(turn?.items) || !turn.items.length) {
      return invalidSnapshot()
    }
    for (const [itemIndex, itemValue] of turn.items.entries()) {
      const item = record(itemValue)
      if (!item) return invalidSnapshot()
      // The immutable snapshot has no item IDs; positions are stable within it.
      const id = `codex-${turnIndex}-${itemIndex}`
      switch (item.type) {
        case 'userMessage': {
          if (!Array.isArray(item.content) || !item.content.length) {
            return invalidSnapshot()
          }
          const content: MessageContent[] = []
          for (const value of item.content) {
            const block = record(value)
            if (block?.type === 'text' && typeof block.text === 'string') {
              content.push({ type: 'input_text', text: block.text })
            } else if (
              block?.type === 'image' &&
              typeof block.url === 'string'
            ) {
              content.push(image(block.url, id, content.length))
            } else {
              return invalidSnapshot()
            }
          }
          messages.push(message(id, 'user', content))
          break
        }
        case 'agentMessage':
          if (
            typeof item.text !== 'string' ||
            (item.phase !== undefined &&
              item.phase !== 'commentary' &&
              item.phase !== 'final_answer')
          ) {
            return invalidSnapshot()
          }
          messages.push(message(id, 'assistant', item.text, item.phase))
          break

        case 'reasoning':
          if (typeof item.summary !== 'string') return invalidSnapshot()
          // Preserve only the summary explicitly published in the public snapshot.
          messages.push({
            ...message(id, 'assistant', item.summary),
            kind: 'reasoning_summary'
          })
          break

        case 'fileChange':
          if (
            item.status !== 'completed' ||
            !Array.isArray(item.changes) ||
            !item.changes.length ||
            item.changes.some((value) => {
              const change = record(value)
              return (
                typeof change?.diff !== 'string' ||
                (change.path !== undefined && typeof change.path !== 'string')
              )
            })
          ) {
            return invalidSnapshot()
          }
          messages.push(
            message(id, 'tool', [
              { type: 'omitted', kind: 'file', reason: 'unsupported' }
            ])
          )
          break

        case 'imageView':
          if (typeof item.url !== 'string') return invalidSnapshot()
          messages.push(message(id, 'tool', [image(item.url, id)]))
          break

        case 'imageGeneration':
          if (item.status !== 'completed' || typeof item.result !== 'string') {
            return invalidSnapshot()
          }
          messages.push(message(id, 'tool', [image(item.result, id)]))
          break

        default:
          return invalidSnapshot()
      }
    }
  }
  const conversation = finishConversation(
    data.title,
    messages,
    'codex-public-json-v4'
  )
  if (imageSources.length) conversation.imageSources = imageSources
  return { status: 'available', conversation }
}

function omittedImage(reference: string): MessageContent {
  return {
    type: 'omitted',
    kind: 'image',
    reason:
      reference === 'codex:shared-image-unavailable'
        ? 'not_exposed'
        : 'unsupported'
  }
}

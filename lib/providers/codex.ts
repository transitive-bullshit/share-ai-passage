import type { Message, ProviderResult } from '../domain'
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
          const markdown: string[] = []
          const text: string[] = []
          for (const value of item.content) {
            const block = record(value)
            if (block?.type === 'text' && typeof block.text === 'string') {
              markdown.push(block.text)
              text.push(block.text)
            } else if (
              block?.type === 'image' &&
              typeof block.url === 'string'
            ) {
              markdown.push('[Image omitted]')
            } else {
              return invalidSnapshot()
            }
          }
          messages.push(
            message(id, 'user', markdown.join('\n\n'), text.join('\n\n'))
          )
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
          messages.push(message(id, 'assistant', item.text))
          break

        case 'reasoning':
          if (typeof item.summary !== 'string') return invalidSnapshot()
          // Only the summary explicitly published in the public snapshot is present.
          messages.push(
            message(
              id,
              'assistant',
              `[Reasoning summary]\n\n${item.summary}`,
              item.summary
            )
          )
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
          messages.push(message(id, 'tool', '[File changes omitted]', ''))
          break

        case 'imageView':
          if (typeof item.url !== 'string') return invalidSnapshot()
          messages.push(message(id, 'tool', '[Image omitted]', ''))
          break

        case 'imageGeneration':
          if (item.status !== 'completed' || typeof item.result !== 'string') {
            return invalidSnapshot()
          }
          messages.push(message(id, 'tool', '[Generated image omitted]', ''))
          break

        default:
          return invalidSnapshot()
      }
    }
  }
  return {
    status: 'available',
    conversation: finishConversation(
      data.title,
      messages,
      'codex-public-json-v1'
    )
  }
}

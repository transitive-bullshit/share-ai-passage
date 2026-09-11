import type { Message, ProviderResult } from '../domain'
import { finishConversation, message, record } from './normalize'

export function parseChatgpt(payload: unknown, status: number): ProviderResult {
  const data = record(payload)
  if (!data)
    return {
      status: 'inconclusive',
      reason: 'ChatGPT returned an unrecognized response.'
    }
  // This exact provider response was observed on the nonexistent-share control.
  const detail = record(data.detail)
  if (
    status === 404 &&
    detail?.reason === 'not_found' &&
    detail.code === 'shared_conversation_deleted'
  ) {
    return {
      status: 'unavailable',
      reason:
        'ChatGPT confirms that the public conversation is no longer available.'
    }
  }
  if (
    status !== 200 ||
    !Array.isArray(data.linear_conversation) ||
    data.is_public !== true
  ) {
    return {
      status: 'inconclusive',
      reason: 'ChatGPT did not return a verified public conversation.'
    }
  }
  const messages: Message[] = []
  for (const item of data.linear_conversation) {
    const node = record(item)
    if (!node)
      throw new Error('ChatGPT returned a malformed conversation turn.')
    if (node.message === null || node.message === undefined) continue
    const entry = record(node.message)
    const author = record(entry?.author)
    const metadata = record(entry?.metadata)
    if (metadata?.is_visually_hidden_from_conversation === true) continue
    if (!entry || !author || typeof entry.id !== 'string')
      throw new Error('ChatGPT returned a malformed message.')
    const speaker = author.role
    if (
      speaker !== 'user' &&
      speaker !== 'assistant' &&
      speaker !== 'system' &&
      speaker !== 'tool'
    ) {
      throw new Error('ChatGPT returned an unsupported speaker label.')
    }
    const content = record(entry.content)
    const pieces: string[] = []
    const excerptPieces: string[] = []
    const addText = (text: string) => {
      pieces.push(text)
      excerptPieces.push(text)
    }
    if (Array.isArray(content?.parts)) {
      for (const part of content.parts) {
        if (typeof part === 'string') addText(part)
        else {
          const block = record(part)
          if (block?.content_type === 'image_asset_pointer')
            pieces.push('[Image omitted]')
          else if (typeof block?.text === 'string') addText(block.text)
          else pieces.push('[Unsupported media omitted]')
        }
      }
    } else if (typeof content?.text === 'string') {
      addText(
        content.content_type === 'code'
          ? `\`\`\`\n${content.text}\n\`\`\``
          : content.text
      )
    } else {
      pieces.push('[Unsupported content omitted]')
    }
    if (Array.isArray(metadata?.attachments) && metadata.attachments.length) {
      pieces.push(
        `[${metadata.attachments.length} attachment${metadata.attachments.length === 1 ? '' : 's'} omitted]`
      )
    }
    if (speaker === 'tool')
      pieces.unshift('[Tool output; interactive content omitted]')
    messages.push(
      message(
        entry.id,
        speaker,
        pieces.join('\n\n'),
        excerptPieces.join('\n\n')
      )
    )
  }
  return {
    status: 'available',
    conversation: finishConversation(
      data.title,
      messages,
      'chatgpt-public-json-v1'
    )
  }
}

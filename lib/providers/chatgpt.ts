import type { Message, MessageContent, ProviderResult } from '../domain'
import { finishConversation, message, record, textContent } from './normalize'
import { exposedImage } from './images'
import type { ImageSource } from '../domain'

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
  const imageSources: ImageSource[] = []
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
    const role = author.role
    if (
      role !== 'user' &&
      role !== 'assistant' &&
      role !== 'system' &&
      role !== 'developer' &&
      role !== 'tool'
    ) {
      throw new Error('ChatGPT returned an unsupported message role.')
    }
    const content = record(entry.content)
    const parts: MessageContent[] = []
    const addText = (text: string) => parts.push(textContent(role, text))
    if (Array.isArray(content?.parts)) {
      for (const part of content.parts) {
        if (typeof part === 'string') addText(part)
        else {
          const block = record(part)
          if (block?.content_type === 'image_asset_pointer') {
            exposedImage(block, imageSources, entry.id, parts.length)
            parts.push({
              type: 'omitted',
              kind: 'image',
              reason: 'not_exposed'
            })
          } else if (typeof block?.text === 'string') addText(block.text)
          else
            parts.push({
              type: 'omitted',
              kind: 'unknown',
              reason: 'unsupported'
            })
        }
      }
    } else if (typeof content?.text === 'string') {
      addText(
        content.content_type === 'code'
          ? `\`\`\`\n${content.text}\n\`\`\``
          : content.text
      )
    } else {
      parts.push({ type: 'omitted', kind: 'unknown', reason: 'unsupported' })
    }
    if (Array.isArray(metadata?.attachments) && metadata.attachments.length) {
      parts.push({
        type: 'omitted',
        kind: 'file',
        reason: 'not_exposed',
        count: metadata.attachments.length
      })
    }
    if (role === 'tool') {
      imageSources
        .filter((image) => image.messageId === entry.id)
        .forEach((image) => image.contentIndex++)
      parts.unshift({ type: 'omitted', kind: 'tool', reason: 'unsupported' })
    }
    messages.push(message(entry.id, role, parts))
  }
  const conversation = finishConversation(
    data.title,
    messages,
    'chatgpt-public-json-v3'
  )
  if (imageSources.length) conversation.imageSources = imageSources
  return { status: 'available', conversation }
}

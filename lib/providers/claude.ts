import type { Message, MessageContent, ProviderResult } from '../domain'
import { finishConversation, message, record, textContent } from './normalize'
import { exposedImage } from './images'
import type { ImageSource } from '../domain'

export function parseClaude(payload: unknown, status: number): ProviderResult {
  const data = record(payload)
  if (!data)
    return {
      status: 'inconclusive',
      reason: 'Claude returned an unrecognized response.'
    }
  const error = record(data.error)
  if (
    status === 404 &&
    data.type === 'error' &&
    error?.type === 'not_found_error' &&
    error.message === 'The requested snapshot was not found.'
  ) {
    return {
      status: 'unavailable',
      reason:
        'Claude confirms that the public conversation is no longer available.'
    }
  }
  if (
    status !== 200 ||
    data.is_public !== true ||
    !Array.isArray(data.chat_messages)
  ) {
    return {
      status: 'inconclusive',
      reason: 'Claude did not return a verified public conversation.'
    }
  }
  const entries = data.chat_messages
    .map((entry) => {
      const value = record(entry)
      if (
        !value ||
        typeof value.uuid !== 'string' ||
        !Number.isInteger(value.index)
      )
        throw new Error('Claude returned a malformed conversation turn.')
      return value
    })
    .sort((a, b) => Number(a.index) - Number(b.index))
  const imageSources: ImageSource[] = []
  const messages: Message[] = entries.map((entry) => {
    const role = entry.sender === 'human' ? 'user' : entry.sender
    if (role !== 'user' && role !== 'assistant')
      throw new Error('Claude returned an unsupported message role.')
    if (entry.truncated === true)
      throw new Error(
        'Claude returned a truncated conversation. This share cannot be captured in full.'
      )
    const content: MessageContent[] = []
    let inlineImages = 0
    if (Array.isArray(entry.content) && entry.content.length) {
      for (const value of entry.content) {
        const block = record(value)
        if (block?.type === 'text' && typeof block.text === 'string') {
          content.push(textContent(role, block.text))
        } else if (block?.type === 'thinking') {
          content.push({
            type: 'omitted',
            kind: 'thinking',
            reason: 'unsupported'
          })
        } else if (
          block?.type === 'tool_use' ||
          block?.type === 'tool_result'
        ) {
          content.push({
            type: 'omitted',
            kind: 'artifact',
            reason: 'unsupported'
          })
        } else if (block?.type === 'image') {
          exposedImage(block, imageSources, String(entry.uuid), content.length)
          content.push({
            type: 'omitted',
            kind: 'image',
            reason: 'not_exposed'
          })
          inlineImages++
        } else {
          content.push({
            type: 'omitted',
            kind: 'unknown',
            reason: 'unsupported'
          })
        }
      }
    } else if (typeof entry.text === 'string') {
      content.push(textContent(role, entry.text))
    } else {
      throw new Error('Claude returned a message without readable content.')
    }
    const reportedImages = positiveCount(entry.image_count)
    // Counts describe the whole message; inline images already have a block.
    const images = Math.max(0, reportedImages - inlineImages)
    const files = Math.max(
      positiveCount(entry.file_count),
      Array.isArray(entry.files) ? entry.files.length : 0,
      Array.isArray(entry.attachments) ? entry.attachments.length : 0
    )
    if (images) {
      content.push({
        type: 'omitted',
        kind: 'image',
        reason: 'not_exposed',
        count: images
      })
    }
    if (files) {
      content.push({
        type: 'omitted',
        kind: 'file',
        reason: 'not_exposed',
        count: files
      })
    }
    return message(String(entry.uuid), role, content)
  })
  const conversation = finishConversation(
    data.snapshot_name,
    messages,
    'claude-public-json-v3'
  )
  if (imageSources.length) conversation.imageSources = imageSources
  return { status: 'available', conversation }
}

function positiveCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : 0
}

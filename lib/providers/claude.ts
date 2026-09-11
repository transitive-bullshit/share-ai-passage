import type { Message, ProviderResult } from '../domain'
import { finishConversation, message, record } from './normalize'

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
  const messages: Message[] = entries.map((entry) => {
    const speaker = entry.sender === 'human' ? 'user' : entry.sender
    if (speaker !== 'user' && speaker !== 'assistant')
      throw new Error('Claude returned an unsupported speaker label.')
    if (entry.truncated === true)
      throw new Error(
        'Claude returned a truncated conversation. This share cannot be captured in full.'
      )
    const pieces: string[] = []
    const excerptPieces: string[] = []
    const addText = (text: string) => {
      pieces.push(text)
      excerptPieces.push(text)
    }
    if (Array.isArray(entry.content) && entry.content.length) {
      for (const value of entry.content) {
        const block = record(value)
        if (block?.type === 'text' && typeof block.text === 'string')
          addText(block.text)
        else if (block?.type === 'thinking') pieces.push('[Thinking omitted]')
        else if (block?.type === 'tool_use' || block?.type === 'tool_result')
          pieces.push('[Tool or interactive artifact omitted]')
        else if (block?.type === 'image') pieces.push('[Image omitted]')
        else pieces.push('[Unsupported content omitted]')
      }
    } else if (typeof entry.text === 'string') {
      addText(entry.text)
    } else {
      throw new Error('Claude returned a message without readable content.')
    }
    const images = typeof entry.image_count === 'number' ? entry.image_count : 0
    const files = Math.max(
      typeof entry.file_count === 'number' ? entry.file_count : 0,
      Array.isArray(entry.files) ? entry.files.length : 0,
      Array.isArray(entry.attachments) ? entry.attachments.length : 0
    )
    if (images)
      pieces.push(`[${images} image${images === 1 ? '' : 's'} omitted]`)
    if (files)
      pieces.push(`[${files} attachment${files === 1 ? '' : 's'} omitted]`)
    return message(
      String(entry.uuid),
      speaker,
      pieces.join('\n\n'),
      excerptPieces.join('\n\n')
    )
  })
  return {
    status: 'available',
    conversation: finishConversation(
      data.snapshot_name,
      messages,
      'claude-public-json-v1'
    )
  }
}

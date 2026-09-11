import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'

import type { Message, MessageContent } from './domain'

const markdownParser = unified().use(remarkParse).use(remarkGfm)

export function plainText(markdown: string): string {
  const tree = markdownParser.parse(markdown)
  return tree.children
    .map((node) => {
      if (node.type === 'table') {
        return node.children
          .map((row) => row.children.map((cell) => toString(cell)).join(' | '))
          .join('\n')
      }
      if (node.type === 'list')
        return node.children.map((item) => toString(item)).join('\n')
      return toString(node, { includeImageAlt: true, includeHtml: false })
    })
    .join('\n\n')
}

export function textContent(
  role: Message['role'],
  text: string
): MessageContent {
  return { type: role === 'assistant' ? 'output_text' : 'input_text', text }
}

export function message(
  id: string,
  role: Message['role'],
  content: string | MessageContent[],
  phase?: Message['phase']
): Message {
  const captured: Message = {
    id,
    type: 'message',
    role,
    content:
      typeof content === 'string' ? [textContent(role, content)] : content
  }
  if (phase) captured.phase = phase
  return captured
}

function omissionLabel(content: Extract<MessageContent, { type: 'omitted' }>) {
  const names = {
    image: 'image',
    audio: 'audio recording',
    video: 'video',
    file: 'attachment',
    tool: 'tool output',
    artifact: 'interactive artifact',
    thinking: 'thinking block',
    unknown: 'unsupported content item'
  }
  if (content.count !== undefined) {
    const name = names[content.kind]
    return `[${content.count} ${name}${content.count === 1 ? '' : 's'} omitted]`
  }
  const labels = {
    image: '[Image omitted]',
    audio: '[Audio omitted]',
    video: '[Video omitted]',
    file: '[Attachment omitted]',
    tool: '[Tool output; interactive content omitted]',
    artifact: '[Tool or interactive artifact omitted]',
    thinking: '[Thinking omitted]',
    unknown: '[Unsupported content omitted]'
  }
  return labels[content.kind]
}

/** Reader projection, including visible labels for uncaptured content. */
export function messageMarkdown(message: Message): string {
  return message.content
    .map((content) =>
      content.type === 'omitted' ? omissionLabel(content) : content.text
    )
    .join('\n\n')
}

/** Summary projection: original text only, without generated omission labels. */
export function messageText(message: Message): string {
  return plainText(
    message.content
      .flatMap((content) => (content.type === 'omitted' ? [] : [content.text]))
      .join('\n\n')
  )
}

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'

import { limits, type ExtractedConversation, type Message } from '../domain'

const markdownParser = unified().use(remarkParse).use(remarkGfm)

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

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

export function message(
  id: string,
  speaker: Message['speaker'],
  markdown: string,
  excerptMarkdown = markdown
): Message {
  return { id, speaker, markdown, text: plainText(excerptMarkdown) }
}

export function finishConversation(
  title: unknown,
  messages: Message[],
  parserVersion: string
): ExtractedConversation {
  if (!messages.length || !messages.some((entry) => entry.text.trim())) {
    throw new Error('The public share did not contain a readable conversation.')
  }
  if (new Set(messages.map((entry) => entry.id)).size !== messages.length) {
    throw new Error('The provider returned duplicate message identities.')
  }
  const bytes = messages.reduce(
    (sum, entry) =>
      sum + Buffer.byteLength(entry.markdown) + Buffer.byteLength(entry.text),
    0
  )
  if (bytes > limits.transcriptBytes) {
    throw new Error(
      'This conversation exceeds the supported 1 MiB normalized text limit.'
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

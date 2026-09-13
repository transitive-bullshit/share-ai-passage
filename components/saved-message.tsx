import { toString } from 'mdast-util-to-string'
import { ImageOff } from 'lucide-react'
import ReactMarkdown, {
  type Components,
  type UrlTransform
} from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

import { type Message } from '@/lib/domain'
import { readerMessageContent } from '@/lib/reader'
import { CodeBlock, TableBlock, UserMessageContent } from './reader-blocks'
import { ReaderLink } from './reader-link'

const roleLabels = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
  developer: 'Developer',
  tool: 'Tool'
}

const safeLink: UrlTransform = (url, key, node) => {
  if (
    key === 'href' &&
    /^(?:\/(?:Users|home|mnt|tmp)\/|file:|sandbox:)/.test(url)
  ) {
    node.properties.dataUnavailableFile = true
    return ''
  }
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? url : ''
  } catch {
    return url.startsWith('#') ? url : ''
  }
}

const languageLabels = new Map(
  Object.entries({
    typescript: 'TypeScript',
    ts: 'TypeScript',
    tsx: 'TSX',
    javascript: 'JavaScript',
    js: 'JavaScript',
    jsx: 'JSX',
    python: 'Python',
    py: 'Python',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    bash: 'Bash',
    sh: 'Shell',
    shell: 'Shell',
    sql: 'SQL',
    yaml: 'YAML',
    yml: 'YAML',
    text: 'Plain text',
    txt: 'Plain text',
    plaintext: 'Plain text'
  })
)

const markdownComponents: Components = {
  a: ({ href, children, id, node }) => (
    <ReaderLink
      href={href}
      id={id}
      unavailableFile={Boolean(node?.properties.dataUnavailableFile)}
    >
      {children}
    </ReaderLink>
  ),
  img: ({ alt }) => (
    <span className='omitted-content image-placeholder'>
      <ImageOff aria-hidden='true' />
      <span>[Image omitted{alt ? `: ${alt}` : ''}]</span>
    </span>
  ),
  pre: ({ children, node }) => {
    const code = node?.children.find(
      (child) => child.type === 'element' && child.tagName === 'code'
    )
    const classes =
      code?.type === 'element' ? String(code.properties.className ?? '') : ''
    const language = /language-([^,\s]+)/.exec(classes)?.[1]
    return (
      <CodeBlock
        text={toString(node).replace(/\n$/, '')}
        language={
          language
            ? (languageLabels.get(language.toLowerCase()) ?? language)
            : 'Plain text'
        }
      >
        {children}
      </CodeBlock>
    )
  },
  table: ({ children, node }) => {
    const text =
      node?.children
        .flatMap((section) =>
          section.type === 'element'
            ? section.children.flatMap((row) =>
                row.type === 'element' && row.tagName === 'tr'
                  ? [
                      row.children
                        .filter((cell) => cell.type === 'element')
                        .map((cell) => toString(cell))
                        .join('\t')
                    ]
                  : []
              )
            : []
        )
        .join('\n') ?? ''
    return <TableBlock text={text}>{children}</TableBlock>
  }
}

export function SavedMessage({
  message,
  index
}: {
  message: Message
  index: number
}) {
  const { markdown, fromTask } = readerMessageContent(message)
  const body = (
    <div className='markdown'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={safeLink}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
  return (
    <article
      className='saved-message'
      id={`message-${index + 1}`}
      data-speaker={message.role}
      aria-label={`${roleLabels[message.role]}, message ${index + 1}`}
    >
      {fromTask ? (
        <p className='message-system-label'>Sent from another task</p>
      ) : null}
      {message.role !== 'user' && message.role !== 'assistant' ? (
        <p className='message-system-label'>{roleLabels[message.role]}</p>
      ) : null}
      {message.role === 'user' ? (
        <UserMessageContent initiallyCollapsed={markdown.length > 1000}>
          {body}
        </UserMessageContent>
      ) : (
        body
      )}
    </article>
  )
}

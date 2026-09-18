import { toString } from 'mdast-util-to-string'
import { Check, ImageOff } from 'lucide-react'
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
import { ImageLightbox } from './image-lightbox'

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
  a: ({ href, children, id, title, node }) => (
    <ReaderLink
      href={href}
      title={title}
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
  index,
  imageBasePath
}: {
  message: Message
  index: number
  imageBasePath?: string
}) {
  const images = [
    ...(message.images ?? []),
    ...message.content.flatMap((block) =>
      block.type === 'image' ? [block] : []
    )
  ]
  const savedImage = (url: string) =>
    images.find(
      (image) =>
        url === `passage-image:${image.sha256}` &&
        /^[a-f0-9]{64}$/.test(image.sha256)
    )
  const components: Components = {
    ...markdownComponents,
    a: ({ href, children, id, title, node }) => {
      // Linked images zoom rather than nesting a button inside a source link.
      const linkedImage = node?.children.some(
        (child) =>
          child.type === 'element' &&
          child.tagName === 'img' &&
          savedImage(String(child.properties.src))
      )
      return linkedImage ? (
        <span id={id}>{children}</span>
      ) : (
        <ReaderLink
          href={href}
          title={title}
          id={id}
          unavailableFile={Boolean(node?.properties.dataUnavailableFile)}
        >
          {children}
        </ReaderLink>
      )
    },
    img: ({ src, alt }) => {
      const image = typeof src === 'string' ? savedImage(src) : undefined
      const imageUrl =
        image && imageBasePath ? `${imageBasePath}/${image.sha256}` : undefined
      return image && imageUrl ? (
        <ImageLightbox
          src={imageUrl}
          original={imageUrl}
          alt={alt || 'Shared image'}
          width={image.width}
          height={image.height}
          unoptimized
        >
          <img
            className='conversation-image'
            src={imageUrl}
            alt={alt || 'Shared image'}
            width={image.width}
            height={image.height}
            loading='lazy'
            decoding='async'
          />
        </ImageLightbox>
      ) : (
        <span className='omitted-content image-placeholder'>
          <ImageOff aria-hidden='true' />
          <span>[Image omitted{alt ? `: ${alt}` : ''}]</span>
        </span>
      )
    }
  }
  const urlTransform: UrlTransform = (url, key, node) =>
    key === 'src' && savedImage(url) ? url : safeLink(url, key, node)
  const { markdown, fromTask, questionReplies } = readerMessageContent(message)
  const visibleLength = questionReplies
    ? questionReplies.reduce((length, reply) => length + reply.answer.length, 0)
    : markdown.length
  const body = (
    <div className='markdown'>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={urlTransform}
        components={components}
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
        <UserMessageContent initiallyCollapsed={visibleLength > 1000}>
          {questionReplies ? (
            <div className='question-replies'>
              {questionReplies.map((reply, replyIndex) => (
                <section
                  className='question-reply'
                  aria-label={`Answer to: ${reply.question}`}
                  key={`${reply.question}-${replyIndex}`}
                >
                  <p className='question-reply-label'>
                    <span aria-hidden='true'>
                      <Check />
                    </span>
                    Prompt answered
                  </p>
                  <div className='markdown question-reply-answer'>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      urlTransform={urlTransform}
                      components={components}
                    >
                      {reply.answer}
                    </ReactMarkdown>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            body
          )}
        </UserMessageContent>
      ) : (
        body
      )}
    </article>
  )
}

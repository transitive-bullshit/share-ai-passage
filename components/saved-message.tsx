import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { type Message } from '@/lib/domain'
import { messageMarkdown } from '@/lib/messages'

const roleLabels = {
  user: 'Human',
  assistant: 'Assistant',
  system: 'System',
  developer: 'Developer',
  tool: 'Tool'
}

function safeLink(url: string) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? url : ''
  } catch {
    return url.startsWith('#') ? url : ''
  }
}

export function SavedMessage({
  message,
  index
}: {
  message: Message
  index: number
}) {
  return (
    <article
      className='saved-message'
      id={`message-${index + 1}`}
      data-speaker={message.role}
      aria-label={`${roleLabels[message.role]}, message ${index + 1}`}
    >
      <div className='message-label'>
        <span className='message-speaker'>
          <span className='message-avatar' aria-hidden='true'>
            {message.role === 'assistant'
              ? 'AI'
              : roleLabels[message.role].slice(0, 1)}
          </span>
          {roleLabels[message.role]}
        </span>
        <span className='message-position'>
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <div className='markdown'>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={safeLink}
          components={{
            a: ({ href, children, id }) => (
              <a
                id={id}
                href={href || undefined}
                target={href?.startsWith('#') ? undefined : '_blank'}
                rel='noopener noreferrer nofollow'
              >
                {children}
              </a>
            ),
            img: ({ alt }) => (
              <span className='omitted-content'>
                [Image omitted{alt ? `: ${alt}` : ''}]
              </span>
            )
          }}
        >
          {messageMarkdown(message)}
        </ReactMarkdown>
      </div>
    </article>
  )
}

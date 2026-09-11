import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { type Message } from '@/lib/domain'

const speakerLabels = {
  user: 'Human',
  assistant: 'Assistant',
  system: 'System',
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
  index,
  selected
}: {
  message: Message
  index: number
  selected: boolean
}) {
  return (
    <article
      className='saved-message'
      id={`message-${index + 1}`}
      data-speaker={message.speaker}
      data-selected={selected || undefined}
      aria-label={`${speakerLabels[message.speaker]}, message ${index + 1}`}
    >
      <div className='message-label'>
        <span className='message-speaker'>
          <span className='message-avatar' aria-hidden='true'>
            {message.speaker === 'assistant'
              ? 'AI'
              : speakerLabels[message.speaker].slice(0, 1)}
          </span>
          {speakerLabels[message.speaker]}
        </span>
        <span className='message-position'>
          {String(index + 1).padStart(2, '0')}
          {selected ? <span>SELECTED PASSAGE</span> : null}
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
          {message.markdown}
        </ReactMarkdown>
      </div>
    </article>
  )
}

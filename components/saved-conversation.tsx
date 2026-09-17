import { ChevronRight } from 'lucide-react'

import type { ReaderGroup } from '@/lib/reader'
import { ConversationPreviews } from './conversation-previews'
import { SavedMessage } from './saved-message'

export function SavedConversation({
  groups,
  linkPreviews = false,
  imageBasePath
}: {
  groups: ReaderGroup[]
  linkPreviews?: boolean
  imageBasePath?: string
}) {
  const content = groups.map((group) =>
    group.type === 'activity' ? (
      <details
        className='conversation-activity'
        key={group.entries[0]!.message.id}
      >
        <summary>
          <span>Reasoning & activity</span>
          <span className='activity-count'>{group.entries.length} steps</span>
          <ChevronRight aria-hidden='true' />
        </summary>
        <div className='activity-messages'>
          {group.entries.map(({ message, index }) => (
            <SavedMessage
              key={message.id}
              message={message}
              index={index}
              imageBasePath={imageBasePath}
            />
          ))}
        </div>
      </details>
    ) : (
      <SavedMessage
        key={group.entries[0]!.message.id}
        {...group.entries[0]!}
        imageBasePath={imageBasePath}
      />
    )
  )
  return linkPreviews ? (
    <ConversationPreviews>{content}</ConversationPreviews>
  ) : (
    <section className='conversation' aria-label='Saved conversation'>
      {content}
    </section>
  )
}

import { ChevronRight } from 'lucide-react'

import type { ReaderGroup } from '@/lib/reader'
import { SavedMessage } from './saved-message'

export function SavedConversation({ groups }: { groups: ReaderGroup[] }) {
  return (
    <section className='conversation' aria-label='Saved conversation'>
      {groups.map((group) =>
        group.type === 'activity' ? (
          <details
            className='conversation-activity'
            key={group.entries[0]!.message.id}
          >
            <summary>
              <span>Reasoning & activity</span>
              <span className='activity-count'>
                {group.entries.length} steps
              </span>
              <ChevronRight aria-hidden='true' />
            </summary>
            <div className='activity-messages'>
              {group.entries.map(({ message, index }) => (
                <SavedMessage
                  key={message.id}
                  message={message}
                  index={index}
                />
              ))}
            </div>
          </details>
        ) : (
          <SavedMessage
            key={group.entries[0]!.message.id}
            {...group.entries[0]!}
          />
        )
      )}
    </section>
  )
}

import { ArrowDown, ArrowUpRight, BookOpen } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { cache } from 'react'

import { AvailabilityCheck } from '@/components/availability-check'
import { CopyLink } from '@/components/copy-link'
import { JsonLd } from '@/components/json-ld'
import { SavedMessage } from '@/components/saved-message'
import { Button } from '@/components/ui/button'
import { appUrl } from '@/lib/config'
import { providerNames } from '@/lib/domain'
import { messageText } from '@/lib/messages'
import { checkAvailability, getPublication } from '@/lib/service'
import {
  passageJsonLd,
  publicPageMetadata,
  unavailableMetadata
} from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Props = { params: Promise<{ provider: string; publicationId: string }> }
const readPublication = cache(getPublication)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { provider, publicationId } = await params
  const record = await readPublication(provider, publicationId)
  if (!record) return unavailableMetadata()
  if (record.disabled)
    return unavailableMetadata(
      'This passage is unavailable',
      'The original conversation is no longer publicly available.'
    )
  const url = `${appUrl()}/${provider}/${publicationId}`
  return publicPageMetadata({
    title: record.publication.title,
    description: record.preview.highlights.join(' '),
    url,
    image: { url: `${url}/image`, type: 'image/webp' }
  })
}

export default async function ReaderPage({ params }: Props) {
  const { provider, publicationId } = await params
  const record = await readPublication(provider, publicationId)
  if (!record) notFound()
  if (record.disabled) {
    return (
      <main id='main' className='quiet-state'>
        <p className='eyebrow'>The original is no longer public</p>
        <h1>This passage is unavailable.</h1>
        <p>
          The original conversation has been removed or is no longer publicly
          accessible, so its saved conversation and preview are no longer served
          here.
        </p>
        <p>
          Other platforms may still hold copies of a preview they fetched
          earlier.
        </p>
        <Button asChild variant='outline'>
          <Link href='/'>Back to Passage</Link>
        </Button>
      </main>
    )
  }

  const { source, snapshot, publication, preview } = record
  const lastReplyIndex = snapshot.messages.findLastIndex(
    (message) => message.role === 'assistant' && messageText(message).trim()
  )
  after(async () => {
    try {
      await checkAvailability(source.id, 'automatic')
    } catch {
      console.warn('Automatic availability check did not complete.')
    }
  })
  const shareUrl = `${appUrl()}/${provider}/${publicationId}`
  const captured = new Intl.DateTimeFormat('en', {
    dateStyle: 'long',
    timeZone: 'UTC'
  }).format(snapshot.capturedAt)
  return (
    <main id='main' className='reader'>
      <JsonLd
        data={passageJsonLd({
          title: publication.title,
          description: preview.highlights.join(' '),
          url: shareUrl,
          sourceUrl: source.canonicalUrl
        })}
      />
      <header className='reader-header'>
        <div className='reader-meta'>
          <p className='eyebrow'>
            A conversation with {providerNames[source.provider]}
          </p>
          <span>Saved on Passage</span>
        </div>
        <h1>{publication.title}</h1>
        <section className='reader-summary' aria-labelledby='summary-heading'>
          <h2 id='summary-heading' className='eyebrow'>
            Highlights
          </h2>
          <ul>
            {preview.highlights.map((highlight, index) => (
              <li key={index}>{highlight}</li>
            ))}
          </ul>
        </section>
        <div className='reader-source-bar'>
          <div className='reader-actions'>
            <Button asChild>
              <a
                href={source.canonicalUrl}
                target='_blank'
                rel='noopener noreferrer'
              >
                Open in {providerNames[source.provider]}
                <ArrowUpRight data-icon='inline-end' />
              </a>
            </Button>
            <CopyLink url={shareUrl} />
          </div>
          <p className='snapshot-note'>
            Saved {captured} · {snapshot.messages.length} messages
          </p>
        </div>
      </header>
      <div className='conversation-heading' id='conversation'>
        <div className='conversation-heading-copy'>
          <h2>The conversation</h2>
          <p>The complete saved conversation.</p>
        </div>
        {lastReplyIndex > 3 ? (
          <Button asChild variant='ghost' size='sm'>
            <a href={`#message-${lastReplyIndex + 1}`}>
              Jump to last reply
              <ArrowDown data-icon='inline-end' />
            </a>
          </Button>
        ) : (
          <ArrowDown size={19} aria-hidden='true' />
        )}
      </div>
      <section className='conversation' aria-label='Saved conversation'>
        {snapshot.messages.map((message, index) => (
          <SavedMessage key={message.id} message={message} index={index} />
        ))}
      </section>
      <aside className='reader-end'>
        <div className='reader-end-heading'>
          <BookOpen size={18} aria-hidden='true' />
          <h2>Saved with its source.</h2>
        </div>
        <p>
          This is a saved copy of a public conversation. Availability checks
          leave these words unchanged. If the original stops being public, the
          saved conversation and its preview are disabled here.
        </p>
        <AvailabilityCheck provider={provider} publicationId={publicationId} />
        <p className='cache-note'>
          Checks are limited to once an hour. Other platforms may retain
          previously fetched previews.
        </p>
      </aside>
    </main>
  )
}

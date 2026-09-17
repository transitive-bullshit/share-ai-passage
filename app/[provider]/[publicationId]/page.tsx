import { ArrowDown, ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { CopyLink } from '@/components/copy-link'
import { JsonLd } from '@/components/json-ld'
import { SavedConversation } from '@/components/saved-conversation'
import { Button } from '@/components/ui/button'
import { appUrl } from '@/lib/config'
import { providerNames } from '@/lib/domain'
import { messageText } from '@/lib/messages'
import { groupReaderMessages } from '@/lib/reader'
import { checkAvailability, getPublication } from '@/lib/service'
import {
  passageJsonLd,
  publicPageMetadata,
  unavailableMetadata
} from '@/lib/seo'

export const dynamic = 'force-static'
export const revalidate = 604800 // Seven days.
export const maxDuration = 30

export async function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ provider: string; publicationId: string }> }
const readPublication = cache(
  async (provider: string, publicationId: string) => {
    const record = await getPublication(provider, publicationId)
    if (!record || record.disabled) return record
    try {
      const availability = await checkAvailability(
        record.source.id,
        'automatic'
      )
      if (availability.status === 'unavailable')
        return getPublication(provider, publicationId)
    } catch {
      console.warn('Automatic availability check did not complete.')
    }
    return record
  }
)

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
    description:
      record.preview.highlights.filter((text) => text.trim()).join(' ') ||
      record.preview.title,
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
  const groups = groupReaderMessages(snapshot.messages, snapshot.parserVersion)
  const visibleMessages = groups
    .filter((group) => group.type === 'message')
    .flatMap((group) => group.entries)
  const lastReplyIndex =
    visibleMessages.findLast(
      ({ message }) =>
        message.role === 'assistant' && messageText(message).trim()
    )?.index ?? -1
  const highlights = preview.highlights.filter((text) => text.trim())
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
        <h1>{publication.title}</h1>
        {highlights.length > 0 ? (
          <details className='reader-summary'>
            <summary>
              Highlights{' '}
              <span>
                {highlights.length}{' '}
                {highlights.length === 1 ? 'takeaway' : 'takeaways'}
              </span>
            </summary>
            <ul>
              {highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          </details>
        ) : null}
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
            {lastReplyIndex > 0 ? (
              <Button asChild variant='ghost' size='sm'>
                <a href={`#message-${lastReplyIndex + 1}`}>
                  Jump to answer
                  <ArrowDown data-icon='inline-end' />
                </a>
              </Button>
            ) : null}
          </div>
          <p className='snapshot-note'>Saved {captured}</p>
        </div>
      </header>
      <h2 className='sr-only' id='conversation'>
        The conversation
      </h2>
      <SavedConversation
        key={`${provider}/${publicationId}`}
        groups={groups}
        imageBasePath={`/${provider}/${publicationId}/media`}
        linkPreviews
      />
    </main>
  )
}

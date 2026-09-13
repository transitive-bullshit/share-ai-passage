import { ArrowDown, ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CopyLink } from '@/components/copy-link'
import { JsonLd } from '@/components/json-ld'
import { SavedMessage } from '@/components/saved-message'
import { Button } from '@/components/ui/button'
import { brand } from '@/lib/brand'
import { appUrl } from '@/lib/config'
import { getMarketingExample } from '@/lib/marketing-examples'
import { getSocialTemplate } from '@/lib/social-templates'
import {
  passageJsonLd,
  publicPageMetadata,
  unavailableMetadata
} from '@/lib/seo'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ exampleId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { exampleId } = await params
  const example = getMarketingExample(exampleId)
  if (!example) return unavailableMetadata('Example passage not found')
  const url = `${appUrl()}/examples/${example.id}`
  return publicPageMetadata({
    title: example.title,
    description: example.highlights.join(' '),
    url,
    image: { url: `${url}/image`, type: 'image/webp' }
  })
}

export default async function ExamplePage({ params }: Props) {
  const { exampleId } = await params
  const example = getMarketingExample(exampleId)
  if (!example) notFound()
  const shareUrl = `${appUrl()}/examples/${example.id}`
  return (
    <main id='main' className='reader'>
      <JsonLd
        data={passageJsonLd({
          title: example.title,
          description: example.highlights.join(' '),
          url: shareUrl
        })}
      />
      <header className='reader-header'>
        <div className='reader-meta'>
          <p className='eyebrow'>Example passage</p>
          <span>{getSocialTemplate(example.appearance.templateId).name}</span>
        </div>
        <h1>{example.title}</h1>
        <section className='reader-summary' aria-labelledby='summary-heading'>
          <h2 id='summary-heading' className='eyebrow'>
            Highlights
          </h2>
          <ul>
            {example.highlights.map((highlight, index) => (
              <li key={index}>{highlight}</li>
            ))}
          </ul>
        </section>
        <div className='reader-source-bar'>
          <div className='reader-actions'>
            <Button asChild>
              <Link href='/'>
                {brand.cta}
                <ArrowUpRight data-icon='inline-end' />
              </Link>
            </Button>
            <CopyLink url={shareUrl} />
          </div>
          <p className='snapshot-note'>
            An illustrative debugging conversation.
          </p>
        </div>
      </header>
      <div className='conversation-heading' id='conversation'>
        <div className='conversation-heading-copy'>
          <h2>The conversation</h2>
          <p>A timing problem, shared test data, and a clearer next step.</p>
        </div>
        <ArrowDown size={19} aria-hidden='true' />
      </div>
      <section className='conversation' aria-label='Example conversation'>
        {example.messages.map((message, index) => (
          <SavedMessage key={message.id} message={message} index={index} />
        ))}
      </section>
    </main>
  )
}

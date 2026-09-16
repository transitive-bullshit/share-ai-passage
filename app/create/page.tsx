import type { Metadata } from 'next'

import { ShareFlow } from '@/components/share-flow'
import { noindex } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Create a passage',
  robots: noindex
}

export default async function CreatePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const draftId = typeof query.draft === 'string' ? query.draft : undefined
  const templateId =
    typeof query.template === 'string' ? query.template : undefined
  return (
    <main id='main'>
      <ShareFlow
        key={draftId ?? templateId ?? 'new'}
        initialDraftId={draftId}
        initialTemplateId={templateId}
      />
    </main>
  )
}

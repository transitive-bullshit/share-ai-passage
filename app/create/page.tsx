import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

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
  if (typeof query.draft === 'string')
    redirect(`/create?passage=${encodeURIComponent(query.draft)}`)
  const draftId = typeof query.passage === 'string' ? query.passage : undefined
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

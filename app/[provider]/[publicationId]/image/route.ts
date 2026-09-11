import { renderCard } from '@/lib/card'
import { privateHeaders } from '@/lib/http'
import { getPublication } from '@/lib/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string; publicationId: string }> }
) {
  const { provider, publicationId } = await context.params
  const record = await getPublication(provider, publicationId)
  if (!record)
    return new Response('Publication not found', {
      status: 404,
      headers: privateHeaders
    })
  if (record.disabled) return renderCard({ disabled: true })
  if (record.preview) {
    return renderCard(
      {
        title: record.preview.title,
        highlights: record.preview.highlights,
        provider: record.source.provider
      },
      record.publication.appearance ?? undefined
    )
  }
  if (!record.excerpt) return renderCard({ disabled: true })
  return renderCard({
    title: record.publication.title,
    excerpt: record.excerpt.text,
    speaker: record.excerpt.speaker,
    provider: record.source.provider
  })
}

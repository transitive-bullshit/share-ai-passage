import { renderCard } from '@/lib/card'
import { privateHeaders } from '@/lib/http'
import { getPublication } from '@/lib/service'
import { publicImageResponse } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-static'
export const revalidate = 604800 // Seven days.

export async function generateStaticParams() {
  return []
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string; publicationId: string }> }
) {
  const { provider, publicationId } = await context.params
  const record = await getPublication(provider, publicationId)
  if (!record)
    return new Response('Passage not found', {
      status: 404,
      headers: privateHeaders
    })
  if (record.disabled)
    return publicImageResponse(await renderCard({ disabled: true }), {
      available: false,
      cacheable: true
    })
  return publicImageResponse(
    await renderCard(
      {
        title: record.preview.title,
        highlights: record.preview.highlights,
        provider: record.source.provider
      },
      record.publication.appearance ?? undefined
    ),
    { cacheable: true }
  )
}

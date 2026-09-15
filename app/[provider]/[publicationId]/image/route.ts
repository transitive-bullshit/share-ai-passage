import { renderCard } from '@/lib/card'
import { readFrozenCard } from '@/lib/assets'
import { errorResponse } from '@/lib/http'
import { AppError } from '@/lib/errors'
import { privateHeaders } from '@/lib/http'
import { getPublication } from '@/lib/service'
import { publicImageResponse } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  if (record.disabled) return renderCard({ disabled: true })
  if (record.publication.cardVersion >= 5 || record.publication.cardAssetId) {
    try {
      if (!record.publication.cardAssetId)
        throw new AppError('This saved card is temporarily unavailable.', 503)
      const bytes = await readFrozenCard(record.publication.cardAssetId)
      return publicImageResponse(
        new Response(new Uint8Array(bytes), {
          headers: { ...privateHeaders, 'Content-Type': 'image/webp' }
        })
      )
    } catch (err) {
      return errorResponse(err)
    }
  }
  return publicImageResponse(
    await renderCard(
      {
        title: record.preview.title,
        highlights: record.preview.highlights,
        provider: record.source.provider
      },
      record.publication.appearance ?? undefined
    )
  )
}

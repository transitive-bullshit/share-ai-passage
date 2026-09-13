import { renderCard } from '@/lib/card'
import { privateHeaders } from '@/lib/http'
import { getMarketingExample } from '@/lib/marketing-examples'
import { publicImageResponse } from '@/lib/seo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ exampleId: string }> }
) {
  const { exampleId } = await context.params
  const example = getMarketingExample(exampleId)
  if (!example)
    return new Response('Example passage not found', {
      status: 404,
      headers: privateHeaders
    })
  return publicImageResponse(
    await renderCard(
      {
        title: example.title,
        highlights: example.highlights,
        provider: 'chatgpt',
        example: true
      },
      example.appearance
    )
  )
}

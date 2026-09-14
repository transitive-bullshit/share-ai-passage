import { renderCard } from '@/lib/card'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import { errorResponse } from '@/lib/http'
import { featuredExample } from '@/lib/marketing-examples'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const templateId = new URL(request.url).searchParams.get('template')
    const parsed = cardAppearanceSchema
      .optional()
      .safeParse(templateId === null ? undefined : { templateId })
    if (!parsed.success) throw new AppError('Choose a supported card template.')
    return await renderCard(
      {
        title: featuredExample.title,
        highlights: featuredExample.highlights,
        provider: 'chatgpt'
      },
      parsed.data
    )
  } catch (err) {
    return errorResponse(err)
  }
}

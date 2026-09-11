import { renderCard } from '@/lib/card'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import { errorResponse } from '@/lib/http'

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
        title: 'Make room for the unexpected',
        highlights: [
          'Useful ideas often begin with a question you keep coming back to.',
          'A fresh connection or conversation can change how you see a problem.',
          'Leave room for ideas to develop before deciding where they lead.'
        ],
        provider: 'claude',
        example: true
      },
      parsed.data
    )
  } catch (err) {
    return errorResponse(err)
  }
}

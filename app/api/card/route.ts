import { z } from 'zod'

import { renderCard, renderCardPreview } from '@/lib/card'
import { DEFAULT_CARD_APPEARANCE } from '@/lib/card-appearance'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import {
  clientKey,
  errorResponse,
  readJson,
  requireSameOrigin
} from '@/lib/http'
import { enforceBudget, getDraft } from '@/lib/service'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await enforceBudget(`card:${clientKey(request)}`, 120)
    const parsed = z
      .object({
        draftToken: z.string().min(1).max(1024),
        format: z.enum(['webp', 'html']).optional().default('webp'),
        appearance: cardAppearanceSchema
          .optional()
          .default(DEFAULT_CARD_APPEARANCE)
      })
      .strict()
      .safeParse(await readJson(request))
    if (!parsed.success)
      throw new AppError(
        'Choose a supported card template and prepare the conversation before previewing its card. Preview text cannot be edited.'
      )
    const draft = await getDraft(parsed.data.draftToken)
    const render =
      parsed.data.format === 'html' ? renderCardPreview : renderCard
    return await render(
      {
        title: draft.preview.title,
        highlights: draft.preview.highlights,
        provider: draft.source.provider
      },
      parsed.data.appearance
    )
  } catch (err) {
    return errorResponse(err)
  }
}

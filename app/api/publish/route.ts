import { z } from 'zod'

import { DEFAULT_CARD_APPEARANCE } from '@/lib/card-appearance'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import {
  clientKey,
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin
} from '@/lib/http'
import { enforceBudget, publishPreview } from '@/lib/service'
import { parseGeneratedPreview } from '@/lib/summary'

const schema = z.strictObject({
  draftToken: z.string().min(1).max(1024),
  preview: z.unknown().optional(),
  appearance: cardAppearanceSchema.optional().default(DEFAULT_CARD_APPEARANCE)
})

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await enforceBudget(`publish:${clientKey(request)}`, 60)
    const parsed = schema.safeParse(await readJson(request))
    if (!parsed.success)
      throw new AppError(
        'Choose a supported card template and prepare a preview before publishing.'
      )
    const preview =
      parsed.data.preview === undefined
        ? undefined
        : parseGeneratedPreview(parsed.data.preview)
    if (preview && !preview.success)
      throw new AppError(
        preview.error.issues[0]?.message ?? 'Enter a valid preview summary.'
      )
    const result = await publishPreview(
      parsed.data.draftToken,
      parsed.data.appearance,
      preview?.data
    )
    return Response.json(result, { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

import { resolveActor } from '@/lib/actors'
import { loadCardArtwork, resolveOwnedCardDesign } from '@/lib/assets'
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
import { parseGeneratedPreview } from '@/lib/summary'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await enforceBudget(`card:${clientKey(request)}`, 120)
    const parsed = z
      .object({
        draftToken: z.string().min(1).max(1024),
        preview: z.unknown().optional(),
        format: z.enum(['webp', 'html']).optional().default('webp'),
        appearance: cardAppearanceSchema.optional()
      })
      .strict()
      .safeParse(await readJson(request))
    if (!parsed.success)
      throw new AppError(
        'Choose a supported card template and prepare the conversation before previewing its card.'
      )
    const edited =
      parsed.data.preview === undefined
        ? undefined
        : parseGeneratedPreview(parsed.data.preview)
    if (edited && !edited.success)
      throw new AppError(
        edited.error.issues[0]?.message ?? 'Enter a valid preview summary.'
      )
    const draft = await getDraft(
      parsed.data.draftToken,
      await resolveActor(request)
    )
    const preview = edited?.data ?? draft.preview
    const render =
      parsed.data.format === 'html' ? renderCardPreview : renderCard
    const resolved =
      draft.design && draft.saved
        ? await resolveOwnedCardDesign(draft.saved.ownerId, draft.design, {
            allowPending: true,
            frozen: draft.saved.resolvedDesign
          })
        : null
    const artwork =
      resolved && draft.saved
        ? await loadCardArtwork(draft.saved.ownerId, resolved)
        : undefined
    if (resolved)
      return await render(
        {
          title: preview.title,
          highlights: preview.highlights,
          provider: draft.source.provider
        },
        parsed.data.appearance ?? draft.appearance,
        resolved,
        artwork,
        { requireReadableText: true }
      )
    return await render(
      {
        title: preview.title,
        highlights: preview.highlights,
        provider: draft.source.provider
      },
      parsed.data.appearance ?? draft.appearance ?? DEFAULT_CARD_APPEARANCE,
      undefined,
      undefined,
      { requireReadableText: true }
    )
  } catch (err) {
    return errorResponse(err)
  }
}

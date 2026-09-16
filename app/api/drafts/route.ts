import { z } from 'zod'
import { start } from 'workflow/api'
import { startInitialDraftImage } from '@/lib/initial-image'
import { generatePassageBackground } from '@/workflows/generate-background'
import { preparePassage } from '@/workflows/prepare-passage'
import { accountRequest } from '@/lib/account-http'
import { createPendingSavedDraft } from '@/lib/account-drafts'
import { ensureDraftEnqueued } from '@/lib/draft-jobs'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import { clientKey, readJson } from '@/lib/http'
import { enforceBudget } from '@/lib/service'

export const runtime = 'nodejs'
export const maxDuration = 60

export function POST(request: Request) {
  return accountRequest(request, async (actor) => {
    await enforceBudget(`prepare:${clientKey(request)}`, 10)
    const input = z
      .strictObject({
        url: z.string().trim().min(1).max(2048),
        requestKey: z.uuid(),
        appearance: cardAppearanceSchema.optional(),
        templateId: z.uuid().optional()
      })
      .safeParse(await readJson(request))
    if (!input.success)
      throw new AppError(
        'Paste a public conversation URL and start a new draft.'
      )
    const draft = await createPendingSavedDraft(actor, input.data)
    if (draft.status === 'preparing' && !draft.generationBlock)
      await ensureDraftEnqueued(actor, draft.draftId, (id) =>
        start(preparePassage, [id])
      )
    return startInitialDraftImage(actor, draft, (id) =>
      start(generatePassageBackground, [id])
    )
  })
}

import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { createSavedDraft } from '@/lib/account-drafts'
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
        appearance: cardAppearanceSchema.optional()
      })
      .safeParse(await readJson(request))
    if (!input.success)
      throw new AppError(
        'Paste a public conversation URL and start a new draft.'
      )
    return createSavedDraft(actor, input.data)
  })
}

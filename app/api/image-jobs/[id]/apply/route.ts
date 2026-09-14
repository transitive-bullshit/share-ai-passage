import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { readSavedDraft } from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import { applyImageResult } from '@/lib/image-jobs'

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) => {
    const { id } = await context.params
    const input = z
      .strictObject({ revision: z.number().int().nonnegative() })
      .safeParse(await readJson(request))
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new AppError('Choose a saved image to apply.')
    const result = await applyImageResult(actor, id, input.data.revision)
    return { ...result, draft: await readSavedDraft(actor, result.draftId!) }
  })
}

import { z } from 'zod'
import { start } from 'workflow/api'
import { preparePassage } from '@/workflows/prepare-passage'
import { accountRequest } from '@/lib/account-http'
import {
  applyDraftGeneration,
  draftOperations,
  publishSavedDraft,
  regenerateSavedDraft,
  queueSavedDraftResume
} from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'
import { clientKey, readJson } from '@/lib/http'
import { enforceBudget } from '@/lib/service'
import { ensureDraftEnqueued } from '@/lib/draft-jobs'

type Context = { params: Promise<{ id: string; action: string }> }
export const maxDuration = 60

export function GET(request: Request, context: Context) {
  return accountRequest(request, async (actor) => {
    const { id, action } = await context.params
    if (!z.uuid().safeParse(id).success || action !== 'operations')
      throw new AppError('Not found.', 404)
    return draftOperations(actor, id)
  })
}
export function POST(request: Request, context: Context) {
  return accountRequest(request, async (actor) => {
    const { id, action } = await context.params
    if (!z.uuid().safeParse(id).success)
      throw new AppError('Draft not found.', 404)
    const body = await readJson(request)
    if (action === 'resume') {
      await enforceBudget(`prepare:${clientKey(request)}`, 10)
      const draft = await queueSavedDraftResume(actor, id)
      if (draft.status === 'preparing' && !draft.generationBlock)
        await ensureDraftEnqueued(actor, id, (id) =>
          start(preparePassage, [id])
        )
      return draft
    }
    if (action === 'publish') {
      await enforceBudget(`publish:${clientKey(request)}`, 60)
      const input = z
        .strictObject({ revision: z.number().int().nonnegative() })
        .safeParse(body)
      if (!input.success)
        throw new AppError('Save the latest draft before publishing.')
      return publishSavedDraft(actor, id, input.data.revision)
    }
    if (action === 'regenerate') {
      await enforceBudget(`prepare:${clientKey(request)}`, 10)
      const input = z
        .strictObject({
          revision: z.number().int().nonnegative(),
          requestKey: z.uuid()
        })
        .safeParse(body)
      if (!input.success)
        throw new AppError('Save your draft before generating a new summary.')
      return regenerateSavedDraft(
        actor,
        id,
        input.data.revision,
        input.data.requestKey
      )
    }
    if (action === 'apply') {
      const input = z
        .strictObject({
          revision: z.number().int().nonnegative(),
          operationId: z.uuid()
        })
        .safeParse(body)
      if (!input.success)
        throw new AppError('Choose a saved generation to apply.')
      return applyDraftGeneration(
        actor,
        id,
        input.data.revision,
        input.data.operationId
      )
    }
    throw new AppError('Not found.', 404)
  })
}

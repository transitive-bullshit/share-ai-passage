import { z } from 'zod'
import { start } from 'workflow/api'
import { preparePassage } from '@/workflows/prepare-passage'
import { accountRequest } from '@/lib/account-http'
import {
  deleteSavedDraft,
  draftEditSchema,
  editSavedDraft,
  readSavedDraft
} from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import { ensureDraftEnqueued } from '@/lib/draft-jobs'

type Context = { params: Promise<{ id: string }> }
async function draftId(context: Context) {
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Draft not found.', 404)
  return id
}
export function GET(request: Request, context: Context) {
  return accountRequest(request, async (actor) => {
    const id = await draftId(context)
    const draft = await readSavedDraft(actor, id)
    if (draft.status === 'preparing' && !draft.generationBlock) {
      await ensureDraftEnqueued(actor, id, (id) => start(preparePassage, [id]))
    }
    return draft
  })
}
export function PATCH(request: Request, context: Context) {
  return accountRequest(request, async (actor) => {
    const input = draftEditSchema.safeParse(await readJson(request))
    if (!input.success)
      throw new AppError('Keep the draft within the supported text limits.')
    return editSavedDraft(actor, await draftId(context), input.data)
  })
}
export function DELETE(request: Request, context: Context) {
  return accountRequest(request, async (actor) =>
    deleteSavedDraft(actor, await draftId(context))
  )
}

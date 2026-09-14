import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import {
  deleteSavedDraft,
  draftEditSchema,
  editSavedDraft,
  readSavedDraft
} from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'

type Context = { params: Promise<{ id: string }> }
async function draftId(context: Context) {
  const { id } = await context.params
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Draft not found.', 404)
  return id
}
export function GET(request: Request, context: Context) {
  return accountRequest(request, async (actor) =>
    readSavedDraft(actor, await draftId(context))
  )
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

import { accountRequest } from '@/lib/account-http'
import { readJson } from '@/lib/http'
import { deleteTemplate, saveTemplate } from '@/lib/templates'
export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) =>
    saveTemplate(
      actor.userId,
      await readJson(request),
      (await context.params).id
    )
  )
}
export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) =>
    deleteTemplate(actor.userId, (await context.params).id)
  )
}

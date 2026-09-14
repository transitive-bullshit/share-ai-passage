import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { deleteOwnedPublication } from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'

export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) => {
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success)
      throw new AppError('Passage not found.', 404)
    return deleteOwnedPublication(actor, id)
  })
}

import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { reviseOwnedPublication } from '@/lib/account-drafts'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) => {
    const { id } = await context.params
    const input = z
      .strictObject({ requestKey: z.uuid() })
      .safeParse(await readJson(request))
    if (!z.uuid().safeParse(id).success || !input.success)
      throw new AppError('Choose a passage to revise.')
    return reviseOwnedPublication(actor, id, input.data.requestKey)
  })
}

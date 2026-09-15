import { accountRequest } from '@/lib/account-http'
import { removeAsset } from '@/lib/assets'
export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) =>
    removeAsset(actor.userId, (await context.params).id)
  )
}

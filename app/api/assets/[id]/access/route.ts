import { accountRequest } from '@/lib/account-http'
import { assetAccess } from '@/lib/assets'
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) =>
    assetAccess(actor.userId, (await context.params).id)
  )
}

import { accountRequest } from '@/lib/account-http'
import { listAssets } from '@/lib/assets'
export function GET(request: Request) {
  return accountRequest(request, (actor) =>
    listAssets(actor.userId, new URL(request.url).searchParams.get('cursor'))
  )
}

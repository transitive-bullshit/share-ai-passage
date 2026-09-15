import { accountRequest } from '@/lib/account-http'
import { reserveUpload } from '@/lib/assets'
import { readJson } from '@/lib/http'
export function POST(request: Request) {
  return accountRequest(request, async (actor) =>
    reserveUpload(actor.userId, await readJson(request))
  )
}

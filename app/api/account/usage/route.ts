import { accountRequest } from '@/lib/account-http'
import { getSummaryUsage } from '@/lib/usage'

export function GET(request: Request) {
  return accountRequest(request, (actor) =>
    getSummaryUsage(actor.subjectKey, actor.allowance)
  )
}

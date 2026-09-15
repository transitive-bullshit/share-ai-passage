import { accountRequest } from '@/lib/account-http'
import { listPassages } from '@/lib/account-drafts'

export function GET(request: Request) {
  return accountRequest(request, (actor) => {
    const query = new URL(request.url).searchParams
    return listPassages(
      actor,
      query.get('draftCursor'),
      query.get('publicationCursor')
    )
  })
}

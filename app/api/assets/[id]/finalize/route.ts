import { accountRequest } from '@/lib/account-http'
import { finalizeUpload } from '@/lib/assets'
export const runtime = 'nodejs'
export const maxDuration = 120
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) =>
    finalizeUpload(actor.userId, (await context.params).id)
  )
}

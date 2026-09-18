import { accountRequest } from '@/lib/account-http'
import { readJson } from '@/lib/http'
import { listTemplates, saveTemplate } from '@/lib/templates'
export function GET(request: Request) {
  return accountRequest(request, (actor) =>
    listTemplates(actor.userId, new URL(request.url).searchParams.get('cursor'))
  )
}
export function POST(request: Request) {
  return accountRequest(request, async (actor) =>
    saveTemplate(actor.userId, await readJson(request))
  )
}

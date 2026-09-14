import { requireOwnedActor, resolveActor, type Actor } from './actors'
import { errorResponse, privateHeaders, requireSameOrigin } from './http'

export async function accountRequest(
  request: Request,
  action: (actor: Actor & { userId: string }) => Promise<unknown>
) {
  try {
    if (request.method !== 'GET') requireSameOrigin(request)
    const actor = await resolveActor(request)
    requireOwnedActor(actor)
    return Response.json(await action(actor), { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

import {
  requireOwnedActor,
  requireRegisteredActor,
  resolveActor,
  type Actor
} from './actors'
import { AppError } from './errors'
import { errorResponse, privateHeaders, requireSameOrigin } from './http'

export async function accountRequest(
  request: Request,
  action: (actor: Actor & { userId: string }) => Promise<unknown>
) {
  try {
    if (request.method !== 'GET' && !request.headers.has('authorization'))
      requireSameOrigin(request)
    const actor = await resolveActor(request)
    requireOwnedActor(actor)
    return Response.json(await action(actor), { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

export function accountSecurityRequest(
  request: Request,
  action: (actor: Actor & { userId: string }) => Promise<unknown>
) {
  return accountRequest(request, async (actor) => {
    if (actor.authentication === 'api-key' || !request.headers.get('cookie'))
      throw new AppError('Sign in to manage your account.', 401)
    requireRegisteredActor(actor)
    return action(actor)
  })
}

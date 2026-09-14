import { eq } from 'drizzle-orm'

import { getDb } from './db'
import { authUsers } from './db/schema'
import { AppError } from './errors'
import { errorResponse, privateHeaders, requireSameOrigin } from './http'

export async function billingRequest(
  request: Request,
  action: (userId: string) => Promise<unknown>
) {
  try {
    if (request.method !== 'GET') requireSameOrigin(request)
    if (
      !request.headers.get('cookie') ||
      request.headers.has('x-api-key') ||
      request.headers.has('authorization')
    )
      throw new AppError('Sign in to manage billing.', 401)
    const { getAuth } = await import('./auth')
    const session = await getAuth().api.getSession({ headers: request.headers })
    if (!session) throw new AppError('Sign in to manage billing.', 401)
    const [user] = await getDb()
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, session.user.id))
    if (
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt
    )
      throw new AppError('A verified account is required.', 403)
    const result = await action(user.id)
    if (result instanceof Response) return result
    return Response.json(result, { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

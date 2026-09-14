import { eq } from 'drizzle-orm'

import { accountSubject } from './accounts'
import { getDb } from './db'
import { authUsers, guestImports } from './db/schema'
import { AppError } from './errors'
import { clientKey } from './http'

export type Actor = {
  userId: string | null
  subjectKey: string
  allowance: 5 | 25
  registered: boolean
}

/** Cookies are only a lookup hint. Better Auth verifies the session itself. */
export async function resolveActor(request: Request): Promise<Actor> {
  if (request.headers.get('cookie')) {
    const { getAuth } = await import('./auth')
    const session = await getAuth().api.getSession({ headers: request.headers })
    if (session) {
      const [user] = await getDb()
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, session.user.id))
      if (!user || user.deletionRequestedAt)
        throw new AppError('This account is unavailable.', 403)
      if (user.isAnonymous) {
        const [imported] = await getDb()
          .select({ id: guestImports.guestUserId })
          .from(guestImports)
          .where(eq(guestImports.guestUserId, user.id))
        if (imported)
          throw new AppError(
            'Your session changed. Sign in again to resume your work.',
            409
          )
      }
      const registered = !user.isAnonymous && user.emailVerified
      if (!user.isAnonymous && !registered)
        throw new AppError('Verify your email to continue.', 403)
      return {
        userId: user.id,
        subjectKey: accountSubject(user.id),
        allowance: registered ? 25 : 5,
        registered
      }
    }
  }
  return {
    userId: null,
    subjectKey: `client:${clientKey(request)}`,
    allowance: 5,
    registered: false
  }
}

export function requireOwnedActor(
  actor: Actor
): asserts actor is Actor & { userId: string } {
  if (!actor.userId)
    throw new AppError(
      'Your session expired. Sign in or start a new guest session.',
      401
    )
}

export function requireRegisteredActor(
  actor: Actor
): asserts actor is Actor & { userId: string } {
  requireOwnedActor(actor)
  if (!actor.registered)
    throw new AppError('Sign in to your verified account to continue.', 403)
}

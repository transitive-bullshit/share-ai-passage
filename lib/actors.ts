import { eq } from 'drizzle-orm'

import { accountSubject } from './accounts'
import { apiKeyPermission, cliKeyConfig } from './api-keys'
import { getDb } from './db'
import { authUsers, guestImports } from './db/schema'
import { AppError } from './errors'
import { clientKey } from './http'

export type Actor = {
  userId: string | null
  subjectKey: string
  allowance: 5 | 25
  registered: boolean
  authentication?: 'api-key'
}

/** Cookies are only a lookup hint. Better Auth verifies the session itself. */
export async function resolveActor(request: Request): Promise<Actor> {
  if (
    request.headers.has('authorization') ||
    request.headers.has('x-api-key')
  ) {
    const authorization = request.headers.get('authorization')
    const match = authorization?.match(/^Bearer (\S+)$/)
    if (!match || request.headers.has('x-api-key'))
      throw new AppError('Use a valid Passage bearer API key.', 401)
    const permission = apiKeyPermission(request)
    if (!permission)
      throw new AppError('This API key cannot access that action.', 403)
    const { getAuth } = await import('./auth')
    const verified = await getAuth().api.verifyApiKey({
      body: {
        configId: cliKeyConfig,
        key: match[1]!,
        permissions: { passage: [permission] }
      }
    })
    if (!verified.valid || !verified.key)
      throw new AppError(
        'This API key is invalid, expired, revoked, or temporarily rate limited.',
        verified.error?.code === 'RATE_LIMITED' ? 429 : 401
      )
    const [user] = await getDb()
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, verified.key.referenceId))
    if (
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt
    )
      throw new AppError('This account is unavailable.', 403)
    return {
      userId: user.id,
      subjectKey: accountSubject(user.id),
      allowance: 25,
      registered: true,
      authentication: 'api-key'
    }
  }
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

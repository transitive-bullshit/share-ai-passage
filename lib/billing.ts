import { eq } from 'drizzle-orm'

import { getDb, type Transaction } from './db'
import { authUsers, billingAccounts } from './db/schema'
import { AppError } from './errors'
import { entitlementsFromBilling } from './billing-policy'

export async function readEntitlements(
  userId: string,
  tx?: Transaction,
  now = new Date()
) {
  const db = tx ?? getDb()
  const [account] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  return entitlementsFromBilling(account ?? null, now)
}

export async function requirePaidAccount(userId: string, tx?: Transaction) {
  const db = tx ?? getDb()
  const [user] = await db
    .select({
      isAnonymous: authUsers.isAnonymous,
      emailVerified: authUsers.emailVerified,
      deletionRequestedAt: authUsers.deletionRequestedAt
    })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
  if (
    !user ||
    user.isAnonymous ||
    !user.emailVerified ||
    user.deletionRequestedAt
  )
    throw new AppError('Sign in to your verified account to continue.', 403)
  const entitlements = await readEntitlements(userId, tx)
  if (!entitlements.paidActions)
    throw new AppError(
      'Choose a paid plan to use this customization.',
      403,
      undefined,
      {
        code: 'PAID_ACCOUNT_REQUIRED',
        billingUrl: '/account/billing'
      }
    )
  return entitlements
}

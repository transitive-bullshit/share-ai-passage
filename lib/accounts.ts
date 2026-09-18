import { and, eq, isNull, sql } from 'drizzle-orm'

import { queueAccountAssetCleanup } from './assets'
import { cancelAccountSubscriptions } from './billing-reconciliation'
import { DEFAULT_CARD_APPEARANCE, type CardAppearance } from './card-appearance'
import { cardAppearanceSchema } from './card-appearance-schema'
import { getDb } from './db'
import {
  accountPreferences,
  authUsers,
  billingAccounts,
  billingEmails,
  generationOperations,
  guestImports,
  imageOperations,
  publications,
  savedDrafts,
  savedTemplates
} from './db/schema'
import { AppError } from './errors'
import {
  cancelUndispatchedSummaries,
  lockUsageSubjects,
  moveSubjectUsage
} from './usage'

export const accountSubject = (userId: string) => `user:${userId}`

/** Only Better Auth's verified guest-to-account hook may call this function. */
export async function mergeGuestAccount(guestUserId: string, userId: string) {
  if (guestUserId === userId) return
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(
      tx,
      accountSubject(guestUserId),
      accountSubject(userId)
    )
    const [prior] = await tx
      .select()
      .from(guestImports)
      .where(eq(guestImports.guestUserId, guestUserId))
    if (prior) {
      if (prior.userId !== userId)
        throw new AppError('This guest session has already been linked.', 409)
      return
    }
    const [guest] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, guestUserId))
      .for('update')
    const [user] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .for('update')
    if (
      !guest?.isAnonymous ||
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt
    ) {
      throw new AppError(
        'Verify your account before transferring guest work.',
        403
      )
    }
    await tx.insert(guestImports).values({ guestUserId, userId })
    const [preferences] = await tx
      .select()
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, guestUserId))
    if (preferences) {
      await tx
        .insert(accountPreferences)
        .values({ userId, appearance: preferences.appearance })
        .onConflictDoNothing()
    }
    await moveSubjectUsage(
      tx,
      accountSubject(guestUserId),
      accountSubject(userId),
      new Date()
    )
    await tx
      .update(savedDrafts)
      .set({ ownerId: userId })
      .where(eq(savedDrafts.ownerId, guestUserId))
    await tx
      .update(publications)
      .set({ ownerId: userId })
      .where(eq(publications.ownerId, guestUserId))
    await tx
      .update(generationOperations)
      .set({ ownerId: userId })
      .where(eq(generationOperations.ownerId, guestUserId))
  })
}

/** Runs before Better Auth deletes the user; its closing flag prevents new work. */
export async function deleteAccountData(userId: string) {
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    const now = new Date()
    const [user] = await tx
      .update(authUsers)
      .set({ deletionRequestedAt: now })
      .where(eq(authUsers.id, userId))
      .returning({ stripeCustomerId: authUsers.stripeCustomerId })
    // This retained marker also closes late Checkout/webhook races after the
    // authentication profile has been removed.
    await tx
      .insert(billingAccounts)
      .values({
        userId,
        stripeCustomerId: user?.stripeCustomerId,
        closingAt: now
      })
      .onConflictDoUpdate({
        target: billingAccounts.userId,
        set: {
          stripeCustomerId: sql`coalesce(${billingAccounts.stripeCustomerId}, ${user?.stripeCustomerId ?? null})`,
          closingAt: sql`coalesce(${billingAccounts.closingAt}, ${now.toISOString()}::timestamptz)`,
          cancellationCompletedAt: null,
          updatedAt: now
        }
      })
    await cancelUndispatchedSummaries(tx, accountSubject(userId))
    await tx.delete(billingEmails).where(eq(billingEmails.userId, userId))
    await tx
      .update(publications)
      .set({
        deletedAt: now,
        design: null,
        disabledAt: sql`coalesce(${publications.disabledAt}, ${now.toISOString()}::timestamptz)`,
        fingerprint: sql`'deleted:' || ${publications.id}::text`
      })
      .where(
        and(eq(publications.ownerId, userId), isNull(publications.deletedAt))
      )
    await tx
      .update(publications)
      .set({ design: null })
      .where(eq(publications.ownerId, userId))
    // Running operations retain cost state but can no longer restore private work.
    await tx
      .update(generationOperations)
      .set({ result: null })
      .where(eq(generationOperations.ownerId, userId))
    await tx
      .update(imageOperations)
      .set({
        recipe: null,
        prompt: null,
        referenceAssetId: null,
        referenceHash: null
      })
      .where(eq(imageOperations.ownerId, userId))
    await queueAccountAssetCleanup(userId, tx)
    await tx.delete(savedDrafts).where(eq(savedDrafts.ownerId, userId))
    await tx.delete(savedTemplates).where(eq(savedTemplates.ownerId, userId))
    await tx
      .delete(accountPreferences)
      .where(eq(accountPreferences.userId, userId))
  })
  // A failed cancellation leaves a closing account and a durable billing
  // tombstone. Better Auth must not report deletion complete until this succeeds.
  try {
    await cancelAccountSubscriptions(userId)
    await getDb()
      .update(billingAccounts)
      .set({ cancellationCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(billingAccounts.userId, userId))
  } catch {
    throw new AppError(
      'Your account is closing, but billing cancellation needs another attempt. Retry account deletion before considering it complete.',
      503
    )
  }
}

export async function getAccountPreferences(userId: string) {
  const [saved] = await getDb()
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, userId))
  return {
    appearance: saved?.appearance ?? DEFAULT_CARD_APPEARANCE,
    saved: Boolean(saved)
  }
}

export async function setAccountPreferences(
  userId: string,
  appearance: CardAppearance,
  initializeOnly = false
) {
  const parsed = cardAppearanceSchema.parse(appearance)
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    const [user] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
    if (!user || user.deletionRequestedAt)
      throw new AppError('This account is unavailable.', 403)
    const query = tx
      .insert(accountPreferences)
      .values({ userId, appearance: parsed })
    if (initializeOnly) await query.onConflictDoNothing()
    else
      await query.onConflictDoUpdate({
        target: accountPreferences.userId,
        set: { appearance: parsed, updatedAt: new Date() }
      })
    const [saved] = await tx
      .select()
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, userId))
    return { appearance: saved!.appearance, saved: true }
  })
}

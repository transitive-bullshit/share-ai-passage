import {
  and,
  asc,
  count,
  eq,
  isNull,
  lte,
  notExists,
  or,
  sql
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { getDb } from './db'
import { authUsers, billingAccounts, billingEmails } from './db/schema'
import {
  isEmailConfigured,
  prepareSubscriptionEmail,
  sendSubscriptionEmail
} from './email'

async function claimEmail(userId?: string) {
  return getDb().transaction(async (tx) => {
    const now = new Date()
    const earlier = alias(billingEmails, 'earlier_email')
    const [record] = await tx
      .select()
      .from(billingEmails)
      .where(
        and(
          eq(billingEmails.status, 'pending'),
          lte(billingEmails.retryAt, now),
          or(
            isNull(billingEmails.leaseUntil),
            lte(billingEmails.leaseUntil, now)
          ),
          userId ? eq(billingEmails.userId, userId) : undefined,
          // Keep changes ordered for each account, including after delivery failure.
          notExists(
            tx
              .select({ id: earlier.id })
              .from(earlier)
              .where(
                and(
                  eq(earlier.userId, billingEmails.userId),
                  eq(earlier.status, 'pending'),
                  sql`(${earlier.createdAt}, ${earlier.id}) < (${billingEmails.createdAt}, ${billingEmails.id})`
                )
              )
          )
        )
      )
      .orderBy(asc(billingEmails.createdAt), asc(billingEmails.id))
      .limit(1)
      .for('update', { skipLocked: true })
    if (!record) return null
    const [user] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, record.userId))
    const [account] = await tx
      .select({ closingAt: billingAccounts.closingAt })
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, record.userId))
    if (
      !user ||
      user.isAnonymous ||
      !user.emailVerified ||
      user.deletionRequestedAt ||
      account?.closingAt ||
      user.email.toLowerCase() !== record.recipient.toLowerCase()
    ) {
      await tx
        .update(billingEmails)
        .set({ status: 'skipped', leaseUntil: null, lastError: null })
        .where(eq(billingEmails.id, record.id))
      return { kind: 'skipped' as const }
    }
    // Resend keys expire after 24h. An uncertain send outside that window must
    // be reviewed instead of potentially delivering the same confirmation twice.
    if (
      record.firstAttemptAt &&
      now.getTime() - record.firstAttemptAt.getTime() >= 23 * 60 * 60_000
    ) {
      await tx
        .update(billingEmails)
        .set({
          status: 'needs_review',
          leaseUntil: null,
          lastError: 'Delivery outcome needs review; automatic retries paused.'
        })
        .where(eq(billingEmails.id, record.id))
      return { kind: 'needsReview' as const }
    }
    if (!isEmailConfigured()) {
      await tx
        .update(billingEmails)
        .set({
          retryAt: new Date(now.getTime() + 5 * 60_000),
          lastError: 'Subscription email configuration is unavailable.'
        })
        .where(eq(billingEmails.id, record.id))
      return { kind: 'failed' as const }
    }
    const payload =
      record.payload ??
      prepareSubscriptionEmail(record.recipient, record.message)
    const leaseUntil = new Date(now.getTime() + 60_000)
    await tx
      .update(billingEmails)
      .set({
        payload,
        firstAttemptAt: record.firstAttemptAt ?? now,
        leaseUntil,
        attempts: sql`${billingEmails.attempts} + 1`
      })
      .where(eq(billingEmails.id, record.id))
    return { kind: 'send' as const, id: record.id, payload, leaseUntil }
  })
}

/** Bounded, awaited delivery after billing commits; cron resumes abandoned leases. */
export async function deliverBillingEmails({
  userId,
  limit = 10
}: { userId?: string; limit?: number } = {}) {
  const result = { examined: 0, sent: 0, skipped: 0, failed: 0, needsReview: 0 }
  const deadline = Date.now() + 40_000
  for (let i = 0; i < limit && Date.now() < deadline; i++) {
    const claimed = await claimEmail(userId)
    if (!claimed) break
    result.examined++
    if (claimed.kind !== 'send') {
      result[claimed.kind]++
      continue
    }
    let accepted = false
    try {
      await sendSubscriptionEmail(claimed.payload, claimed.id)
      accepted = true
    } catch {
      // The same frozen payload/key will be retried; paid access stays committed.
    }
    await getDb()
      .update(billingEmails)
      .set({
        status: accepted ? 'sent' : 'pending',
        sentAt: accepted ? new Date() : null,
        leaseUntil: null,
        retryAt: new Date(Date.now() + 5 * 60_000),
        lastError: accepted
          ? null
          : 'Subscription email delivery failed; retry pending.'
      })
      .where(
        and(
          eq(billingEmails.id, claimed.id),
          eq(billingEmails.status, 'pending'),
          eq(billingEmails.leaseUntil, claimed.leaseUntil)
        )
      )
    if (accepted) result.sent++
    else result.failed++
  }
  const [attention] = await getDb()
    .select({ total: count() })
    .from(billingEmails)
    .where(
      and(
        eq(billingEmails.status, 'needs_review'),
        userId ? eq(billingEmails.userId, userId) : undefined
      )
    )
  result.needsReview = attention!.total
  return result
}

/** Email availability must not make a successful subscription update fail. */
export async function deliverAccountBillingEmails(userId: string) {
  try {
    await deliverBillingEmails({ userId, limit: 1 })
  } catch {
    console.error(
      'Subscription emails remain pending for the billing email retry job.'
    )
  }
}

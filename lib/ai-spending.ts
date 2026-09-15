import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'

import {
  purchasedAiSpendLimit,
  subscriptionAiSpendLimit,
  type AiSpending
} from './ai-spending-policy'
import type { Transaction } from './db'
import {
  billingAccounts,
  generationOperations,
  imageCreditGrants,
  imageOperations,
  usagePeriods
} from './db/schema'
import type { PaidPlanId } from './plans'

/** Caller holds the shared account usage lock. Admission and cost settlement
 * use that same lock; operation rows are the sole monetary ledger. */
export async function readSubscriptionAiSpending(
  tx: Transaction,
  subjectKey: string,
  plan: PaidPlanId,
  window: { startsAt: Date; endsAt: Date }
): Promise<AiSpending> {
  const userId = subjectKey.slice('user:'.length)
  const [billing] = await tx
    .select({ interval: billingAccounts.billingInterval })
    .from(billingAccounts)
    .where(eq(billingAccounts.userId, userId))
  const [summaries] = await tx
    .select({
      liability:
        sql<number>`coalesce(sum(coalesce(${generationOperations.actualCostMicros}, ${generationOperations.reservedCostMicros})), 0)`.mapWith(
          Number
        )
    })
    .from(generationOperations)
    .innerJoin(usagePeriods, eq(generationOperations.periodId, usagePeriods.id))
    .where(
      and(
        eq(usagePeriods.subjectKey, subjectKey),
        isNull(generationOperations.budgetPeriodId),
        gte(generationOperations.createdAt, window.startsAt),
        lt(generationOperations.createdAt, window.endsAt)
      )
    )
  const [images] = await tx
    .select({
      liability:
        sql<number>`coalesce(sum(coalesce(${imageOperations.actualCostMicros}, ${imageOperations.reservedCostMicros})), 0)`.mapWith(
          Number
        )
    })
    .from(imageOperations)
    .innerJoin(
      imageCreditGrants,
      eq(imageOperations.grantId, imageCreditGrants.id)
    )
    .where(
      and(
        eq(imageCreditGrants.userId, userId),
        eq(imageCreditGrants.kind, 'included'),
        gte(imageOperations.createdAt, window.startsAt),
        lt(imageOperations.createdAt, window.endsAt)
      )
    )
  return {
    scope: 'subscription',
    limitMicros: subscriptionAiSpendLimit(plan, billing?.interval ?? null),
    liabilityMicros: (summaries?.liability ?? 0) + (images?.liability ?? 0),
    resetAt: window.endsAt
  }
}

/** Purchased funding and its costs persist across monthly resets. Pool funding
 * without changing credit debit order, so a later pack can restore headroom. */
export async function readPurchasedAiSpending(
  tx: Transaction,
  userId: string
): Promise<AiSpending> {
  const grants = await tx
    .select({
      paidCents: imageCreditGrants.paidCents,
      refundedCents: imageCreditGrants.refundedCents,
      disputed: imageCreditGrants.disputed,
      currency: imageCreditGrants.currency
    })
    .from(imageCreditGrants)
    .where(
      and(
        eq(imageCreditGrants.userId, userId),
        eq(imageCreditGrants.kind, 'pack')
      )
    )
  const [cost] = await tx
    .select({
      liability:
        sql<number>`coalesce(sum(coalesce(${imageOperations.actualCostMicros}, ${imageOperations.reservedCostMicros})), 0)`.mapWith(
          Number
        )
    })
    .from(imageOperations)
    .innerJoin(
      imageCreditGrants,
      eq(imageOperations.grantId, imageCreditGrants.id)
    )
    .where(
      and(
        eq(imageCreditGrants.userId, userId),
        eq(imageCreditGrants.kind, 'pack')
      )
    )
  return {
    scope: 'purchased-images',
    limitMicros: purchasedAiSpendLimit(grants),
    liabilityMicros: cost?.liability ?? 0
  }
}

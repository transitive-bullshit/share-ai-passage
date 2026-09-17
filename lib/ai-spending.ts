import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'

import { subscriptionAiSpendLimit, type AiSpending } from './ai-spending-policy'
import type { Transaction } from './db'
import {
  billingAccounts,
  generationOperations,
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
  return {
    scope: 'subscription',
    limitMicros: subscriptionAiSpendLimit(plan, billing?.interval ?? null),
    liabilityMicros: summaries?.liability ?? 0,
    resetAt: window.endsAt
  }
}

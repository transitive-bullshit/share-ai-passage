import { createHash } from 'node:crypto'

import { and, eq, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'

import { getDb, type Transaction } from './db'
import {
  aiBudgetPeriods,
  billingAccounts,
  billingEvents,
  generationOperations
} from './db/schema'
import {
  FREE_AI_MONTHLY_BUDGET_MICROS,
  SUMMARY_RESERVATION_MICROS,
  utcUsagePeriod
} from './usage-policy'

const staleMinutes = 30
const countWhere = (condition: ReturnType<typeof sql>) =>
  sql<number>`count(*) filter (where ${condition})`.mapWith(Number)

async function operationCounts(
  tx: Transaction,
  table: typeof generationOperations,
  cutoff: Date,
  month: ReturnType<typeof utcUsagePeriod>
) {
  const [counts] = await tx
    .select({
      staleUnresolved:
        countWhere(sql`${table.createdAt} < ${cutoff.toISOString()}::timestamptz and
        ${table.status} in ('reserved', 'dispatching', 'running', 'uncertain')`),
      staleUnknownCost:
        countWhere(sql`${table.createdAt} < ${cutoff.toISOString()}::timestamptz and
        ${table.status} in ('succeeded', 'failed', 'cancelled') and
        ${table.actualCostMicros} is null`),
      currentMonthCostOverruns:
        countWhere(sql`${table.createdAt} >= ${month.startsAt.toISOString()}::timestamptz
        and ${table.createdAt} < ${month.endsAt.toISOString()}::timestamptz
        and ${table.actualCostMicros} > ${table.reservedCostMicros}`)
    })
    .from(table)
  return counts!
}

/** One read-only snapshot; no provider calls, locks, repairs or budget creation. */
export async function readOperationsReport(now = new Date()) {
  const month = utcUsagePeriod(now)
  const cutoff = new Date(now.getTime() - staleMinutes * 60_000)
  return getDb().transaction(
    async (tx) => {
      const summary = await operationCounts(
        tx,
        generationOperations,
        cutoff,
        month
      )
      const [events] = await tx
        .select({
          failedEvents: countWhere(sql`${billingEvents.lastError} is not null`),
          overdueEvents: countWhere(sql`${billingEvents.lastError} is null and
          ${billingEvents.receivedAt} < ${cutoff.toISOString()}::timestamptz`)
        })
        .from(billingEvents)
        .where(
          and(
            isNull(billingEvents.processedAt),
            lte(billingEvents.receivedAt, now)
          )
        )
      const [closing] = await tx
        .select({ overdueCancellations: sql<number>`count(*)`.mapWith(Number) })
        .from(billingAccounts)
        .where(
          and(
            isNotNull(billingAccounts.closingAt),
            lt(billingAccounts.closingAt, cutoff),
            isNull(billingAccounts.cancellationCompletedAt)
          )
        )
      const billing = { ...events!, ...closing! }
      const [free] = await tx
        .select({
          limitMicros: aiBudgetPeriods.limitMicros,
          liabilityMicros:
            sql<number>`${aiBudgetPeriods.spentMicros}::bigint + ${aiBudgetPeriods.reservedMicros}`.mapWith(
              Number
            )
        })
        .from(aiBudgetPeriods)
        .where(eq(aiBudgetPeriods.startsAt, month.startsAt))
      const freeBudget = free ?? {
        limitMicros: FREE_AI_MONTHLY_BUDGET_MICROS,
        liabilityMicros: 0
      }
      const budgets = {
        free: {
          ...freeBudget,
          nextReservationMicros: SUMMARY_RESERVATION_MICROS,
          exhausted:
            freeBudget.liabilityMicros + SUMMARY_RESERVATION_MICROS >
            freeBudget.limitMicros
        }
      }
      const issues = [
        ...(summary.staleUnresolved ? ['stale_summary_operations'] : []),
        ...(summary.staleUnknownCost ? ['unknown_summary_costs'] : []),
        ...(billing.failedEvents ? ['failed_billing_events'] : []),
        ...(billing.overdueEvents ? ['overdue_billing_events'] : []),
        ...(billing.overdueCancellations
          ? ['overdue_closing_cancellations']
          : []),
        ...(budgets.free.exhausted ? ['free_service_budget_exhausted'] : []),
        ...(summary.currentMonthCostOverruns
          ? ['current_month_reservation_cost_overruns']
          : [])
      ]
      return {
        status: issues.length
          ? ('action_required' as const)
          : ('healthy' as const),
        checkedAt: now.toISOString(),
        olderThanMinutes: staleMinutes,
        reportingMonth: {
          startsAt: month.startsAt.toISOString(),
          endsAt: month.endsAt.toISOString()
        },
        summary,
        billing,
        budgets,
        issues
      }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' }
  )
}

export type OperationsReport = Awaited<ReturnType<typeof readOperationsReport>>

/** A stable day/report body keeps Resend retries identical without a local receipt table. */
export function operationsDigest(
  report: OperationsReport,
  databaseScope: string
) {
  const { checkedAt, ...counts } = report
  const day = checkedAt.slice(0, 10)
  const scope = createHash('sha256')
    .update(databaseScope)
    .digest('hex')
    .slice(0, 12)
  const text = `Passage operations (${scope}) — ${day}\n${JSON.stringify(counts, null, 2)}\nReview unresolved operations with reconcile:summary and billing events with reconcile:billing.`
  return {
    text,
    idempotencyKey: createHash('sha256').update(text).digest('hex')
  }
}

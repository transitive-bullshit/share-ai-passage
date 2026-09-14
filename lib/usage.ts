import { and, eq, inArray, sql } from 'drizzle-orm'

import { getDb, type Transaction } from './db'
import {
  aiBudgetPeriods,
  authUsers,
  generationOperations,
  guestImports,
  savedDrafts,
  usagePeriods
} from './db/schema'
import type { GeneratedPreview } from './domain'
import { AppError } from './errors'
import { validateGeneratedPreview } from './summary'
import {
  FREE_AI_MONTHLY_BUDGET_MICROS,
  SUMMARY_RESERVATION_MICROS,
  utcUsagePeriod,
  usageLimitError,
  validateCostMicros,
  validateSummaryAllowance
} from './usage-policy'

export type SummaryOperation = typeof generationOperations.$inferSelect

export type ReserveSummaryInput = {
  ownerId: string | null
  subjectKey: string
  requestSubjectKey?: string
  allowance: number
  requestKey: string
  inputHash: string
  snapshotId?: string | null
  draftId?: string | null
  draftRevision?: number | null
  now?: Date
}

/** Import and deletion callers use these same locks before changing ownership. */
export async function lockUsageSubjects(
  tx: Transaction,
  ...subjects: string[]
) {
  for (const subject of [...new Set(subjects)].sort()) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`summary-usage:${subject}`}, 0))`
    )
  }
}

function sameRequest(operation: SummaryOperation, input: ReserveSummaryInput) {
  return (
    operation.inputHash === input.inputHash &&
    operation.snapshotId === (input.snapshotId ?? null) &&
    operation.draftId === (input.draftId ?? null) &&
    operation.draftRevision === (input.draftRevision ?? null)
  )
}

async function ensureUsagePeriod(
  tx: Transaction,
  subjectKey: string,
  allowance: number,
  period: { startsAt: Date; endsAt: Date }
) {
  await tx
    .insert(usagePeriods)
    .values({
      subjectKey,
      allowance,
      startsAt: period.startsAt,
      endsAt: period.endsAt
    })
    .onConflictDoNothing()
  const [saved] = await tx
    .select()
    .from(usagePeriods)
    .where(
      and(
        eq(usagePeriods.subjectKey, subjectKey),
        eq(usagePeriods.startsAt, period.startsAt)
      )
    )
    .for('update')
  if (!saved) throw new Error('Usage period was not saved.')
  // Verification can promote a guest allowance without resetting usage.
  if (saved.allowance !== allowance) {
    const [updated] = await tx
      .update(usagePeriods)
      .set({ allowance })
      .where(eq(usagePeriods.id, saved.id))
      .returning()
    return updated!
  }
  return saved
}

/** Call only after cache/lease checks establish that new model work is needed. */
export async function reserveSummary(input: ReserveSummaryInput) {
  validateSummaryAllowance(input.allowance)
  if (!input.subjectKey || !input.requestKey || !input.inputHash) {
    throw new AppError('A generation request identity is required.')
  }
  const now = input.now ?? new Date()
  const period = utcUsagePeriod(now)
  const requestSubjectKey = input.requestSubjectKey ?? input.subjectKey
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, input.subjectKey, requestSubjectKey)
    if (input.subjectKey.startsWith('user:')) {
      const userId = input.subjectKey.slice('user:'.length)
      const [account] = await tx
        .select({
          id: authUsers.id,
          deletionRequestedAt: authUsers.deletionRequestedAt
        })
        .from(authUsers)
        .where(eq(authUsers.id, userId))
      const [imported] = await tx
        .select({ id: guestImports.guestUserId })
        .from(guestImports)
        .where(eq(guestImports.guestUserId, userId))
      if (!account || account.deletionRequestedAt || imported) {
        throw new AppError(
          'Your account session changed. Reload before generating.',
          409
        )
      }
    }
    const [existing] = await tx
      .select()
      .from(generationOperations)
      .where(
        and(
          eq(generationOperations.subjectKey, requestSubjectKey),
          eq(generationOperations.requestKey, input.requestKey)
        )
      )
    if (existing) {
      const [chargingPeriod] = await tx
        .select({ subjectKey: usagePeriods.subjectKey })
        .from(usagePeriods)
        .where(eq(usagePeriods.id, existing.periodId))
      if (chargingPeriod?.subjectKey !== input.subjectKey) {
        throw new AppError(
          'This generation belongs to another usage account.',
          409
        )
      }
      if (!sameRequest(existing, input)) {
        throw new AppError(
          'This generation request key was already used for different inputs.',
          409
        )
      }
      return { operation: existing, created: false }
    }

    await tx
      .insert(aiBudgetPeriods)
      .values({
        ...period,
        limitMicros: FREE_AI_MONTHLY_BUDGET_MICROS
      })
      .onConflictDoNothing()
    const [budget] = await tx
      .select()
      .from(aiBudgetPeriods)
      .where(eq(aiBudgetPeriods.startsAt, period.startsAt))
      .for('update')
    if (!budget) throw new Error('AI budget period was not saved.')
    if (
      budget.spentMicros + budget.reservedMicros + SUMMARY_RESERVATION_MICROS >
      budget.limitMicros
    ) {
      throw usageLimitError(period.endsAt, now, true)
    }
    const usage = await ensureUsagePeriod(
      tx,
      input.subjectKey,
      input.allowance,
      period
    )
    if (usage.used + usage.reserved >= usage.allowance) {
      throw usageLimitError(usage.endsAt, now)
    }
    await tx
      .update(usagePeriods)
      .set({ reserved: sql`${usagePeriods.reserved} + 1` })
      .where(eq(usagePeriods.id, usage.id))
    await tx
      .update(aiBudgetPeriods)
      .set({
        reservedMicros: sql`${aiBudgetPeriods.reservedMicros} + ${SUMMARY_RESERVATION_MICROS}`
      })
      .where(eq(aiBudgetPeriods.id, budget.id))
    const [operation] = await tx
      .insert(generationOperations)
      .values({
        ownerId: input.ownerId,
        subjectKey: requestSubjectKey,
        requestKey: input.requestKey,
        inputHash: input.inputHash,
        periodId: usage.id,
        budgetPeriodId: budget.id,
        snapshotId: input.snapshotId ?? null,
        draftId: input.draftId ?? null,
        draftRevision: input.draftRevision ?? null,
        status: 'reserved',
        reservedCostMicros: SUMMARY_RESERVATION_MICROS,
        createdAt: now,
        updatedAt: now
      })
      .returning()
    return { operation: operation!, created: true }
  })
}

const changedSubject = Symbol('changed usage subject')

async function withOperation<T>(
  id: string,
  action: (tx: Transaction, operation: SummaryOperation) => Promise<T>
): Promise<T> {
  // Import can change the charging period between the first read and lock.
  // Restart before changing anything; never lock a stale subject then mutate it.
  for (;;) {
    const result = await getDb().transaction(async (tx) => {
      const [found] = await tx
        .select()
        .from(generationOperations)
        .where(eq(generationOperations.id, id))
      if (!found) throw new AppError('Generation not found.', 404)
      const [period] = await tx
        .select()
        .from(usagePeriods)
        .where(eq(usagePeriods.id, found.periodId))
      if (!period) throw new Error('Generation usage period is missing.')
      await lockUsageSubjects(tx, period.subjectKey)
      const [operation] = await tx
        .select()
        .from(generationOperations)
        .where(eq(generationOperations.id, id))
        .for('update')
      if (!operation) throw new AppError('Generation not found.', 404)
      if (operation.periodId !== found.periodId) return changedSubject
      return action(tx, operation)
    })
    if (result !== changedSubject) return result as T
  }
}

async function chargingAccountUnavailable(
  tx: Transaction,
  operation: SummaryOperation
) {
  if (operation.draftId) {
    const [draft] = await tx
      .select({ deletedAt: savedDrafts.deletedAt })
      .from(savedDrafts)
      .where(eq(savedDrafts.id, operation.draftId))
    if (!draft || draft.deletedAt) return true
  }
  const [period] = await tx
    .select({ subjectKey: usagePeriods.subjectKey })
    .from(usagePeriods)
    .where(eq(usagePeriods.id, operation.periodId))
  if (!period) throw new Error('Generation usage period is missing.')
  if (!period.subjectKey.startsWith('user:')) return false
  const [account] = await tx
    .select({ deletionRequestedAt: authUsers.deletionRequestedAt })
    .from(authUsers)
    .where(eq(authUsers.id, period.subjectKey.slice('user:'.length)))
  return !account || Boolean(account.deletionRequestedAt)
}

/** Only the caller that claims this transition may dispatch a provider request. */
export function startSummaryOperation(id: string, providerRequestId?: string) {
  return withOperation(id, async (tx, operation) => {
    if (operation.status !== 'reserved') return { operation, claimed: false }
    if (await chargingAccountUnavailable(tx, operation)) {
      const cancelled = await finishOperation(tx, operation, 'cancelled', 0)
      return { operation: cancelled, claimed: false }
    }
    const [running] = await tx
      .update(generationOperations)
      .set({
        status: 'running',
        providerRequestId: providerRequestId ?? operation.providerRequestId,
        updatedAt: new Date()
      })
      .where(eq(generationOperations.id, id))
      .returning()
    return { operation: running!, claimed: true }
  })
}

export function markSummaryUncertain(id: string, providerRequestId?: string) {
  return withOperation(id, async (tx, operation) => {
    if (!['running', 'uncertain'].includes(operation.status)) return operation
    const [updated] = await tx
      .update(generationOperations)
      .set({
        status: 'uncertain',
        providerRequestId: providerRequestId ?? operation.providerRequestId,
        updatedAt: new Date()
      })
      .where(eq(generationOperations.id, id))
      .returning()
    return updated!
  })
}

async function settleBudget(
  tx: Transaction,
  operation: SummaryOperation,
  actualCostMicros: number
) {
  validateCostMicros(actualCostMicros)
  await tx
    .update(aiBudgetPeriods)
    .set({
      reservedMicros: sql`${aiBudgetPeriods.reservedMicros} - ${operation.reservedCostMicros}`,
      spentMicros: sql`${aiBudgetPeriods.spentMicros} + ${actualCostMicros}`
    })
    .where(eq(aiBudgetPeriods.id, operation.budgetPeriodId))
}

async function finishOperation(
  tx: Transaction,
  operation: SummaryOperation,
  status: 'succeeded' | 'failed' | 'cancelled',
  actualCostMicros: number | null,
  result: GeneratedPreview | null = null,
  providerRequestId?: string
) {
  if (actualCostMicros !== null) validateCostMicros(actualCostMicros)
  if (['succeeded', 'failed', 'cancelled'].includes(operation.status))
    return operation
  if (status === 'succeeded' && operation.status === 'reserved') {
    throw new AppError('Generation has not been dispatched.', 409)
  }
  if (status === 'cancelled' && operation.status !== 'reserved')
    return operation
  await tx
    .update(usagePeriods)
    .set({
      reserved: sql`${usagePeriods.reserved} - 1`,
      used: sql`${usagePeriods.used} + ${status === 'succeeded' ? 1 : 0}`
    })
    .where(eq(usagePeriods.id, operation.periodId))
  if (actualCostMicros !== null)
    await settleBudget(tx, operation, actualCostMicros)
  if (result && (await chargingAccountUnavailable(tx, operation))) result = null
  const now = new Date()
  const [finished] = await tx
    .update(generationOperations)
    .set({
      status,
      result,
      actualCostMicros,
      providerRequestId: providerRequestId ?? operation.providerRequestId,
      updatedAt: now,
      completedAt: now
    })
    .where(eq(generationOperations.id, operation.id))
    .returning()
  return finished!
}

/** The result and usage settlement commit together; return it only after commit. */
export function succeedSummaryOperation(
  id: string,
  result: GeneratedPreview,
  actualCostMicros: number | null,
  providerRequestId?: string
) {
  return withOperation(id, (tx, operation) =>
    finishOperation(
      tx,
      operation,
      'succeeded',
      actualCostMicros,
      validateGeneratedPreview(result),
      providerRequestId
    )
  )
}

/** Definitive no-usable-result failure refunds quota, even when the provider billed. */
export function failSummaryOperation(
  id: string,
  actualCostMicros: number | null,
  providerRequestId?: string
) {
  return withOperation(id, (tx, operation) =>
    finishOperation(
      tx,
      operation,
      'failed',
      actualCostMicros,
      null,
      providerRequestId
    )
  )
}

export function cancelUndispatchedSummary(id: string) {
  return withOperation(id, (tx, operation) =>
    finishOperation(tx, operation, 'cancelled', 0)
  )
}

/** Only authoritative cost evidence releases liability for a completed operation. */
export function reconcileSummaryCost(id: string, actualCostMicros: number) {
  validateCostMicros(actualCostMicros)
  return withOperation(id, async (tx, operation) => {
    if (!['succeeded', 'failed', 'cancelled'].includes(operation.status)) {
      throw new AppError(
        'Resolve the generation outcome before reconciling its final cost.',
        409
      )
    }
    if (operation.actualCostMicros !== null) return operation
    await settleBudget(tx, operation, actualCostMicros)
    const [updated] = await tx
      .update(generationOperations)
      .set({
        actualCostMicros,
        updatedAt: new Date()
      })
      .where(eq(generationOperations.id, id))
      .returning()
    return updated!
  })
}

/** Used inside the account/draft deletion transaction before removing ownership. */
export async function cancelUndispatchedSummaries(
  tx: Transaction,
  subjectKey: string,
  draftId?: string
) {
  await lockUsageSubjects(tx, subjectKey)
  const periods = await tx
    .select({ id: usagePeriods.id })
    .from(usagePeriods)
    .where(eq(usagePeriods.subjectKey, subjectKey))
  if (!periods.length) return
  const operations = await tx
    .select()
    .from(generationOperations)
    .where(
      and(
        inArray(
          generationOperations.periodId,
          periods.map((period) => period.id)
        ),
        eq(generationOperations.status, 'reserved'),
        draftId ? eq(generationOperations.draftId, draftId) : undefined
      )
    )
    .orderBy(generationOperations.createdAt)
    .for('update')
  for (const operation of operations)
    await finishOperation(tx, operation, 'cancelled', 0)
}

export async function getSummaryUsage(
  subjectKey: string,
  allowance: number,
  now = new Date()
) {
  validateSummaryAllowance(allowance)
  const period = utcUsagePeriod(now)
  const [[usage], [budget]] = await Promise.all([
    getDb()
      .select()
      .from(usagePeriods)
      .where(
        and(
          eq(usagePeriods.subjectKey, subjectKey),
          eq(usagePeriods.startsAt, period.startsAt)
        )
      ),
    getDb()
      .select()
      .from(aiBudgetPeriods)
      .where(eq(aiBudgetPeriods.startsAt, period.startsAt))
  ])
  const used = usage?.used ?? 0
  const reserved = usage?.reserved ?? 0
  return {
    allowance,
    used,
    reserved,
    remaining: Math.max(0, allowance - used - reserved),
    resetAt: period.endsAt,
    generationPaused: budget
      ? budget.spentMicros +
          budget.reservedMicros +
          SUMMARY_RESERVATION_MICROS >
        budget.limitMicros
      : false
  }
}

/** Caller records the guest import marker and ownership changes in this transaction. */
export async function moveSubjectUsage(
  tx: Transaction,
  guestSubject: string,
  userSubject: string,
  periodNow = new Date()
) {
  if (guestSubject === userSubject) return
  await lockUsageSubjects(tx, guestSubject, userSubject)
  await ensureUsagePeriod(tx, userSubject, 25, utcUsagePeriod(periodNow))
  const guestPeriods = await tx
    .select()
    .from(usagePeriods)
    .where(eq(usagePeriods.subjectKey, guestSubject))
    .orderBy(usagePeriods.startsAt)
    .for('update')
  for (const guest of guestPeriods) {
    const target = await ensureUsagePeriod(tx, userSubject, 25, guest)
    await tx
      .update(usagePeriods)
      .set({
        used: sql`${usagePeriods.used} + ${guest.used}`,
        reserved: sql`${usagePeriods.reserved} + ${guest.reserved}`
      })
      .where(eq(usagePeriods.id, target.id))
    await tx
      .update(generationOperations)
      .set({ periodId: target.id })
      .where(eq(generationOperations.periodId, guest.id))
    await tx
      .update(usagePeriods)
      .set({ used: 0, reserved: 0 })
      .where(eq(usagePeriods.id, guest.id))
  }
}

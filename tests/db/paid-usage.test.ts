import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { mergeGuestAccount } from '@/lib/accounts'
import { closeDatabase, getDb } from '@/lib/db'
import {
  aiBudgetPeriods,
  assets,
  authUsers,
  billingAccounts,
  generationOperations,
  imageCreditGrants,
  imageOperations,
  usagePeriods
} from '@/lib/db/schema'

import {
  cancelUndispatchedSummary,
  failSummaryOperation,
  getSummaryUsage,
  reserveSummary,
  startSummaryOperation,
  succeedSummaryOperation
} from '@/lib/usage'
import {
  FREE_AI_MONTHLY_BUDGET_MICROS,
  SUMMARY_RESERVATION_MICROS,
  utcUsagePeriod
} from '@/lib/usage-policy'

const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = []
const budgetStarts: Date[] = []
const preview = {
  title: 'Save once',
  highlights: ['Keep the result across retries.']
}
const year = 7000 + Math.floor(Math.random() * 1000)
let index = 0
async function account() {
  const id = randomUUID()
  users.push(id)
  const now = new Date(Date.UTC(year, index++ * 2, 15))
  const through = new Date(
    Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 15)
  )
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Paid usage fixture',
      email: `${id}@example.invalid`,
      emailVerified: true
    })
  await getDb().insert(billingAccounts).values({
    userId: id,
    paidPlan: 'plus',
    paidThrough: through,
    allowanceAnchorAt: now,
    status: 'active',
    billingInterval: 'year'
  })
  return { id, now, subjectKey: `user:${id}` }
}
function summary(user: Awaited<ReturnType<typeof account>>, now = user.now) {
  return {
    ownerId: user.id,
    subjectKey: user.subjectKey,
    allowance: 25,
    requestKey: randomUUID(),
    inputHash: randomUUID(),
    now
  }
}

describe.skipIf(!testUrl)('Paid generation accounting in PostgreSQL', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })
  afterAll(async () => {
    if (users.length) {
      const subjects = users.map((id) => `user:${id}`)
      await getDb()
        .delete(imageOperations)
        .where(inArray(imageOperations.subjectKey, subjects))
      await getDb()
        .delete(imageCreditGrants)
        .where(inArray(imageCreditGrants.userId, users))
      await getDb()
        .delete(generationOperations)
        .where(inArray(generationOperations.subjectKey, subjects))
      await getDb()
        .delete(usagePeriods)
        .where(inArray(usagePeriods.subjectKey, subjects))
      await getDb().delete(assets).where(inArray(assets.ownerId, users))
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    if (budgetStarts.length)
      await getDb()
        .delete(aiBudgetPeriods)
        .where(inArray(aiBudgetPeriods.startsAt, budgetStarts))
    await closeDatabase()
  })

  it('shares a tightened monthly summary budget across paid and free accounts without debiting rejected work', async () => {
    const user = await account()
    const free = await account()
    await getDb()
      .delete(billingAccounts)
      .where(eq(billingAccounts.userId, free.id))
    const now = user.now
    const period = utcUsagePeriod(now)
    budgetStarts.push(period.startsAt)
    await getDb()
      .insert(aiBudgetPeriods)
      .values({
        ...period,
        limitMicros: FREE_AI_MONTHLY_BUDGET_MICROS,
        spentMicros: 1_000_000 - SUMMARY_RESERVATION_MICROS
      })
    vi.stubEnv('SUMMARY_AI_MONTHLY_BUDGET_USD', '1')
    try {
      const results = await Promise.allSettled([
        reserveSummary(summary(user, now)),
        reserveSummary(summary(free, now))
      ])
      const accepted = results.filter((r) => r.status === 'fulfilled')
      expect(accepted).toHaveLength(1)
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { status: 429, details: { code: 'SUMMARY_BUDGET_LIMIT' } }
      })
      for (const subjectKey of [user.subjectKey, free.subjectKey])
        expect(await getSummaryUsage(subjectKey, 25, now)).toMatchObject({
          used: 0,
          generationPaused: true,
          generationPauseCode: 'SUMMARY_BUDGET_LIMIT'
        })
      const operation = accepted[0]!.value.operation
      expect(operation.budgetPeriodId).toBeTruthy()
      await startSummaryOperation(operation.id)
      await succeedSummaryOperation(operation.id, preview, 1_000)
      const [budget] = await getDb()
        .select()
        .from(aiBudgetPeriods)
        .where(eq(aiBudgetPeriods.startsAt, period.startsAt))
      expect(budget).toMatchObject({
        limitMicros: 1_000_000,
        spentMicros: 981_000,
        reservedMicros: 0
      })
      expect(await getSummaryUsage(user.subjectKey, 25, now)).toMatchObject({
        generationPaused: true
      })
      vi.stubEnv('SUMMARY_AI_MONTHLY_BUDGET_USD', '1.02')
      expect(await getSummaryUsage(user.subjectKey, 25, now)).toMatchObject({
        generationPaused: false
      })
      const retry = await reserveSummary(summary(user, now))
      expect(retry.created).toBe(true)
      await cancelUndispatchedSummary(retry.operation.id)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('serializes concurrent summary spending without debiting a request denied by the account budget', async () => {
    const user = await account()
    const seeded = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(seeded.id)
    await succeedSummaryOperation(seeded.id, preview, 1_560_000)
    const inputs = [summary(user), summary(user)]
    const results = await Promise.allSettled(
      inputs.map((input) => reserveSummary(input))
    )
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected')
    ).toMatchObject({ reason: { details: { code: 'AI_SPEND_LIMIT' } } })
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      used: 1,
      reserved: 1,
      remaining: 98,
      generationPaused: true
    })
    const accepted = results.find((result) => result.status === 'fulfilled')
    if (accepted?.status === 'fulfilled')
      await cancelUndispatchedSummary(accepted.value.operation.id)
  })

  it('charges imported request identities to their current account while retaining the separate Free subsidy', async () => {
    const user = await account()
    const guest = await account()
    await getDb()
      .update(authUsers)
      .set({ isAnonymous: true })
      .where(eq(authUsers.id, guest.id))
    const month = utcUsagePeriod(user.now)
    budgetStarts.push(month.startsAt)
    const free = (await reserveSummary(summary(guest, user.now))).operation
    await startSummaryOperation(free.id)
    await failSummaryOperation(free.id, 1_580_000)
    await mergeGuestAccount(guest.id, user.id)
    // A resumed guest draft retains its request namespace after the import.
    const importedInput = {
      ...summary(user),
      requestSubjectKey: guest.subjectKey
    }
    const paid = (await reserveSummary(importedInput)).operation
    expect(paid).toMatchObject({
      subjectKey: guest.subjectKey,
      budgetPeriodId: null
    })
    await startSummaryOperation(paid.id)
    await failSummaryOperation(paid.id, 1_580_000)
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    expect(await reserveSummary(importedInput)).toMatchObject({
      created: false,
      operation: { id: paid.id }
    })
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      remaining: 100,
      generationPaused: true
    })
    const [importedFree] = await getDb()
      .select()
      .from(generationOperations)
      .where(eq(generationOperations.id, free.id))
    expect(importedFree?.budgetPeriodId).toBe(free.budgetPeriodId)
    const periods = await getDb()
      .select()
      .from(usagePeriods)
      .where(inArray(usagePeriods.id, [importedFree!.periodId, paid.periodId]))
    expect(periods).toHaveLength(2)
    expect(
      periods.every((period) => period.subjectKey === user.subjectKey)
    ).toBe(true)
  })

  it('charges paid summaries against authoritative allowance while Free subsidy is exhausted', async () => {
    const user = await account()
    const month = utcUsagePeriod(user.now)
    budgetStarts.push(month.startsAt)
    await getDb()
      .insert(aiBudgetPeriods)
      .values({
        ...month,
        limitMicros: FREE_AI_MONTHLY_BUDGET_MICROS,
        spentMicros: FREE_AI_MONTHLY_BUDGET_MICROS
      })
    const reserved = await reserveSummary(summary(user))
    expect(reserved.operation.budgetPeriodId).toBeNull()
    expect(await getSummaryUsage(user.subjectKey, 5, user.now)).toMatchObject({
      allowance: 100,
      reserved: 1,
      remaining: 99,
      generationPaused: false
    })
    await startSummaryOperation(reserved.operation.id)
    await succeedSummaryOperation(reserved.operation.id, preview, 2000)
    const [budget] = await getDb()
      .select()
      .from(aiBudgetPeriods)
      .where(eq(aiBudgetPeriods.startsAt, month.startsAt))
    expect(budget).toMatchObject({
      reservedMicros: 0,
      spentMicros: FREE_AI_MONTHLY_BUDGET_MICROS
    })
  })

  it('preserves usage across an upgrade and counts paid timestamps on transition to Free', async () => {
    const user = await account()
    const first = await reserveSummary(summary(user))
    await startSummaryOperation(first.operation.id)
    await succeedSummaryOperation(first.operation.id, preview, 1000)
    await getDb()
      .update(billingAccounts)
      .set({ paidPlan: 'pro' })
      .where(eq(billingAccounts.userId, user.id))
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      allowance: 300,
      used: 1,
      remaining: 299
    })
    const second = await reserveSummary(summary(user))
    const later = new Date(user.now.getTime() + 2 * 86400000)
    await getDb()
      .update(billingAccounts)
      .set({ endedAt: new Date(later.getTime() - 1000) })
      .where(eq(billingAccounts.userId, user.id))
    expect(await getSummaryUsage(user.subjectKey, 25, later)).toMatchObject({
      allowance: 25,
      used: 1,
      reserved: 1,
      remaining: 23
    })
    await cancelUndispatchedSummary(second.operation.id)
    expect(await getSummaryUsage(user.subjectKey, 25, later)).toMatchObject({
      used: 1,
      reserved: 0,
      remaining: 24
    })
  })
})

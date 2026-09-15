import { randomUUID } from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '@/lib/db'
import {
  aiBudgetPeriods,
  authUsers,
  generationOperations,
  guestImports,
  usagePeriods
} from '@/lib/db/schema'
import {
  cancelUndispatchedSummary,
  failSummaryOperation,
  getSummaryUsage,
  markSummaryUncertain,
  moveSubjectUsage,
  reconcileSummaryCost,
  reserveSummary,
  startSummaryOperation,
  succeedSummaryOperation
} from '@/lib/usage'
import { SUMMARY_RESERVATION_MICROS, utcUsagePeriod } from '@/lib/usage-policy'

const testUrl = process.env.TEST_DATABASE_URL
const subjects: string[] = []
const budgetStarts: Date[] = []
const accountIds: string[] = []
const testYear = 4000 + Math.floor(Math.random() * 2000)
let testMonth = 0
const preview = { title: 'A durable summary', highlights: ['Saved once'] }

function periodDate() {
  const now = new Date(Date.UTC(testYear, testMonth, 15))
  testMonth += 2
  budgetStarts.push(utcUsagePeriod(now).startsAt)
  return now
}

function subject() {
  const value = `test:${randomUUID()}`
  subjects.push(value)
  return value
}

function request(subjectKey: string, now: Date, allowance = 5) {
  return {
    subjectKey,
    ownerId: null,
    allowance,
    requestKey: randomUUID(),
    inputHash: randomUUID(),
    now
  }
}

async function budgetFor(now: Date) {
  const [budget] = await getDb()
    .select()
    .from(aiBudgetPeriods)
    .where(eq(aiBudgetPeriods.startsAt, utcUsagePeriod(now).startsAt))
  return budget!
}

async function account() {
  const id = randomUUID()
  accountIds.push(id)
  subjects.push(`user:${id}`)
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Usage test',
      email: `${id}@example.invalid`,
      emailVerified: true
    })
  return id
}

describe.skipIf(!testUrl)('PostgreSQL summary usage', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })

  afterAll(async () => {
    if (subjects.length) {
      await getDb()
        .delete(generationOperations)
        .where(inArray(generationOperations.subjectKey, subjects))
      await getDb()
        .delete(usagePeriods)
        .where(inArray(usagePeriods.subjectKey, subjects))
    }
    if (budgetStarts.length) {
      await getDb()
        .delete(aiBudgetPeriods)
        .where(inArray(aiBudgetPeriods.startsAt, budgetStarts))
    }
    if (accountIds.length)
      await getDb().delete(authUsers).where(inArray(authUsers.id, accountIds))
    await closeDatabase()
  })

  it('atomically admits five concurrent guest calls without overspending either ledger', async () => {
    const now = periodDate()
    const key = subject()
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserveSummary(request(key, now)))
    )
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled')
    ).toHaveLength(5)
    expect(await getSummaryUsage(key, 5, now)).toMatchObject({
      used: 0,
      reserved: 5,
      remaining: 0
    })
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 0,
      reservedMicros: 5 * SUMMARY_RESERVATION_MICROS
    })
  })

  it('reserves the last global budget slots across independent subjects and rolls back rejected quota', async () => {
    const now = periodDate()
    await getDb()
      .insert(aiBudgetPeriods)
      .values({
        ...utcUsagePeriod(now),
        limitMicros: 50_000,
        spentMicros: 10_000
      })
    const keys = Array.from({ length: 12 }, () => subject())
    const attempts = await Promise.allSettled(
      keys.map((key) => reserveSummary(request(key, now)))
    )
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled')
    ).toHaveLength(2)
    const usage = await Promise.all(
      keys.map((key) => getSummaryUsage(key, 5, now))
    )
    expect(usage.reduce((sum, item) => sum + item.reserved, 0)).toBe(2)
    expect(usage.every((item) => item.generationPaused)).toBe(true)
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 10_000,
      reservedMicros: 40_000
    })
  })

  it('deduplicates concurrent retries, rejects changed inputs, and grants dispatch to one caller', async () => {
    const now = periodDate()
    const input = request(subject(), now)
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveSummary(input))
    )
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(new Set(results.map((result) => result.operation.id)).size).toBe(1)
    await expect(
      reserveSummary({ ...input, inputHash: 'changed' })
    ).rejects.toMatchObject({ status: 409 })
    const id = results[0]!.operation.id
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => startSummaryOperation(id))
    )
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1)
    const completions = await Promise.all(
      Array.from({ length: 8 }, () =>
        succeedSummaryOperation(id, preview, 1_500)
      )
    )
    expect(
      completions.every(
        (operation) => operation.result?.title === preview.title
      )
    ).toBe(true)
    expect(await getSummaryUsage(input.subjectKey, 5, now)).toMatchObject({
      used: 1,
      reserved: 0
    })
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 1_500,
      reservedMicros: 0
    })
    expect((await reserveSummary(input)).operation.result).toEqual(preview)
    await failSummaryOperation(id, 0)
    expect(await getSummaryUsage(input.subjectKey, 5, now)).toMatchObject({
      used: 1,
      reserved: 0
    })
  })

  it('keeps uncertain liability and reconciles a billed failure once in its original month', async () => {
    const now = periodDate()
    const next = new Date(utcUsagePeriod(now).endsAt)
    budgetStarts.push(next)
    const key = subject()
    const { operation } = await reserveSummary(request(key, now))
    await startSummaryOperation(operation.id)
    await markSummaryUncertain(operation.id, 'provider-request')
    await cancelUndispatchedSummary(operation.id)
    expect(await getSummaryUsage(key, 5, now)).toMatchObject({
      used: 0,
      reserved: 1
    })
    await reserveSummary(request(key, next))
    await failSummaryOperation(operation.id, null)
    expect(await getSummaryUsage(key, 5, now)).toMatchObject({
      used: 0,
      reserved: 0
    })
    expect(await getSummaryUsage(key, 5, next)).toMatchObject({
      used: 0,
      reserved: 1
    })
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 0,
      reservedMicros: SUMMARY_RESERVATION_MICROS
    })
    await Promise.all(
      Array.from({ length: 6 }, () => reconcileSummaryCost(operation.id, 3_500))
    )
    await reconcileSummaryCost(operation.id, 9_999)
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 3_500,
      reservedMicros: 0
    })
    expect(await budgetFor(next)).toMatchObject({
      spentMicros: 0,
      reservedMicros: SUMMARY_RESERVATION_MICROS
    })
  })

  it('releases undispatched work once and never lets it dispatch after cancellation', async () => {
    const now = periodDate()
    const key = subject()
    const { operation } = await reserveSummary(request(key, now))
    await Promise.all(
      Array.from({ length: 4 }, () => cancelUndispatchedSummary(operation.id))
    )
    expect((await startSummaryOperation(operation.id)).claimed).toBe(false)
    expect(await getSummaryUsage(key, 5, now)).toMatchObject({
      used: 0,
      reserved: 0
    })
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 0,
      reservedMicros: 0
    })
  })

  it('transfers over-limit guest usage and old pending operations without a reset or duplicate request identity', async () => {
    const previous = periodDate()
    const now = new Date(utcUsagePeriod(previous).endsAt)
    budgetStarts.push(now)
    const guest = subject()
    const user = subject()
    const old = await reserveSummary(request(guest, previous))
    await startSummaryOperation(old.operation.id)
    const firstInput = request(guest, now)
    const first = await reserveSummary(firstInput)
    await startSummaryOperation(first.operation.id)
    await succeedSummaryOperation(first.operation.id, preview, 1_000)
    const pending = await reserveSummary(request(guest, now))
    await getDb()
      .insert(usagePeriods)
      .values({
        subjectKey: user,
        allowance: 25,
        used: 25,
        ...utcUsagePeriod(now)
      })
    await Promise.all([
      getDb().transaction((tx) => moveSubjectUsage(tx, guest, user, now)),
      succeedSummaryOperation(old.operation.id, preview, 2_000)
    ])
    await getDb().transaction((tx) => moveSubjectUsage(tx, guest, user, now))
    expect(await getSummaryUsage(guest, 5, now)).toMatchObject({
      used: 0,
      reserved: 0
    })
    expect(await getSummaryUsage(user, 25, now)).toMatchObject({
      used: 26,
      reserved: 1,
      remaining: 0
    })
    await expect(reserveSummary(request(user, now, 25))).rejects.toMatchObject({
      status: 429
    })
    const replay = await reserveSummary({
      ...firstInput,
      subjectKey: user,
      requestSubjectKey: guest,
      allowance: 25
    })
    expect(replay.operation.id).toBe(first.operation.id)
    await succeedSummaryOperation(old.operation.id, preview, 2_000)
    await cancelUndispatchedSummary(pending.operation.id)
    expect(await getSummaryUsage(user, 25, previous)).toMatchObject({
      used: 1,
      reserved: 0
    })
    expect(await getSummaryUsage(user, 25, now)).toMatchObject({
      used: 26,
      reserved: 0
    })
    const [saved] = await getDb()
      .select()
      .from(generationOperations)
      .where(eq(generationOperations.id, old.operation.id))
    const [period] = await getDb()
      .select()
      .from(usagePeriods)
      .where(eq(usagePeriods.id, saved!.periodId))
    expect(saved!.subjectKey).toBe(guest)
    expect(period!.subjectKey).toBe(user)
    expect(period!.endsAt).toEqual(utcUsagePeriod(previous).endsAt)
  })

  it('rolls back a guest transfer when its surrounding import transaction fails', async () => {
    const now = periodDate()
    const guest = subject()
    const user = subject()
    const { operation } = await reserveSummary(request(guest, now))
    await expect(
      getDb().transaction(async (tx) => {
        await moveSubjectUsage(tx, guest, user, now)
        throw new Error('import failed')
      })
    ).rejects.toThrow('import failed')
    const [saved] = await getDb()
      .select()
      .from(generationOperations)
      .where(eq(generationOperations.id, operation.id))
    expect(saved!.periodId).toBe(operation.periodId)
    expect(await getSummaryUsage(guest, 5, now)).toMatchObject({ reserved: 1 })
    expect(await getSummaryUsage(user, 25, now)).toMatchObject({
      reserved: 0,
      used: 0
    })
  })

  it('blocks dispatch during account closure and settles dispatched work without restoring deleted content', async () => {
    const now = periodDate()
    const userId = await account()
    const key = `user:${userId}`
    const first = await reserveSummary({
      ...request(key, now, 25),
      ownerId: userId
    })
    const second = await reserveSummary({
      ...request(key, now, 25),
      ownerId: userId
    })
    await startSummaryOperation(first.operation.id)
    await getDb()
      .update(authUsers)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(authUsers.id, userId))
    expect((await startSummaryOperation(second.operation.id)).claimed).toBe(
      false
    )
    const finished = await succeedSummaryOperation(
      first.operation.id,
      preview,
      null
    )
    expect(finished.status).toBe('succeeded')
    expect(finished.result).toBeNull()
    expect(await getSummaryUsage(key, 25, now)).toMatchObject({
      used: 1,
      reserved: 0
    })
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 0,
      reservedMicros: SUMMARY_RESERVATION_MICROS
    })
    await reconcileSummaryCost(first.operation.id, 1_250)
    expect(await budgetFor(now)).toMatchObject({
      spentMicros: 1_250,
      reservedMicros: 0
    })
    await expect(
      reserveSummary({ ...request(key, now, 25), ownerId: userId })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects stale deleted/imported guest subjects before creating any reservation', async () => {
    const now = periodDate()
    const guestId = await account()
    const userId = await account()
    await getDb().insert(guestImports).values({ guestUserId: guestId, userId })
    await expect(
      reserveSummary({ ...request(`user:${guestId}`, now), ownerId: guestId })
    ).rejects.toMatchObject({ status: 409 })
    await getDb().delete(authUsers).where(eq(authUsers.id, guestId))
    await expect(
      reserveSummary({ ...request(`user:${guestId}`, now), ownerId: guestId })
    ).rejects.toMatchObject({ status: 409 })
    const periods = await getDb()
      .select()
      .from(usagePeriods)
      .where(
        and(
          eq(usagePeriods.subjectKey, `user:${guestId}`),
          eq(usagePeriods.startsAt, utcUsagePeriod(now).startsAt)
        )
      )
    expect(periods).toHaveLength(0)
  })
})

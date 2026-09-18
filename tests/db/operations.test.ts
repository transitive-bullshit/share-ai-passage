import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { closeDatabase, getDb } from '../../lib/db'
import {
  aiBudgetPeriods,
  billingAccounts,
  billingEvents,
  generationOperations,
  imageCreditGrants,
  imageOperations,
  usagePeriods
} from '../../lib/db/schema'
import { readOperationsReport } from '../../lib/operations'

const testUrl = process.env.TEST_DATABASE_URL
const subjectKey = `operations-fixture:${randomUUID()}`
// Earlier than other suites' fixtures; no new CLI clock/filter or global test serialization.
const now = new Date('0200-05-15T12:00:00.000Z')
const old = new Date('0200-05-15T11:00:00.000Z')
const boundary = new Date('0200-05-15T11:30:00.000Z')
const previousMonth = new Date('0200-04-15T12:00:00.000Z')
const startsAt = new Date('0200-05-01T00:00:00.000Z')
const endsAt = new Date('0200-06-01T00:00:00.000Z')
const eventIds = Array.from({ length: 4 }, () => randomUUID())
const accountIds = Array.from({ length: 3 }, () => randomUUID())
let periodId: string | undefined
let grantId: string | undefined
let budgetId: string | undefined

const samples = [
  { status: 'running' as const, createdAt: old, actualCostMicros: null },
  { status: 'failed' as const, createdAt: old, actualCostMicros: null },
  { status: 'succeeded' as const, createdAt: old, actualCostMicros: 1_000_001 },
  { status: 'uncertain' as const, createdAt: boundary, actualCostMicros: null },
  {
    status: 'succeeded' as const,
    createdAt: previousMonth,
    actualCostMicros: 1_000_001
  }
]

describe.skipIf(!testUrl)('operations aggregation in PostgreSQL', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
    vi.stubEnv('IMAGE_GENERATION_ENABLED', '1')
    vi.stubEnv('IMAGE_AI_MONTHLY_BUDGET_USD', '5')
  })
  afterAll(async () => {
    await getDb()
      .delete(imageOperations)
      .where(eq(imageOperations.subjectKey, subjectKey))
    await getDb()
      .delete(generationOperations)
      .where(eq(generationOperations.subjectKey, subjectKey))
    if (grantId)
      await getDb()
        .delete(imageCreditGrants)
        .where(eq(imageCreditGrants.id, grantId))
    if (periodId)
      await getDb().delete(usagePeriods).where(eq(usagePeriods.id, periodId))
    if (budgetId)
      await getDb()
        .delete(aiBudgetPeriods)
        .where(eq(aiBudgetPeriods.id, budgetId))
    await getDb()
      .delete(billingEvents)
      .where(inArray(billingEvents.id, eventIds))
    await getDb()
      .delete(billingAccounts)
      .where(inArray(billingAccounts.userId, accountIds))
    vi.unstubAllEnvs()
    await closeDatabase()
  })

  it('finds stale work, failed reconciliation, next-reservation exhaustion and only current-month overruns, without private fields or writes', async () => {
    expect((await readOperationsReport(now)).status).toBe('healthy')
    const [period] = await getDb()
      .insert(usagePeriods)
      .values({ subjectKey, startsAt, endsAt, allowance: 100 })
      .returning()
    periodId = period!.id
    const [grant] = await getDb()
      .insert(imageCreditGrants)
      .values({
        userId: subjectKey,
        grantKey: subjectKey,
        kind: 'included',
        startsAt,
        allowance: 10
      })
      .returning()
    grantId = grant!.id
    const [budget] = await getDb()
      .insert(aiBudgetPeriods)
      .values({
        startsAt,
        endsAt,
        limitMicros: 25_000_000,
        spentMicros: 24_000_000,
        reservedMicros: 980_001
      })
      .returning()
    budgetId = budget!.id
    await getDb()
      .insert(generationOperations)
      .values(
        samples.map((sample) => ({
          ...sample,
          subjectKey,
          requestKey: randomUUID(),
          inputHash: 'private-input',
          periodId: periodId!,
          reservedCostMicros: 1_000_000,
          result: {
            title: 'PRIVATE TRANSCRIPT',
            highlights: ['PRIVATE PROMPT']
          },
          updatedAt: now
        }))
      )
    await getDb()
      .insert(imageOperations)
      .values(
        samples.map((sample) => ({
          ...sample,
          status:
            sample.status === 'running'
              ? ('dispatching' as const)
              : sample.status,
          subjectKey,
          requestKey: randomUUID(),
          inputHash: 'private-input',
          draftRevision: 0,
          grantId: grantId!,
          recipeHash: 'fixture',
          prompt: 'PRIVATE PROMPT',
          model: 'fixture-only',
          configVersion: 'fixture',
          promptVersion: 'fixture',
          config: {},
          reservedCostMicros: 1_000_000,
          clientRequestId: randomUUID(),
          updatedAt: now
        }))
      )
    await getDb()
      .insert(billingEvents)
      .values(
        [
          {
            id: eventIds[0]!,
            receivedAt: now,
            lastError: 'PRIVATE provider details'
          },
          { id: eventIds[1]!, receivedAt: old },
          { id: eventIds[2]!, receivedAt: boundary },
          {
            id: eventIds[3]!,
            receivedAt: old,
            processedAt: now,
            lastError: 'PRIVATE resolved details'
          }
        ].map((value) => ({
          ...value,
          type: 'invoice.paid',
          livemode: false,
          stripeCreatedAt: old,
          customerId: 'PRIVATE customer'
        }))
      )
    await getDb()
      .insert(billingAccounts)
      .values([
        { userId: accountIds[0]!, closingAt: old },
        { userId: accountIds[1]!, closingAt: boundary },
        { userId: accountIds[2]!, closingAt: old, cancellationCompletedAt: now }
      ])
    const result = await readOperationsReport(now)
    expect(result.summary).toEqual({
      staleUnresolved: 1,
      staleUnknownCost: 1,
      currentMonthCostOverruns: 1
    })
    expect(result.billing).toEqual({
      failedEvents: 1,
      overdueEvents: 1,
      overdueCancellations: 1
    })
    expect(result.budgets.free).toMatchObject({
      liabilityMicros: 24_980_001,
      exhausted: true
    })
    expect(result.status).toBe('action_required')
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|private-input|operations-fixture|customer|@/
    )
    const [unchanged] = await getDb()
      .select()
      .from(aiBudgetPeriods)
      .where(eq(aiBudgetPeriods.id, budgetId!))
    expect(unchanged).toEqual(budget)
    await getDb()
      .update(aiBudgetPeriods)
      .set({ reservedMicros: 980_000 })
      .where(eq(aiBudgetPeriods.id, budgetId!))
    vi.stubEnv('IMAGE_AI_MONTHLY_BUDGET_USD', '5.000001')
    const exactHeadroom = await readOperationsReport(now)
    expect(exactHeadroom.budgets.free.exhausted).toBe(false)
    vi.stubEnv('IMAGE_AI_MONTHLY_BUDGET_USD', '5')
    vi.stubEnv('IMAGE_GENERATION_ENABLED', '0')
    // Definitive reconciliation removes stale signals; known old overruns age out naturally.
    await getDb()
      .update(generationOperations)
      .set({ status: 'failed', actualCostMicros: 1_000_001 })
      .where(eq(generationOperations.subjectKey, subjectKey))
    await getDb()
      .update(imageOperations)
      .set({ status: 'failed', actualCostMicros: 1_000_001 })
      .where(eq(imageOperations.subjectKey, subjectKey))
    await getDb()
      .update(billingEvents)
      .set({ processedAt: now })
      .where(inArray(billingEvents.id, eventIds))
    await getDb()
      .update(billingAccounts)
      .set({ cancellationCompletedAt: now })
      .where(inArray(billingAccounts.userId, accountIds))
    vi.stubEnv('IMAGE_GENERATION_ENABLED', '1')
    const recovered = await readOperationsReport(
      new Date('0200-06-01T00:00:00.000Z')
    )
    expect(recovered.status).toBe('healthy')
    expect(recovered.issues).toEqual([])
  })
})

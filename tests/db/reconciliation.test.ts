import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '../../lib/db'
import { generationOperations, usagePeriods } from '../../lib/db/schema'
import { runReconciliation } from '../../scripts/reconcile-summary'

const testUrl = process.env.TEST_DATABASE_URL
let operationId: string | undefined
let periodId: string | undefined

describe.skipIf(!testUrl)('paid summary reconciliation reporting', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl!
    const subjectKey = `test:${randomUUID()}`
    const [period] = await getDb()
      .insert(usagePeriods)
      .values({
        subjectKey,
        startsAt: new Date('2020-01-01T00:00:00Z'),
        endsAt: new Date('2020-02-01T00:00:00Z'),
        allowance: 100,
        reserved: 1
      })
      .returning()
    periodId = period!.id
    const [operation] = await getDb()
      .insert(generationOperations)
      .values({
        subjectKey,
        requestKey: randomUUID(),
        inputHash: randomUUID(),
        periodId,
        budgetPeriodId: null,
        status: 'uncertain',
        reservedCostMicros: 20_000,
        result: { title: 'PRIVATE STORED PREVIEW', highlights: [] },
        createdAt: new Date('2020-01-02T00:00:00Z'),
        updatedAt: new Date('2020-01-02T00:00:00Z')
      })
      .returning()
    operationId = operation!.id
  })
  afterAll(async () => {
    if (operationId)
      await getDb()
        .delete(generationOperations)
        .where(eq(generationOperations.id, operationId))
    if (periodId)
      await getDb().delete(usagePeriods).where(eq(usagePeriods.id, periodId))
    await closeDatabase()
  })
  it('includes operations without a Free budget in status and stale results', async () => {
    const status = JSON.parse(await runReconciliation(['status', operationId!]))
    expect(status).toHaveLength(1)
    expect(status[0]).toMatchObject({
      id: operationId,
      status: 'uncertain',
      periodAllowance: 100,
      budgetSpentMicros: null,
      budgetReservedMicros: null,
      budgetLimitMicros: null,
      outstandingCostMicros: 20_000
    })
    expect(JSON.stringify(status)).not.toContain('PRIVATE')
    const stale = JSON.parse(
      await runReconciliation([
        'list-stale',
        '--older-than-minutes',
        '1',
        '--limit',
        '200'
      ])
    )
    expect(stale).toContainEqual(
      expect.objectContaining({ id: operationId, budgetLimitMicros: null })
    )
  })
})

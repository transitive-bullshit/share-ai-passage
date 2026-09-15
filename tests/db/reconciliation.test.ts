import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '../../lib/db'
import {
  generationOperations,
  imageCreditGrants,
  imageOperations,
  usagePeriods
} from '../../lib/db/schema'
import { markImageUncertain } from '../../lib/image-usage'
import { runImageReconciliation } from '../../scripts/reconcile-image'
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

describe.skipIf(!testUrl)('image reconciliation reporting', () => {
  const imageIds: string[] = Array.from({ length: 4 }, () => randomUUID())
  let grantId: string | undefined
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl!
    const subjectKey = `test:${randomUUID()}`
    const [grant] = await getDb()
      .insert(imageCreditGrants)
      .values({
        userId: subjectKey,
        grantKey: randomUUID(),
        kind: 'included',
        startsAt: new Date('2020-01-01T00:00:00Z'),
        allowance: 10,
        reserved: 2
      })
      .returning()
    grantId = grant!.id
    const samples = [
      {
        status: 'uncertain' as const,
        createdAt: new Date('2020-01-02T00:00:00Z'),
        actualCostMicros: null
      },
      {
        status: 'failed' as const,
        createdAt: new Date('2020-01-03T00:00:00Z'),
        actualCostMicros: null
      },
      {
        status: 'uncertain' as const,
        createdAt: new Date(),
        actualCostMicros: null
      },
      {
        status: 'succeeded' as const,
        createdAt: new Date('2020-01-01T00:00:00Z'),
        actualCostMicros: 1000
      }
    ]
    await getDb()
      .insert(imageOperations)
      .values(
        samples.map((sample, index) => ({
          ...sample,
          id: imageIds[index]!,
          subjectKey,
          requestKey: imageIds[index]!,
          clientRequestId: imageIds[index]!,
          inputHash: 'fixture',
          draftRevision: 0,
          grantId: grantId!,
          recipeHash: 'fixture',
          prompt: 'PRIVATE IMAGE INPUT',
          model: 'fixture',
          configVersion: 'fixture',
          promptVersion: 'fixture',
          config: {},
          reservedCostMicros: 1_000_000,
          updatedAt: sample.createdAt
        }))
      )
  })
  afterAll(async () => {
    await getDb()
      .delete(imageOperations)
      .where(inArray(imageOperations.id, imageIds))
    if (grantId)
      await getDb()
        .delete(imageCreditGrants)
        .where(eq(imageCreditGrants.id, grantId))
    await closeDatabase()
  })
  it('keeps polled uncertain jobs visible and oldest first while excluding recent or fully settled jobs', async () => {
    const polled = await markImageUncertain(imageIds[0]!)
    await markImageUncertain(imageIds[0]!)
    expect(polled.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(polled.createdAt).toEqual(new Date('2020-01-02T00:00:00Z'))
    const output = await runImageReconciliation([
      'list-stale',
      '--older-than-minutes',
      '30',
      '--limit',
      '200'
    ])
    const rows = JSON.parse(output) as { id: string; inactiveMinutes: number }[]
    const ownRows = rows.filter((row) => imageIds.includes(row.id))
    expect(ownRows.map((row) => row.id)).toEqual(imageIds.slice(0, 2))
    expect(ownRows[0]?.inactiveMinutes).toBe(0)
    expect(output).not.toContain('PRIVATE')
    const [unchanged] = await getDb()
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, imageIds[0]!))
    expect(unchanged).toMatchObject({
      status: 'uncertain',
      actualCostMicros: null
    })
    const [grant] = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.id, grantId!))
    expect(grant).toMatchObject({ used: 0, reserved: 2, allowance: 10 })
  })
})

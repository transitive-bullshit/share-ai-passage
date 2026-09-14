import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '@/lib/db'
import {
  aiBudgetPeriods,
  assets,
  authUsers,
  billingAccounts,
  generationOperations,
  imageCreditGrants,
  imageOperations,
  savedDrafts,
  usagePeriods
} from '@/lib/db/schema'
import {
  cancelImageOperation,
  claimImageOperation,
  failImageOperation,
  getImageUsage,
  markImageUncertain,
  reserveImage,
  succeedImageOperation,
  type ReserveImageInput
} from '@/lib/image-usage'
import { defaultTemplateRecipe } from '@/lib/paid-design'
import {
  cancelUndispatchedSummary,
  getSummaryUsage,
  reserveSummary,
  startSummaryOperation,
  succeedSummaryOperation
} from '@/lib/usage'
import {
  FREE_AI_MONTHLY_BUDGET_MICROS,
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
async function draft(userId: string) {
  const [saved] = await getDb()
    .insert(savedDrafts)
    .values({
      ownerId: userId,
      namespace: userId,
      requestKey: randomUUID(),
      sourceUrl: 'https://claude.ai/share/fixture',
      status: 'ready',
      ...preview
    })
    .returning()
  return saved!
}
async function image(
  user: Awaited<ReturnType<typeof account>>
): Promise<ReserveImageInput> {
  const saved = await draft(user.id)
  return {
    userId: user.id,
    draftId: saved.id,
    draftRevision: 0,
    requestKey: randomUUID(),
    inputHash: randomUUID(),
    recipe: { ...defaultTemplateRecipe(), background: { mode: 'generated' } },
    recipeHash: 'a'.repeat(64),
    prompt: 'Authored test image.',
    referenceAssetId: null,
    referenceHash: null,
    model: 'fixture-only',
    configVersion: 'test',
    promptVersion: 'test',
    config: {},
    reservedCostMicros: 100_000,
    monthlyBudgetMicros: 1_000_000,
    maxConcurrent: 32,
    now: user.now
  }
}
async function durableImage(operationId: string, userId: string) {
  await getDb()
    .insert(assets)
    .values({
      id: operationId,
      ownerId: userId,
      purpose: 'generated',
      visibility: 'private',
      status: 'ready',
      objectKey: `fixture/${operationId}`,
      byteSize: 100,
      sha256: 'b'.repeat(64)
    })
    .onConflictDoUpdate({
      target: assets.id,
      set: { status: 'ready', byteSize: 100, sha256: 'b'.repeat(64) }
    })
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

  it('reserves a single remaining image atomically and dispatches each accepted operation once', async () => {
    const user = await account()
    const input = await image(user)
    await getImageUsage(user.id, user.now)
    await getDb()
      .update(imageCreditGrants)
      .set({ used: 9 })
      .where(eq(imageCreditGrants.userId, user.id))
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reserveImage({ ...input, requestKey: randomUUID() })
      )
    )
    const accepted = results.filter((result) => result.status === 'fulfilled')
    expect(accepted).toHaveLength(1)
    const operation = accepted[0]!.value.operation
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 9,
      reserved: 1,
      remaining: 0
    })
    expect(
      (
        await Promise.all(
          Array.from({ length: 5 }, () => claimImageOperation(operation.id))
        )
      ).filter((result) => result.claimed)
    ).toHaveLength(1)
    await durableImage(operation.id, user.id)
    await Promise.all(
      Array.from({ length: 4 }, () =>
        succeedImageOperation(operation.id, {
          resultAssetId: operation.id,
          actualCostMicros: 12000
        })
      )
    )
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 10,
      reserved: 0,
      remaining: 0
    })
  })

  it('deduplicates image requests, keeps uncertain credits reserved, and refunds only confirmed failure once', async () => {
    const user = await account()
    const input = await image(user)
    const results = await Promise.all(
      Array.from({ length: 4 }, () => reserveImage(input))
    )
    expect(results.filter((result) => result.created)).toHaveLength(1)
    const operation = results[0]!.operation
    await expect(
      reserveImage({ ...input, inputHash: 'changed' })
    ).rejects.toMatchObject({ status: 409 })
    await claimImageOperation(operation.id)
    await markImageUncertain(operation.id)
    expect((await claimImageOperation(operation.id)).claimed).toBe(false)
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      reserved: 1,
      remaining: 9
    })
    await Promise.all(
      Array.from({ length: 3 }, () =>
        failImageOperation(operation.id, {
          actualCostMicros: 15000,
          errorCode: 'INVALID_IMAGE'
        })
      )
    )
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 10
    })
    const [saved] = await getDb()
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, operation.id))
    expect(saved?.actualCostMicros).toBe(15000)
  })

  it('reuses the accepted revision-zero image under concurrent initial recovery despite changed configuration', async () => {
    const user = await account()
    const input = await image(user)
    const accepted = (await reserveImage(input)).operation
    const recoveries = await Promise.all(
      Array.from({ length: 4 }, () =>
        reserveImage({
          ...input,
          requestKey: input.draftId,
          inputHash: 'changed-current-input-hash',
          model: 'changed-current-model',
          configVersion: 'changed-current-config',
          config: { changed: true }
        })
      )
    )
    expect(recoveries.map((result) => result.operation.id)).toEqual(
      Array(4).fill(accepted.id)
    )
    expect(recoveries.every((result) => !result.created)).toBe(true)
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 0,
      reserved: 1,
      remaining: 9
    })
    const operations = await getDb()
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.draftId, input.draftId))
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      inputHash: input.inputHash,
      model: input.model,
      config: input.config
    })
  })

  it('initial recovery under the reservation lock prefers the newest explicit operation over its failed original key', async () => {
    const user = await account()
    const input = await image(user)
    const initial = (
      await reserveImage({ ...input, requestKey: input.draftId })
    ).operation
    await claimImageOperation(initial.id)
    await failImageOperation(initial.id, {
      actualCostMicros: 0,
      errorCode: 'FIXTURE_CONFIRMED_FAILURE'
    })
    const reroll = (
      await reserveImage({
        ...input,
        requestKey: randomUUID(),
        inputHash: 'explicit-reroll-input',
        now: new Date(user.now.getTime() + 1000)
      })
    ).operation
    const before = await getImageUsage(
      user.id,
      new Date(user.now.getTime() + 2000)
    )
    const recovered = await reserveImage({
      ...input,
      requestKey: input.draftId,
      inputHash: 'changed-initial-config',
      config: { changed: true },
      now: new Date(user.now.getTime() + 2000)
    })
    expect(recovered).toMatchObject({
      created: false,
      operation: {
        id: reroll.id,
        status: 'reserved',
        inputHash: 'explicit-reroll-input'
      }
    })
    expect(
      await getImageUsage(user.id, new Date(user.now.getTime() + 2000))
    ).toEqual(before)
    expect(before).toMatchObject({ used: 0, reserved: 1, remaining: 9 })
    expect(
      await getDb()
        .select()
        .from(imageOperations)
        .where(eq(imageOperations.draftId, input.draftId))
    ).toHaveLength(2)
  })

  it('replenishes annual included credits monthly without moving a prior reservation', async () => {
    const user = await account()
    const input = await image(user)
    const operation = (await reserveImage(input)).operation
    const next = new Date(
      Date.UTC(user.now.getUTCFullYear(), user.now.getUTCMonth() + 1, 15)
    )
    expect(await getImageUsage(user.id, next)).toMatchObject({
      allowance: 10,
      remaining: 10,
      reserved: 0
    })
    await cancelImageOperation(operation.id)
    expect(await getImageUsage(user.id, next)).toMatchObject({ remaining: 10 })
    const grants = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.userId, user.id))
    expect(grants).toHaveLength(2)
    expect(grants.every((grant) => grant.reserved === 0)).toBe(true)
  })

  it('recovers refunded spent-pack debt once across periods and restores recovered units if the dispute is won', async () => {
    const user = await account()
    await getDb().insert(imageCreditGrants).values({
      userId: user.id,
      grantKey: randomUUID(),
      kind: 'pack',
      startsAt: user.now,
      allowance: 50,
      used: 15,
      revoked: 50,
      disputed: true
    })
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      included: 0,
      purchased: 0,
      debt: 5,
      remaining: 0
    })
    expect(await getImageUsage(user.id, user.now)).toMatchObject({ debt: 5 })
    const next = new Date(
      Date.UTC(user.now.getUTCFullYear(), user.now.getUTCMonth() + 1, 15)
    )
    expect(await getImageUsage(user.id, next)).toMatchObject({
      included: 5,
      debt: 0,
      remaining: 5
    })
    expect(await getImageUsage(user.id, next)).toMatchObject({
      included: 5,
      debt: 0,
      remaining: 5
    })
    await getDb()
      .update(imageCreditGrants)
      .set({ disputed: false, revoked: 0 })
      .where(
        and(
          eq(imageCreditGrants.userId, user.id),
          eq(imageCreditGrants.kind, 'pack')
        )
      )
    expect(await getImageUsage(user.id, next)).toMatchObject({
      included: 5,
      purchased: 50,
      remaining: 55
    })
  })

  it('uses included credits first and preserves purchased credits while access has ended', async () => {
    const user = await account()
    const input = await image(user)
    await getDb().insert(imageCreditGrants).values({
      userId: user.id,
      grantKey: randomUUID(),
      kind: 'pack',
      startsAt: user.now,
      allowance: 50
    })
    const operation = (await reserveImage(input)).operation
    const [grant] = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.id, operation.grantId))
    expect(grant?.kind).toBe('included')
    await getDb()
      .update(billingAccounts)
      .set({ paidThrough: user.now })
      .where(eq(billingAccounts.userId, user.id))
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      active: false,
      purchased: 50,
      remaining: 0
    })
    await expect(
      reserveImage({ ...input, requestKey: randomUUID() })
    ).rejects.toMatchObject({ details: { code: 'PAID_ACCOUNT_REQUIRED' } })
    await cancelImageOperation(operation.id)
  })

  it('cannot save a success without durable artwork and never restores a deleted draft', async () => {
    const user = await account()
    const input = await image(user)
    const operation = (await reserveImage(input)).operation
    await claimImageOperation(operation.id)
    await expect(
      succeedImageOperation(operation.id, { actualCostMicros: 1000 })
    ).rejects.toMatchObject({ status: 409 })
    await getDb().delete(savedDrafts).where(eq(savedDrafts.id, input.draftId))
    const saved = await succeedImageOperation(operation.id, {
      actualCostMicros: 1000
    })
    expect(saved).toMatchObject({
      status: 'succeeded',
      resultAssetId: null,
      recipe: null,
      prompt: null
    })
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 1,
      reserved: 0
    })
  })
})

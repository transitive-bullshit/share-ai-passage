import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
  savedDrafts,
  usagePeriods
} from '@/lib/db/schema'
import {
  cancelImageOperation,
  claimImageOperation,
  failImageOperation,
  getImageUsage,
  markImageUncertain,
  reconcileImageCost,
  recordImageResponse,
  reserveImage,
  succeedImageOperation,
  type ReserveImageInput
} from '@/lib/image-usage'
import { defaultTemplateRecipe } from '@/lib/paid-design'
import {
  cancelUndispatchedSummary,
  failSummaryOperation,
  getSummaryUsage,
  reconcileSummaryCost,
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

  it('serializes summary and image spending together without debiting the denied request', async () => {
    const user = await account()
    const seed = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(seed.id)
    await succeedSummaryOperation(seed.id, preview, 580_000)
    const summaryInput = summary(user)
    const imageInput = {
      ...(await image(user)),
      reservedCostMicros: 1_000_000,
      monthlyBudgetMicros: 10_000_000
    }
    // Each request fits the remaining $1.007 alone; together they cost $1.02.
    const [textResult, imageResult] = await Promise.allSettled([
      reserveSummary(summaryInput),
      reserveImage(imageInput)
    ])
    const results = [textResult, imageResult]
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1)
    expect(
      results.find((result) => result.status === 'rejected')
    ).toMatchObject({
      reason: { status: 429, details: { code: 'AI_SPEND_LIMIT' } }
    })
    const textUsage = await getSummaryUsage(user.subjectKey, 25, user.now)
    const imageUsage = await getImageUsage(user.id, user.now)
    expect(textUsage.used).toBe(1)
    expect(imageUsage.used).toBe(0)
    expect(textUsage.reserved + imageUsage.reserved).toBe(1)
    expect(textUsage.remaining + imageUsage.remaining).toBe(108)
    const summaries = await getDb()
      .select()
      .from(generationOperations)
      .where(eq(generationOperations.ownerId, user.id))
    const images = await getDb()
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.ownerId, user.id))
    expect(summaries.length + images.length).toBe(2)
    const replayed = await Promise.allSettled([
      reserveSummary(summaryInput),
      reserveImage(imageInput)
    ])
    expect(replayed.map((result) => result.status)).toEqual(
      results.map((result) => result.status)
    )
    expect(
      replayed.find((result) => result.status === 'rejected')
    ).toMatchObject({
      reason: { details: { code: 'AI_SPEND_LIMIT' } }
    })
    expect(
      replayed
        .filter((result) => result.status === 'fulfilled')
        .map((result) => ({
          created: result.value.created,
          id: result.value.operation.id
        }))
    ).toEqual(
      results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => ({
          created: false,
          id: result.value.operation.id
        }))
    )
    if (textResult.status === 'fulfilled')
      await cancelUndispatchedSummary(textResult.value.operation.id)
    if (imageResult.status === 'fulfilled')
      await cancelImageOperation(imageResult.value.operation.id)
  })

  it('retains billed failures and terminal unknown liabilities until authoritative reconciliation', async () => {
    const user = await account()
    const billed = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(billed.id)
    await failSummaryOperation(billed.id, 1_480_000)
    const imageInput = {
      ...(await image(user)),
      monthlyBudgetMicros: 10_000_000
    }
    const unknownImage = (await reserveImage(imageInput)).operation
    await claimImageOperation(unknownImage.id)
    await failImageOperation(unknownImage.id, { actualCostMicros: null })
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 10
    })
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 100,
      generationPaused: true,
      generationPauseCode: 'AI_SPEND_LIMIT'
    })
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    expect(await reserveImage(imageInput)).toMatchObject({
      created: false,
      operation: { id: unknownImage.id, status: 'failed' }
    })
    await reconcileImageCost(unknownImage.id, 0)
    const unknownSummary = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(unknownSummary.id)
    await failSummaryOperation(unknownSummary.id, null)
    // Its restored customer unit does not release the still-unknown $0.02 cost.
    await expect(
      reserveImage({ ...imageInput, requestKey: randomUUID() })
    ).rejects.toMatchObject({ details: { code: 'AI_SPEND_LIMIT' } })
    await reconcileSummaryCost(unknownSummary.id, 0)
    expect(await reconcileSummaryCost(unknownSummary.id, 2000)).toMatchObject({
      actualCostMicros: 0
    })
    const next = (
      await reserveImage({ ...imageInput, requestKey: randomUUID() })
    ).operation
    await cancelImageOperation(next.id)
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 100,
      generationPaused: false
    })
  })

  it('preserves metered response charges through replay and stale terminal settlement', async () => {
    const user = await account()
    const input = { ...(await image(user)), monthlyBudgetMicros: 10_000_000 }
    const operation = (await reserveImage(input)).operation
    await claimImageOperation(operation.id)
    const metering = {
      providerRequestId: 'fixture-response',
      usage: { total_tokens: 42 },
      actualCostMicros: 1_580_000
    }
    expect(await recordImageResponse(operation.id, metering)).toMatchObject(
      metering
    )
    expect(
      await recordImageResponse(operation.id, {
        providerRequestId: 'stale-response',
        usage: null,
        actualCostMicros: 0
      })
    ).toMatchObject(metering)
    expect(
      await failImageOperation(operation.id, { actualCostMicros: null })
    ).toMatchObject({
      status: 'failed',
      actualCostMicros: 1_580_000,
      usage: metering.usage
    })
    expect(await reconcileImageCost(operation.id, 0)).toMatchObject({
      actualCostMicros: 1_580_000
    })
    expect(
      await recordImageResponse(operation.id, {
        providerRequestId: null,
        usage: null,
        actualCostMicros: null
      })
    ).toMatchObject({ actualCostMicros: 1_580_000 })
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    expect(await reserveImage(input)).toMatchObject({
      created: false,
      operation: { id: operation.id, actualCostMicros: 1_580_000 }
    })
    expect(await getImageUsage(user.id, user.now)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 10
    })
  })

  it.each(['settlement', 'response'] as const)(
    'records late %s metering after unknown-cost recovery without settling quota twice',
    async (arrival) => {
      const user = await account()
      const input = {
        ...(await image(user)),
        reservedCostMicros: 1_000_000,
        monthlyBudgetMicros: 10_000_000
      }
      const operation = (await reserveImage(input)).operation
      await claimImageOperation(operation.id)
      await durableImage(operation.id, user.id)
      // Recovery finds the durable image before the worker's metering commits.
      const recovered = await succeedImageOperation(operation.id, {
        resultAssetId: operation.id,
        actualCostMicros: null
      })
      expect(recovered).toMatchObject({
        status: 'succeeded',
        resultAssetId: operation.id,
        actualCostMicros: null
      })
      const metering = {
        providerRequestId: 'late-fixture-response',
        usage: { total_tokens: 42 },
        actualCostMicros: 1_580_000
      }
      const saved =
        arrival === 'settlement'
          ? await succeedImageOperation(operation.id, metering)
          : await recordImageResponse(operation.id, metering)
      expect(saved).toMatchObject({
        ...metering,
        status: recovered.status,
        resultAssetId: recovered.resultAssetId,
        completedAt: recovered.completedAt
      })
      const replay = {
        providerRequestId: 'stale-fixture-response',
        usage: { total_tokens: 1 },
        actualCostMicros: 0
      }
      expect(await succeedImageOperation(operation.id, replay)).toEqual(saved)
      expect(await recordImageResponse(operation.id, replay)).toEqual(saved)
      expect(await getImageUsage(user.id, user.now)).toMatchObject({
        used: 1,
        reserved: 0,
        remaining: 9
      })
      await expect(reserveSummary(summary(user))).rejects.toMatchObject({
        details: { code: 'AI_SPEND_LIMIT' }
      })
    }
  )

  it('changes the spend ceiling with paid cadence and upgrades without resetting window costs', async () => {
    const user = await account()
    const first = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(first.id)
    await failSummaryOperation(first.id, 1_580_000)
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    await getDb()
      .update(billingAccounts)
      .set({ billingInterval: 'month' })
      .where(eq(billingAccounts.userId, user.id))
    const monthly = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(monthly.id)
    await failSummaryOperation(monthly.id, 260_000)
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    await getDb()
      .update(billingAccounts)
      .set({ paidPlan: 'pro', billingInterval: 'year' })
      .where(eq(billingAccounts.userId, user.id))
    const upgraded = (
      await reserveImage({
        ...(await image(user)),
        reservedCostMicros: 1_000_000,
        monthlyBudgetMicros: 10_000_000
      })
    ).operation
    await claimImageOperation(upgraded.id)
    await failImageOperation(upgraded.id, { actualCostMicros: 2_400_000 })
    // The original $1.840 plus the upgrade's $2.400 still share this window.
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    expect(await getSummaryUsage(user.subjectKey, 25, user.now)).toMatchObject({
      allowance: 300,
      used: 0,
      reserved: 0,
      remaining: 300,
      generationPaused: true
    })
  })

  it('settles old unknown costs in their accepted period without consuming the next annual refill', async () => {
    const user = await account()
    const unknownSummary = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(unknownSummary.id)
    await failSummaryOperation(unknownSummary.id, null)
    const input = {
      ...(await image(user)),
      reservedCostMicros: 1_000_000,
      monthlyBudgetMicros: 10_000_000
    }
    const unknownImage = (await reserveImage(input)).operation
    await claimImageOperation(unknownImage.id)
    await failImageOperation(unknownImage.id, { actualCostMicros: null })
    const billed = (await reserveSummary(summary(user))).operation
    await startSummaryOperation(billed.id)
    await failSummaryOperation(billed.id, 560_000)
    await expect(reserveSummary(summary(user))).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    const next = new Date(
      Date.UTC(user.now.getUTCFullYear(), user.now.getUTCMonth() + 1, 15)
    )
    const newSummary = (await reserveSummary(summary(user, next))).operation
    await reconcileSummaryCost(unknownSummary.id, 40_000)
    await reconcileImageCost(unknownImage.id, 2_000_000)
    const newImage = (
      await reserveImage({ ...input, now: next, requestKey: randomUUID() })
    ).operation
    expect(newSummary.periodId).not.toBe(unknownSummary.periodId)
    expect(newImage.grantId).not.toBe(unknownImage.grantId)
    expect(await getSummaryUsage(user.subjectKey, 25, next)).toMatchObject({
      used: 0,
      reserved: 1,
      remaining: 99,
      generationPaused: false
    })
    expect(await getImageUsage(user.id, next)).toMatchObject({
      used: 0,
      reserved: 1,
      remaining: 9
    })
    await cancelUndispatchedSummary(newSummary.id)
    await cancelImageOperation(newImage.id)
  })

  it('pools purchased funding across periods and later packs while retaining refund debt, costs and credit order', async () => {
    const user = await account()
    await getImageUsage(user.id, user.now)
    await getDb()
      .update(imageCreditGrants)
      .set({ used: 10 })
      .where(eq(imageCreditGrants.userId, user.id))
    const [older] = await getDb()
      .insert(imageCreditGrants)
      .values({
        userId: user.id,
        grantKey: randomUUID(),
        kind: 'pack',
        startsAt: user.now,
        allowance: 50,
        paidCents: 1000
      })
      .returning()
    const input = {
      ...(await image(user)),
      reservedCostMicros: 1_000_000,
      monthlyBudgetMicros: 10_000_000
    }
    const first = (await reserveImage(input)).operation
    expect(first.grantId).toBe(older!.id)
    await claimImageOperation(first.id)
    await durableImage(first.id, user.id)
    await succeedImageOperation(first.id, {
      resultAssetId: first.id,
      actualCostMicros: 1_220_000
    })
    const next = new Date(
      Date.UTC(user.now.getUTCFullYear(), user.now.getUTCMonth() + 1, 15)
    )
    await getImageUsage(user.id, next)
    await getDb()
      .update(imageCreditGrants)
      .set({ used: 10 })
      .where(
        and(
          eq(imageCreditGrants.userId, user.id),
          eq(imageCreditGrants.kind, 'included')
        )
      )
    const retry = { ...input, now: next, requestKey: randomUUID() }
    await expect(reserveImage(retry)).rejects.toMatchObject({
      details: { code: 'AI_SPEND_LIMIT' }
    })
    expect(await getImageUsage(user.id, next)).toMatchObject({
      purchased: 49,
      reserved: 0
    })
    // Seed prior customer consumption to exercise refund debt without 29 image runs.
    await getDb()
      .update(imageCreditGrants)
      .set({ used: 30, refundedCents: 500, revoked: 25 })
      .where(eq(imageCreditGrants.id, older!.id))
    expect(await getImageUsage(user.id, next)).toMatchObject({
      debt: 5,
      remaining: 0
    })
    const [newer] = await getDb()
      .insert(imageCreditGrants)
      .values({
        userId: user.id,
        grantKey: randomUUID(),
        kind: 'pack',
        startsAt: next,
        allowance: 50,
        paidCents: 1000
      })
      .returning()
    const second = (await reserveImage(retry)).operation
    expect(second.grantId).toBe(newer!.id)
    expect(await getImageUsage(user.id, next)).toMatchObject({
      debt: 0,
      purchased: 44,
      reserved: 1
    })
    await getDb()
      .update(imageCreditGrants)
      .set({ disputed: true, revoked: 50 })
      .where(eq(imageCreditGrants.id, older!.id))
    expect(await getImageUsage(user.id, next)).toMatchObject({
      debt: 0,
      purchased: 19,
      reserved: 1
    })
    await expect(
      reserveImage({ ...retry, requestKey: randomUUID() })
    ).rejects.toMatchObject({ details: { code: 'AI_SPEND_LIMIT' } })
    await getDb()
      .update(imageCreditGrants)
      .set({ disputed: false, revoked: 25 })
      .where(eq(imageCreditGrants.id, older!.id))
    // Winning restores only unrefunded funding; the same historical cost remains.
    const restored = (
      await reserveImage({ ...retry, requestKey: randomUUID() })
    ).operation
    expect(restored.grantId).toBe(older!.id)
    await cancelImageOperation(second.id)
    await cancelImageOperation(restored.id)
    expect(await getImageUsage(user.id, next)).toMatchObject({
      debt: 0,
      purchased: 45,
      reserved: 0
    })
    const savedGrants = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(inArray(imageCreditGrants.id, [older!.id, newer!.id]))
    expect(savedGrants.find((grant) => grant.id === older!.id)).toMatchObject({
      used: 30,
      debtRecovered: 30,
      refundedCents: 500,
      revoked: 25
    })
    expect(savedGrants.find((grant) => grant.id === newer!.id)).toMatchObject({
      used: 0,
      debtApplied: 30
    })
    expect(await reconcileImageCost(first.id, 0)).toMatchObject({
      actualCostMicros: 1_220_000
    })
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

import { randomUUID } from 'node:crypto'

import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'

import { readEntitlements } from './billing'
import type { BillingEntitlements } from './billing-policy'
import { getDb, type Transaction } from './db'
import {
  assets,
  authUsers,
  imageCreditGrants,
  imageOperations,
  savedDrafts
} from './db/schema'
import { AppError } from './errors'
import type { TemplateRecipe } from './paid-design'
import { lockUsageSubjects } from './usage'
import { utcUsagePeriod, validateCostMicros } from './usage-policy'

export type ImageOperation = typeof imageOperations.$inferSelect
export type ImageGrant = typeof imageCreditGrants.$inferSelect
const outstanding = ['reserved', 'dispatching', 'running', 'uncertain'] as const
const terminal = ['succeeded', 'failed', 'cancelled'] as const

export function imageGrantBalance(
  grant: Pick<
    ImageGrant,
    | 'allowance'
    | 'used'
    | 'reserved'
    | 'revoked'
    | 'debtApplied'
    | 'debtRecovered'
  >
) {
  return (
    grant.allowance +
    grant.debtRecovered -
    grant.used -
    grant.reserved -
    grant.revoked -
    grant.debtApplied
  )
}

async function ensureIncludedGrant(
  tx: Transaction,
  userId: string,
  entitlement: BillingEntitlements
) {
  if (!entitlement.paidActions) return
  const { startsAt, endsAt } = entitlement.allowanceWindow
  await tx
    .insert(imageCreditGrants)
    .values({
      userId,
      grantKey: `included:${userId}:${startsAt.toISOString()}`,
      kind: 'included',
      startsAt,
      expiresAt: endsAt,
      allowance: entitlement.imageLimit
    })
    .onConflictDoUpdate({
      target: imageCreditGrants.grantKey,
      // A plan change alters the limit, never consumed/reserved counters.
      set: { allowance: entitlement.imageLimit, updatedAt: new Date() }
    })
}

function usable(grant: ImageGrant, now: Date) {
  return grant.startsAt <= now && (!grant.expiresAt || grant.expiresAt > now)
}

function grantOrder(a: ImageGrant, b: ImageGrant) {
  return (
    (a.kind === 'included' ? 0 : 1) - (b.kind === 'included' ? 0 : 1) ||
    a.startsAt.getTime() - b.startsAt.getTime() ||
    a.id.localeCompare(b.id)
  )
}

/** Refund debt is paid once from later credits. The paired counters preserve
 * total units and restore recovered units to the pack if a dispute is reversed. */
async function settleCreditDebt(tx: Transaction, userId: string, now: Date) {
  const grants = await tx
    .select()
    .from(imageCreditGrants)
    .where(eq(imageCreditGrants.userId, userId))
    .for('update')
  const donors = grants.filter((grant) => usable(grant, now)).sort(grantOrder)
  for (const debtor of grants.filter(
    (grant) => grant.kind === 'pack' && imageGrantBalance(grant) < 0
  )) {
    for (const donor of donors) {
      if (donor.id === debtor.id) continue
      const units = Math.min(
        -imageGrantBalance(debtor),
        Math.max(0, imageGrantBalance(donor))
      )
      if (units <= 0) continue
      donor.debtApplied += units
      debtor.debtRecovered += units
      await tx
        .update(imageCreditGrants)
        .set({ debtApplied: donor.debtApplied, updatedAt: now })
        .where(eq(imageCreditGrants.id, donor.id))
      await tx
        .update(imageCreditGrants)
        .set({ debtRecovered: debtor.debtRecovered, updatedAt: now })
        .where(eq(imageCreditGrants.id, debtor.id))
    }
  }
  return grants
}

async function liveAccount(tx: Transaction, userId: string) {
  const [user] = await tx
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, userId))
  if (
    !user ||
    user.isAnonymous ||
    !user.emailVerified ||
    user.deletionRequestedAt
  )
    throw new AppError('Sign in to your verified account to continue.', 403)
  return user
}

function requirePaid(entitlements: BillingEntitlements) {
  if (!entitlements.paidActions)
    throw new AppError(
      'Choose a paid plan to generate images.',
      403,
      undefined,
      {
        code: 'PAID_ACCOUNT_REQUIRED',
        billingUrl: '/account/billing'
      }
    )
}

/** Included allowance is lazy but idempotent, including annual subscriptions. */
export async function getImageUsage(userId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, `user:${userId}`)
    await liveAccount(tx, userId)
    const entitlement = await readEntitlements(userId, tx, now)
    await ensureIncludedGrant(tx, userId, entitlement)
    const grants = entitlement.paidActions
      ? await settleCreditDebt(tx, userId, now)
      : await tx
          .select()
          .from(imageCreditGrants)
          .where(eq(imageCreditGrants.userId, userId))
    const current = grants.filter((grant) => usable(grant, now))
    const balance = (kind: ImageGrant['kind']) =>
      current
        .filter((grant) => grant.kind === kind)
        .reduce((sum, grant) => sum + Math.max(0, imageGrantBalance(grant)), 0)
    const debt = grants
      .filter((grant) => grant.kind === 'pack')
      .reduce((sum, grant) => sum + Math.max(0, -imageGrantBalance(grant)), 0)
    const included = entitlement.paidActions ? balance('included') : 0
    const purchased = balance('pack')
    const includedGrants = current.filter((grant) => grant.kind === 'included')
    return {
      allowance: entitlement.imageLimit,
      used: includedGrants.reduce((sum, grant) => sum + grant.used, 0),
      reserved: current.reduce((sum, grant) => sum + grant.reserved, 0),
      included,
      purchased,
      debt,
      remaining: entitlement.paidActions
        ? Math.max(0, included + purchased - debt)
        : 0,
      active: entitlement.paidActions,
      resetAt: entitlement.allowanceWindow.endsAt
    }
  })
}

export type ReserveImageInput = {
  userId: string
  draftId: string
  draftRevision: number
  requestKey: string
  inputHash: string
  recipe: TemplateRecipe
  recipeHash: string
  prompt: string
  referenceAssetId: string | null
  referenceHash: string | null
  model: string
  configVersion: string
  promptVersion: string
  config: Record<string, unknown>
  reservedCostMicros: number
  monthlyBudgetMicros: number
  maxConcurrent: number
  now?: Date
}

async function lockImageBudget(tx: Transaction, now: Date) {
  const month = utcUsagePeriod(now)
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'image-generation-capacity'}, 0))`
  )
  return month
}

export async function reserveImage(input: ReserveImageInput) {
  validateCostMicros(input.reservedCostMicros)
  validateCostMicros(input.monthlyBudgetMicros)
  if (
    !Number.isInteger(input.maxConcurrent) ||
    input.maxConcurrent < 1 ||
    input.maxConcurrent > 32
  )
    throw new Error('Invalid image concurrency limit')
  if (!input.requestKey || !input.inputHash || !input.prompt)
    throw new AppError('An image generation request is required.')
  const now = input.now ?? new Date()
  const subjectKey = `user:${input.userId}`
  const initialRecovery =
    input.draftRevision === 0 && input.requestKey === input.draftId
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, subjectKey)
    await liveAccount(tx, input.userId)
    const [replayed] = await tx
      .select()
      .from(imageOperations)
      .where(
        and(
          eq(imageOperations.subjectKey, subjectKey),
          eq(imageOperations.requestKey, input.requestKey)
        )
      )
    if (
      replayed &&
      ((!initialRecovery && replayed.inputHash !== input.inputHash) ||
        replayed.draftId !== input.draftId ||
        replayed.draftRevision !== input.draftRevision)
    )
      throw new AppError(
        'This image request key was already used for different inputs.',
        409
      )
    // Check again under the account lock: a manual request may have been
    // accepted since the route checked. Recovery retains its pinned inputs.
    const existing = initialRecovery
      ? (
          await tx
            .select()
            .from(imageOperations)
            .where(
              and(
                eq(imageOperations.subjectKey, subjectKey),
                eq(imageOperations.draftId, input.draftId),
                eq(imageOperations.draftRevision, 0)
              )
            )
            .orderBy(desc(imageOperations.createdAt))
            .limit(1)
        )[0]
      : replayed
    if (existing) return { operation: existing, created: false }
    const [draft] = await tx
      .select()
      .from(savedDrafts)
      .where(
        and(
          eq(savedDrafts.id, input.draftId),
          eq(savedDrafts.ownerId, input.userId),
          isNull(savedDrafts.deletedAt)
        )
      )
      .for('update')
    if (!draft) throw new AppError('Draft not found.', 404)
    if (draft.revision !== input.draftRevision)
      throw new AppError('This draft changed. Reload before generating.', 409)
    if (draft.status !== 'ready' || !draft.title)
      throw new AppError(
        'Prepare the summary before generating its background.',
        409
      )
    const entitlement = await readEntitlements(input.userId, tx, now)
    requirePaid(entitlement)
    await ensureIncludedGrant(tx, input.userId, entitlement)
    const grants = await settleCreditDebt(tx, input.userId, now)
    if (
      grants.some(
        (grant) => grant.kind === 'pack' && imageGrantBalance(grant) < 0
      )
    )
      throw new AppError(
        'Your image balance needs more credits after a refunded purchase.',
        429,
        undefined,
        { code: 'IMAGE_LIMIT', billingUrl: '/account/billing' }
      )
    const grant = grants
      .filter((value) => usable(value, now) && imageGrantBalance(value) > 0)
      .sort(grantOrder)[0]
    if (!grant)
      throw new AppError(
        'You have used your image generations. Buy an image pack or choose a curated or uploaded background.',
        429,
        undefined,
        {
          code: 'IMAGE_LIMIT',
          resetAt: entitlement.allowanceWindow.endsAt.toISOString(),
          billingUrl: '/account/billing'
        }
      )
    const month = await lockImageBudget(tx, now)
    const [cost] = await tx
      .select({
        liability:
          sql<number>`coalesce(sum(coalesce(${imageOperations.actualCostMicros}, ${imageOperations.reservedCostMicros})), 0)`.mapWith(
            Number
          )
      })
      .from(imageOperations)
      .where(
        and(
          gte(imageOperations.createdAt, month.startsAt),
          lt(imageOperations.createdAt, month.endsAt)
        )
      )
    const [active] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(imageOperations)
      .where(
        inArray(imageOperations.status, [
          'reserved',
          'dispatching',
          'running',
          'uncertain'
        ])
      )
    if (
      (cost?.liability ?? 0) + input.reservedCostMicros >
      input.monthlyBudgetMicros
    )
      throw new AppError(
        'Image generation is temporarily paused. Saved images remain available.',
        503,
        60,
        { code: 'IMAGE_UNAVAILABLE' }
      )
    if ((active?.count ?? 0) >= input.maxConcurrent)
      throw new AppError(
        'Image generation is busy. Try again shortly.',
        429,
        15,
        { code: 'IMAGE_UNAVAILABLE' }
      )
    await tx
      .update(imageCreditGrants)
      .set({ reserved: sql`${imageCreditGrants.reserved} + 1`, updatedAt: now })
      .where(eq(imageCreditGrants.id, grant.id))
    const id = randomUUID()
    const [operation] = await tx
      .insert(imageOperations)
      .values({
        id,
        ownerId: input.userId,
        subjectKey,
        requestKey: input.requestKey,
        inputHash: input.inputHash,
        draftId: input.draftId,
        draftRevision: input.draftRevision,
        grantId: grant.id,
        recipe: input.recipe,
        recipeHash: input.recipeHash,
        prompt: input.prompt,
        referenceAssetId: input.referenceAssetId,
        referenceHash: input.referenceHash,
        model: input.model,
        configVersion: input.configVersion,
        promptVersion: input.promptVersion,
        config: input.config,
        reservedCostMicros: input.reservedCostMicros,
        clientRequestId: id,
        createdAt: now,
        updatedAt: now
      })
      .returning()
    await tx.insert(assets).values({
      id,
      ownerId: input.userId,
      purpose: 'generated',
      visibility: 'private',
      status: 'pending',
      objectKey: `generated/${id}.webp`
    })
    return { operation: operation!, created: true }
  })
}

async function withImageOperation<T>(
  id: string,
  action: (tx: Transaction, operation: ImageOperation) => Promise<T>
) {
  return getDb().transaction(async (tx) => {
    const [found] = await tx
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, id))
    if (!found) throw new AppError('Image generation not found.', 404)
    await lockUsageSubjects(tx, found.subjectKey)
    await lockImageBudget(tx, found.createdAt)
    const [operation] = await tx
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, id))
      .for('update')
    if (!operation) throw new AppError('Image generation not found.', 404)
    return action(tx, operation)
  })
}

async function operationDraft(tx: Transaction, operation: ImageOperation) {
  if (!operation.ownerId || !operation.draftId) return null
  const [user] = await tx
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, operation.ownerId))
  if (!user || user.deletionRequestedAt) return null
  const [draft] = await tx
    .select()
    .from(savedDrafts)
    .where(
      and(
        eq(savedDrafts.id, operation.draftId),
        eq(savedDrafts.ownerId, operation.ownerId),
        isNull(savedDrafts.deletedAt)
      )
    )
    .for('update')
  return draft ?? null
}

async function finishImage(
  tx: Transaction,
  operation: ImageOperation,
  status: 'succeeded' | 'failed' | 'cancelled',
  input: {
    actualCostMicros: number | null
    resultAssetId?: string | null
    usage?: Record<string, unknown> | null
    providerRequestId?: string | null
    errorCode?: string | null
  }
) {
  if (terminal.some((value) => value === operation.status)) return operation
  if (input.actualCostMicros !== null)
    validateCostMicros(input.actualCostMicros)
  if (
    status === 'succeeded' &&
    !['running', 'uncertain'].includes(operation.status)
  )
    throw new AppError('This image has not been dispatched.', 409)
  if (
    status === 'cancelled' &&
    !['reserved', 'dispatching'].includes(operation.status)
  )
    return operation
  const draft = await operationDraft(tx, operation)
  let resultAssetId = input.resultAssetId ?? null
  if (status === 'succeeded' && draft) {
    const [asset] = resultAssetId
      ? await tx
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, resultAssetId),
              eq(assets.id, operation.id),
              eq(assets.ownerId, operation.ownerId!),
              eq(assets.purpose, 'generated'),
              eq(assets.status, 'ready'),
              eq(assets.cleanupPending, false)
            )
          )
      : []
    if (!asset)
      throw new AppError('The generated image is not durably saved yet.', 409)
  }
  if (!draft) resultAssetId = null
  await tx
    .update(imageCreditGrants)
    .set({
      reserved: sql`${imageCreditGrants.reserved} - 1`,
      used: sql`${imageCreditGrants.used} + ${status === 'succeeded' ? 1 : 0}`,
      updatedAt: new Date()
    })
    .where(eq(imageCreditGrants.id, operation.grantId))
  const [finished] = await tx
    .update(imageOperations)
    .set({
      status,
      resultAssetId,
      actualCostMicros: input.actualCostMicros,
      usage: input.usage ?? operation.usage,
      providerRequestId: input.providerRequestId ?? operation.providerRequestId,
      errorCode: input.errorCode ?? null,
      recipe: draft ? operation.recipe : null,
      prompt: draft ? operation.prompt : null,
      referenceAssetId: draft ? operation.referenceAssetId : null,
      referenceHash: draft ? operation.referenceHash : null,
      updatedAt: new Date(),
      completedAt: new Date()
    })
    .where(eq(imageOperations.id, operation.id))
    .returning()
  return finished!
}

/** Exactly one durable claimant may perform the paid provider request. */
export function claimImageOperation(id: string, now = new Date()) {
  return withImageOperation(id, async (tx, operation) => {
    if (!['reserved', 'dispatching'].includes(operation.status))
      return { operation, claimed: false }
    if (!(await operationDraft(tx, operation)))
      return {
        operation: await finishImage(tx, operation, 'cancelled', {
          actualCostMicros: 0
        }),
        claimed: false
      }
    const [running] = await tx
      .update(imageOperations)
      .set({
        status: 'running',
        submittedAt: now,
        deadlineAt: new Date(now.getTime() + 180_000),
        updatedAt: now
      })
      .where(eq(imageOperations.id, id))
      .returning()
    return { operation: running!, claimed: true }
  })
}

export function markImageUncertain(id: string, providerRequestId?: string) {
  return withImageOperation(id, async (tx, operation) => {
    if (!outstanding.some((value) => value === operation.status))
      return operation
    const [saved] = await tx
      .update(imageOperations)
      .set({
        status: 'uncertain',
        providerRequestId: providerRequestId ?? operation.providerRequestId,
        errorCode: 'GENERATION_UNCERTAIN',
        updatedAt: new Date()
      })
      .where(eq(imageOperations.id, id))
      .returning()
    return saved!
  })
}

export function succeedImageOperation(
  id: string,
  input: Parameters<typeof finishImage>[3]
) {
  return withImageOperation(id, (tx, operation) =>
    finishImage(tx, operation, 'succeeded', input)
  )
}
export function failImageOperation(
  id: string,
  input: Parameters<typeof finishImage>[3]
) {
  return withImageOperation(id, (tx, operation) =>
    finishImage(tx, operation, 'failed', input)
  )
}
export function cancelImageOperation(id: string) {
  return withImageOperation(id, (tx, operation) =>
    finishImage(tx, operation, 'cancelled', { actualCostMicros: 0 })
  )
}
export function reconcileImageCost(id: string, actualCostMicros: number) {
  validateCostMicros(actualCostMicros)
  return withImageOperation(id, async (tx, operation) => {
    if (!terminal.some((value) => value === operation.status))
      throw new AppError(
        'Resolve the image outcome before reconciling its cost.',
        409
      )
    if (operation.actualCostMicros !== null) return operation
    const [saved] = await tx
      .update(imageOperations)
      .set({ actualCostMicros, updatedAt: new Date() })
      .where(eq(imageOperations.id, id))
      .returning()
    return saved!
  })
}

/** Caller already holds the user's lock inside deletion transaction. */
export async function cancelUndispatchedImages(
  tx: Transaction,
  userId: string,
  draftId?: string
) {
  await lockUsageSubjects(tx, `user:${userId}`)
  const rows = await tx
    .select()
    .from(imageOperations)
    .where(
      and(
        eq(imageOperations.ownerId, userId),
        inArray(imageOperations.status, ['reserved', 'dispatching']),
        draftId ? eq(imageOperations.draftId, draftId) : undefined
      )
    )
    .for('update')
  for (const operation of rows)
    await finishImage(tx, operation, 'cancelled', { actualCostMicros: 0 })
}

import { createHash } from 'node:crypto'
import { and, desc, eq, isNull, lte, or } from 'drizzle-orm'

import { requireRegisteredActor, type Actor } from './actors'
import {
  getOwnedAsset,
  requireAssetAccount,
  resolveOwnedCardDesign
} from './assets'
import { getDb, type Transaction } from './db'
import { imageOperations, savedDrafts } from './db/schema'
import { AppError } from './errors'
import { buildImagePrompt, getImageGenerationConfig } from './image-model'
import { getImageUsage, reserveImage, type ImageOperation } from './image-usage'
import { templateRecipeSchema } from './paid-design'
import { r2Configured } from './r2'
import { lockUsageSubjects } from './usage'

export async function readOwnedImageJob(actor: Actor, id: string) {
  requireRegisteredActor(actor)
  await requireAssetAccount(actor.userId)
  const [operation] = await getDb()
    .select()
    .from(imageOperations)
    .where(
      and(eq(imageOperations.id, id), eq(imageOperations.ownerId, actor.userId))
    )
  if (!operation || !operation.draftId)
    throw new AppError('Image generation not found.', 404)
  const [draft] = await getDb()
    .select()
    .from(savedDrafts)
    .where(
      and(
        eq(savedDrafts.id, operation.draftId),
        eq(savedDrafts.ownerId, actor.userId),
        isNull(savedDrafts.deletedAt)
      )
    )
  if (!draft) throw new AppError('Draft not found.', 404)
  return { operation, draft }
}

export async function requestImageJob(
  actor: Actor,
  draftId: string,
  revision: number,
  requestKey: string
) {
  requireRegisteredActor(actor)
  const initialRecovery = revision === 0 && requestKey === draftId
  const [replayed] = await getDb()
    .select()
    .from(imageOperations)
    .where(
      and(
        eq(imageOperations.ownerId, actor.userId),
        eq(imageOperations.requestKey, requestKey)
      )
    )
  if (
    replayed &&
    (replayed.draftId !== draftId || replayed.draftRevision !== revision)
  )
    throw new AppError(
      'This image request was already used for another draft revision.',
      409
    )
  // Reopening an untouched draft follows its latest accepted image intent,
  // including an explicit replacement. Recovery itself never buys a reroll.
  const existing = initialRecovery
    ? (
        await getDb()
          .select()
          .from(imageOperations)
          .where(
            and(
              eq(imageOperations.ownerId, actor.userId),
              eq(imageOperations.draftId, draftId),
              eq(imageOperations.draftRevision, 0)
            )
          )
          .orderBy(desc(imageOperations.createdAt))
          .limit(1)
      )[0]
    : replayed
  if (existing) {
    await readOwnedImageJob(actor, existing.id)
    return existing
  }
  const config = getImageGenerationConfig()
  if (!config.enabled || !config.monthlyBudgetMicros || !r2Configured())
    throw new AppError(
      'Image generation is not available yet. You can use a curated or uploaded background.',
      503,
      undefined,
      { code: 'IMAGE_UNAVAILABLE' }
    )
  const { draft, recipe, referenceHash } = await getDb().transaction(
    async (tx) => {
      await lockUsageSubjects(tx, actor.subjectKey)
      await requireAssetAccount(actor.userId!, tx)
      const [draft] = await tx
        .select()
        .from(savedDrafts)
        .where(
          and(
            eq(savedDrafts.id, draftId),
            eq(savedDrafts.ownerId, actor.userId!),
            isNull(savedDrafts.deletedAt)
          )
        )
      if (!draft) throw new AppError('Draft not found.', 404)
      if (draft.revision !== revision)
        throw new AppError('Save the latest draft before generating.', 409)
      if (!draft.design || draft.design.recipe.background.mode !== 'generated')
        throw new AppError(
          'Choose a generated background before generating an image.',
          409
        )
      const recipe = templateRecipeSchema.parse(draft.design.recipe)
      await resolveOwnedCardDesign(actor.userId!, draft.design, {
        allowPending: true,
        tx,
        frozen: draft.resolvedDesign
      })
      const reference = recipe.referenceAssetId
        ? await getOwnedAsset(actor.userId!, recipe.referenceAssetId, {
            purpose: ['reference'],
            tx
          })
        : null
      return { draft, recipe, referenceHash: reference?.sha256 ?? null }
    }
  )
  const prompt = buildImagePrompt({
    preview: { title: draft.title, highlights: draft.highlights },
    recipe
  })
  const inputHash = createHash('sha256')
    .update(
      JSON.stringify({
        draftId,
        revision,
        recipeHash: prompt.recipeHash,
        promptHash: prompt.promptHash,
        referenceHash,
        config
      })
    )
    .digest('hex')
  return (
    await reserveImage({
      userId: actor.userId,
      draftId,
      draftRevision: revision,
      requestKey,
      inputHash,
      recipe,
      recipeHash: prompt.recipeHash,
      prompt: prompt.prompt,
      referenceAssetId: recipe.referenceAssetId,
      referenceHash,
      model: config.model,
      configVersion: config.configVersion,
      promptVersion: prompt.promptVersion,
      config,
      reservedCostMicros: config.reservationCostMicros,
      monthlyBudgetMicros: config.monthlyBudgetMicros,
      maxConcurrent: config.concurrency
    })
  ).operation
}

/** Ambiguous queue delivery can enqueue again after the lease; provider dispatch
 * still has its own one-time claim, so this cannot buy another generation. */
export async function ensureImageEnqueued(
  id: string,
  enqueue: (id: string) => Promise<{ runId: string }>
) {
  const [found] = await getDb()
    .select()
    .from(imageOperations)
    .where(eq(imageOperations.id, id))
  if (!found || !['reserved', 'dispatching'].includes(found.status)) return
  const lease = new Date(Date.now() + 60_000)
  const claimed = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, found.subjectKey)
    const [operation] = await tx
      .update(imageOperations)
      .set({
        status: 'dispatching',
        dispatchLeaseUntil: lease,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(imageOperations.id, id),
          or(
            eq(imageOperations.status, 'reserved'),
            and(
              eq(imageOperations.status, 'dispatching'),
              or(
                isNull(imageOperations.dispatchLeaseUntil),
                lte(imageOperations.dispatchLeaseUntil, new Date())
              )
            )
          )
        )
      )
      .returning()
    return operation
  })
  if (!claimed) return
  try {
    const run = await enqueue(id)
    await getDb()
      .update(imageOperations)
      .set({ workflowRunId: run.runId, updatedAt: new Date() })
      .where(eq(imageOperations.id, id))
  } catch {
    // The durable reservation and lease survive a lost queue response. Status
    // polling retries delivery only for this operation, never a fresh request.
  }
}

async function applyResult(
  tx: Transaction,
  operation: ImageOperation,
  revision: number
) {
  if (!operation.ownerId || !operation.draftId)
    throw new AppError('Draft not found.', 404)
  await requireAssetAccount(operation.ownerId, tx)
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
  if (!draft?.design)
    throw new AppError('This draft no longer uses a custom background.', 409)
  if (draft.design.generatedImage?.operationId === operation.id) return true
  if (draft.revision !== revision) return false
  if (operation.status !== 'succeeded' || !operation.resultAssetId)
    throw new AppError('This image has not finished generating.', 409)
  if (draft.design.recipe.background.mode !== 'generated') return false
  await getOwnedAsset(operation.ownerId, operation.resultAssetId, {
    purpose: ['generated'],
    tx
  })
  await tx
    .update(savedDrafts)
    .set({
      design: {
        ...draft.design,
        generatedImage: {
          assetId: operation.resultAssetId,
          operationId: operation.id,
          recipeHash: operation.recipeHash
        }
      },
      resolvedDesign: null,
      revision: draft.revision + 1,
      publishedPublicationId: null,
      updatedAt: new Date()
    })
    .where(eq(savedDrafts.id, draft.id))
  return true
}

export async function applyImageResult(
  actor: Actor,
  id: string,
  revision: number
) {
  const { operation } = await readOwnedImageJob(actor, id)
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, operation.subjectKey)
    const applied = await applyResult(tx, operation, revision)
    if (!applied)
      throw new AppError(
        'This draft changed. Reload it before applying the saved image.',
        409
      )
    return { applied: true, draftId: operation.draftId }
  })
}

export async function autoApplyImageResult(id: string) {
  const [operation] = await getDb()
    .select()
    .from(imageOperations)
    .where(eq(imageOperations.id, id))
  if (!operation || operation.status !== 'succeeded') return false
  return getDb()
    .transaction(async (tx) => {
      await lockUsageSubjects(tx, operation.subjectKey)
      return applyResult(tx, operation, operation.draftRevision)
    })
    .catch((err) => {
      if (err instanceof AppError && [403, 404, 409].includes(err.status))
        return false
      throw err
    })
}

export async function presentImageJob(actor: Actor, id: string) {
  const { operation, draft } = await readOwnedImageJob(actor, id)
  return {
    id: operation.id,
    draftId: operation.draftId,
    draftRevision: operation.draftRevision,
    status: operation.status,
    createdAt: operation.createdAt,
    resultAssetId: operation.resultAssetId,
    applied: draft.design?.generatedImage?.operationId === operation.id,
    canApply:
      operation.status === 'succeeded' &&
      Boolean(operation.resultAssetId) &&
      draft.design?.recipe.background.mode === 'generated',
    error:
      operation.status === 'uncertain'
        ? 'The provider response was interrupted. Your credit remains reserved while we check the result.'
        : operation.status === 'failed'
          ? 'This image could not be completed. Its generation credit was restored.'
          : null,
    usage: await getImageUsage(actor.userId!)
  }
}

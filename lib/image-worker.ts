import { and, eq, inArray } from 'drizzle-orm'

import {
  readOwnedAssetBytes,
  recoverGeneratedAsset,
  storePreauthorizedGeneratedAsset,
  verifyStoredGeneratedAsset
} from './assets'
import { getDb } from './db'
import { imageOperations } from './db/schema'
import { AppError } from './errors'
import { autoApplyImageResult } from './image-jobs'
import {
  generateBackgroundImage,
  ImageGenerationError,
  type ImageModelConfig
} from './image-model'
import {
  claimImageOperation,
  failImageOperation,
  markImageUncertain,
  succeedImageOperation,
  type ImageOperation
} from './image-usage'

const pendingStatuses = ['running', 'uncertain'] as const
async function load(id: string) {
  const [operation] = await getDb()
    .select()
    .from(imageOperations)
    .where(eq(imageOperations.id, id))
  if (!operation) throw new AppError('Image generation not found.', 404)
  return operation
}
const visibleStatus = (operation: ImageOperation) => ({
  operationId: operation.id,
  status: operation.status
})

async function recordResponse(
  id: string,
  input: {
    providerRequestId: string | null
    usage: Record<string, unknown> | null
    actualCostMicros: number | null
  }
) {
  await getDb()
    .update(imageOperations)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(imageOperations.id, id),
        inArray(imageOperations.status, [...pendingStatuses])
      )
    )
}

/** Safe to repeat: only read/finalize an immutable object; never calls the model. */
export async function recoverImageResult(id: string) {
  const operation = await load(id)
  if (operation.status === 'succeeded') {
    await autoApplyImageResult(id)
    return visibleStatus(operation)
  }
  if (!pendingStatuses.some((status) => status === operation.status))
    return visibleStatus(operation)
  let ownerUnavailable = !operation.ownerId || !operation.draftId
  if (operation.ownerId && operation.draftId) {
    try {
      const asset = await recoverGeneratedAsset({
        userId: operation.ownerId,
        operationId: id
      })
      if (asset) {
        const saved = await succeedImageOperation(id, {
          resultAssetId: asset.id,
          actualCostMicros: operation.actualCostMicros,
          usage: operation.usage,
          providerRequestId: operation.providerRequestId
        })
        await autoApplyImageResult(id)
        return visibleStatus(saved)
      }
    } catch (err) {
      if (!(err instanceof AppError) || ![403, 404, 410].includes(err.status))
        throw err
      ownerUnavailable = true
    }
  }
  if (ownerUnavailable && (await verifyStoredGeneratedAsset(id))) {
    // Verify the immutable result even after its owner/draft was deleted.
    // Settlement rechecks that no live draft needs an attached asset; it cannot
    // resurrect a record or infer success merely from provider billing evidence.
    return visibleStatus(
      await succeedImageOperation(id, {
        actualCostMicros: operation.actualCostMicros,
        usage: operation.usage,
        providerRequestId: operation.providerRequestId
      })
    )
  }
  if (!operation.deadlineAt || operation.deadlineAt <= new Date())
    return visibleStatus(await markImageUncertain(id))
  return visibleStatus(operation)
}

/** This function is called only from the no-retry paid Workflow step. */
export async function runImageGeneration(id: string) {
  const prior = await load(id)
  if (!['reserved', 'dispatching'].includes(prior.status))
    return recoverImageResult(id)
  const claim = await claimImageOperation(id)
  if (!claim.claimed) return recoverImageResult(id)
  const operation = claim.operation
  if (!operation.ownerId || !operation.prompt)
    return visibleStatus(
      await failImageOperation(id, {
        actualCostMicros: 0,
        errorCode: 'ACCOUNT_UNAVAILABLE'
      })
    )
  let referenceBytes: Uint8Array | undefined
  try {
    if (operation.referenceAssetId) {
      const reference = await readOwnedAssetBytes(
        operation.ownerId,
        operation.referenceAssetId,
        ['reference']
      )
      if (reference.asset.sha256 !== operation.referenceHash)
        throw new AppError('The style reference changed.', 409)
      referenceBytes = reference.bytes
    }
  } catch {
    return visibleStatus(
      await failImageOperation(id, {
        actualCostMicros: 0,
        errorCode: 'REFERENCE_UNAVAILABLE'
      })
    )
  }
  let result: Awaited<ReturnType<typeof generateBackgroundImage>>
  try {
    result = await generateBackgroundImage(
      {
        operationId: id,
        prompt: operation.prompt,
        referenceBytes,
        onResponseIdentity: async (identity) => {
          // Save a trace ID early when possible. A database interruption must not
          // discard an otherwise readable provider body.
          await getDb()
            .update(imageOperations)
            .set({
              providerRequestId: identity.providerRequestId,
              updatedAt: new Date()
            })
            .where(eq(imageOperations.id, id))
            .catch(() => {})
        }
      },
      operation.config as ImageModelConfig
    )
  } catch (err) {
    if (!(err instanceof ImageGenerationError))
      return visibleStatus(await markImageUncertain(id))
    const evidence = {
      providerRequestId: err.evidence.providerRequestId ?? null,
      usage: err.evidence.usage ?? null,
      actualCostMicros: err.evidence.actualCostMicros ?? null
    }
    if (err.outcome === 'definite-failure')
      return visibleStatus(
        await failImageOperation(id, { ...evidence, errorCode: err.code })
      )
    await recordResponse(id, evidence).catch(() => {})
    return visibleStatus(
      await markImageUncertain(id, evidence.providerRequestId ?? undefined)
    )
  }
  const evidence = {
    providerRequestId: result.providerRequestId,
    usage: result.usage,
    actualCostMicros: result.actualCostMicros
  }
  await recordResponse(id, evidence).catch(() => {})
  try {
    const asset = await storePreauthorizedGeneratedAsset({
      userId: operation.ownerId,
      operationId: id,
      bytes: result.bytes
    })
    const saved = await succeedImageOperation(id, {
      ...evidence,
      resultAssetId: asset.id
    })
    await autoApplyImageResult(id)
    return visibleStatus(saved)
  } catch (err) {
    if (err instanceof AppError && [403, 404, 410].includes(err.status)) {
      // The user deliberately deleted the account/draft after dispatch. A usable
      // generation still counts, but cannot recreate a private record.
      return visibleStatus(await succeedImageOperation(id, evidence))
    }
    if (err instanceof AppError && [400, 413].includes(err.status))
      return visibleStatus(
        await failImageOperation(id, {
          ...evidence,
          errorCode: 'INVALID_IMAGE'
        })
      )
    await recordResponse(id, evidence).catch(() => {})
    return visibleStatus(
      await markImageUncertain(id, result.providerRequestId ?? undefined)
    )
  }
}

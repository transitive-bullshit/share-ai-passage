import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { z } from 'zod'

import { accountSubject } from './accounts'
import type { CardArtwork } from './card'
import { requirePaidAccount } from './billing'
import { getDb, type Transaction } from './db'
import { consumeRateLimit } from './db/rate-limit'
import { assets, authUsers, imageOperations, savedDrafts } from './db/schema'
import { AppError } from './errors'
import {
  resolveCardDesign,
  draftDesignSchema,
  resolvedCardDesignSchema,
  type ResolvedCardDesign,
  type DraftDesign,
  type TemplateRecipe
} from './paid-design'
import {
  assetSha256,
  deletePrivateObject,
  headAsset,
  presignUpload,
  putImmutableAsset,
  r2Configured,
  readAssetBytes,
  signPrivateAssetRead
} from './r2'
import { lockUsageSubjects } from './usage'

export const MAX_UPLOAD_BYTES = 10_000_000
export const MAX_LIBRARY_BYTES = 1_000_000_000
export const REFERENCE_NORMALIZATION_VERSION = 'reference-webp-1024-v1'
export const uploadPurposes = ['background', 'logo', 'reference'] as const
export type UploadPurpose = (typeof uploadPurposes)[number]
type Asset = typeof assets.$inferSelect
const readyPurposes = [...uploadPurposes, 'generated', 'card'] as const
export const uploadRequestSchema = z.strictObject({
  requestKey: z.uuid(),
  purpose: z.enum(uploadPurposes),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES)
})
export type AssetDescriptor = Pick<
  Asset,
  | 'id'
  | 'purpose'
  | 'status'
  | 'byteSize'
  | 'width'
  | 'height'
  | 'contentType'
  | 'createdAt'
>
export function assetDescriptor(asset: Asset): AssetDescriptor {
  const {
    id,
    purpose,
    status,
    byteSize,
    width,
    height,
    contentType,
    createdAt
  } = asset
  return {
    id,
    purpose,
    status,
    byteSize,
    width,
    height,
    contentType,
    createdAt
  }
}
export async function requireAssetAccount(userId: string, tx?: Transaction) {
  const [user] = await (tx ?? getDb())
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
}
async function libraryUsage(userId: string, tx?: Transaction) {
  const [usage] = await (tx ?? getDb())
    .select({
      usedBytes: sql<number>`coalesce(sum(case when ${assets.status} = 'ready' then ${assets.byteSize} else 0 end), 0)::bigint`,
      reservedBytes: sql<number>`coalesce(sum(case when ${assets.status} in ('pending','processing') then ${assets.reservedBytes} else 0 end), 0)::bigint`
    })
    .from(assets)
    .where(
      and(
        eq(assets.ownerId, userId),
        inArray(assets.purpose, uploadPurposes),
        isNull(assets.libraryDeletedAt)
      )
    )
  return {
    usedBytes: Number(usage?.usedBytes ?? 0),
    reservedBytes: Number(usage?.reservedBytes ?? 0),
    limitBytes: MAX_LIBRARY_BYTES
  }
}
async function expireReservations(
  userId: string,
  tx: Transaction,
  now = new Date()
) {
  await tx
    .update(assets)
    .set({
      status: 'expired',
      reservedBytes: 0,
      errorMessage: 'This upload expired. Choose the file again.',
      updatedAt: now
    })
    .where(
      and(
        eq(assets.ownerId, userId),
        inArray(assets.purpose, uploadPurposes),
        lte(assets.expiresAt, now),
        or(
          eq(assets.status, 'pending'),
          and(
            eq(assets.status, 'processing'),
            lte(assets.processingLeaseUntil, now)
          )
        )
      )
    )
}
export async function listAssets(userId: string, cursor?: string | null) {
  await requireAssetAccount(userId)
  const offset = cursor ? Number(cursor) : 0
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new AppError('Invalid asset cursor.')
  const [rows, usage] = await Promise.all([
    getDb()
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.ownerId, userId),
          inArray(assets.purpose, uploadPurposes),
          eq(assets.status, 'ready'),
          isNull(assets.libraryDeletedAt)
        )
      )
      .orderBy(desc(assets.createdAt), desc(assets.id))
      .limit(51)
      .offset(offset),
    libraryUsage(userId)
  ])
  return {
    assets: rows.slice(0, 50).map(assetDescriptor),
    nextCursor: rows.length > 50 ? String(offset + 50) : null,
    usage,
    uploadsAvailable: r2Configured()
  }
}
export async function reserveUpload(userId: string, value: unknown) {
  const parsed = uploadRequestSchema.safeParse(value)
  if (!parsed.success)
    throw new AppError(
      parsed.error.issues[0]?.message ?? 'Choose a supported image.'
    )
  if (!r2Configured())
    throw new AppError('Image uploads are not configured yet.', 503)
  const input = parsed.data
  const inputHash = assetSha256(
    Buffer.from(
      JSON.stringify({
        purpose: input.purpose,
        contentType: input.contentType,
        byteSize: input.byteSize
      })
    )
  )
  await requirePaidAccount(userId)
  const budget = await consumeRateLimit({
    key: `uploads:${userId}`,
    limit: 60,
    windowMs: 60 * 60 * 1000
  })
  if (!budget.allowed)
    throw new AppError(
      'Too many upload attempts. Try again later.',
      429,
      Math.max(1, Math.ceil((budget.resetAt.getTime() - Date.now()) / 1000))
    )
  const record = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requirePaidAccount(userId, tx)
    const now = new Date()
    await expireReservations(userId, tx, now)
    const [existing] = await tx
      .select()
      .from(assets)
      .where(
        and(eq(assets.ownerId, userId), eq(assets.requestKey, input.requestKey))
      )
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new AppError(
          'This upload request was already used for a different file.',
          409
        )
      if (!['pending', 'processing', 'ready'].includes(existing.status))
        throw new AppError(
          existing.errorMessage ||
            'Choose the file again to start a new upload.',
          410
        )
      return existing
    }
    const usage = await libraryUsage(userId, tx)
    if (
      usage.usedBytes + usage.reservedBytes + input.byteSize >
      MAX_LIBRARY_BYTES
    )
      throw new AppError(
        'Your image library is full. Remove an image before uploading another.',
        413
      )
    const id = randomUUID()
    const [row] = await tx
      .insert(assets)
      .values({
        id,
        ownerId: userId,
        purpose: input.purpose,
        visibility: 'private',
        status: 'pending',
        requestKey: input.requestKey,
        inputHash,
        stagingKey: `uploads/${id}.upload`,
        objectKey: `assets/${id}.webp`,
        contentType: input.contentType,
        declaredBytes: input.byteSize,
        reservedBytes: input.byteSize,
        expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
      })
      .returning()
    return row!
  })
  if (record.status === 'ready')
    return {
      assetId: record.id,
      status: 'ready' as const,
      asset: assetDescriptor(record)
    }
  if (record.status === 'processing')
    return { assetId: record.id, status: 'processing' as const }
  const seconds = Math.floor((record.expiresAt!.getTime() - Date.now()) / 1000)
  if (seconds < 1)
    throw new AppError('This upload expired. Choose the file again.', 410)
  const signed = await presignUpload(
    record.stagingKey!,
    input.contentType,
    input.byteSize,
    seconds
  )
  return {
    assetId: record.id,
    status: 'pending' as const,
    ...signed,
    expiresAt: record.expiresAt!.toISOString()
  }
}
function imageSignature(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes)
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpeg'
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp'
  throw new AppError('Choose a static PNG, JPEG or WebP image.')
}
export async function normalizeUploadedImage(
  bytes: Uint8Array,
  purpose: UploadPurpose | 'generated',
  expectedType?: string
) {
  if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError('Images must be 10 MB or smaller.', 413)
  const format = imageSignature(bytes)
  if (expectedType && expectedType !== `image/${format}`)
    throw new AppError('The image does not match its file type.')
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
      animated: true
    })
    const metadata = await image.metadata()
    if (
      metadata.format !== format ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw new AppError(
        'Choose a valid, still image. Animated images are not supported.'
      )
    const edge = purpose === 'reference' ? 1024 : 4096
    const result = await image
      .rotate()
      .resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({
        quality: purpose === 'reference' ? 85 : 90,
        lossless: purpose === 'logo'
      })
      .toBuffer({ resolveWithObject: true })
    if (
      result.data.byteLength >
      (purpose === 'reference' ? 1_000_000 : MAX_UPLOAD_BYTES)
    )
      throw new AppError(
        'The normalized image is too large. Try a smaller image.',
        413
      )
    return {
      bytes: result.data,
      width: result.info.width,
      height: result.info.height,
      contentType: 'image/webp' as const,
      sha256: assetSha256(result.data)
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      'This image could not be decoded safely. Choose another static PNG, JPEG or WebP.'
    )
  }
}
export async function getOwnedAsset(
  userId: string,
  id: string,
  options: {
    purpose?: readonly string[]
    active?: boolean
    tx?: Transaction
  } = {}
) {
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Image not found.', 404)
  const [asset] = await (options.tx ?? getDb())
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, id),
        eq(assets.ownerId, userId),
        eq(assets.status, 'ready'),
        eq(assets.cleanupPending, false)
      )
    )
  if (
    !asset ||
    (options.active && asset.libraryDeletedAt) ||
    (options.purpose && !options.purpose.includes(asset.purpose))
  )
    throw new AppError(
      'Image not found or no longer available for this selection.',
      404
    )
  return asset
}
export async function finalizeUpload(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Upload not found.', 404)
  const lease = new Date(Date.now() + 120_000)
  const record = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requireAssetAccount(userId, tx)
    const [asset] = await tx
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, id),
          eq(assets.ownerId, userId),
          inArray(assets.purpose, uploadPurposes)
        )
      )
      .for('update')
    if (!asset || asset.cleanupPending || asset.libraryDeletedAt)
      throw new AppError('Upload not found.', 404)
    if (asset.status === 'ready') return asset
    await requirePaidAccount(userId, tx)
    if (
      asset.status === 'processing' &&
      asset.processingLeaseUntil &&
      asset.processingLeaseUntil > new Date()
    )
      throw new AppError(
        'This image is still being checked. Try again shortly.',
        409,
        3
      )
    if (
      !['pending', 'processing'].includes(asset.status) ||
      !asset.expiresAt ||
      asset.expiresAt <= new Date()
    )
      throw new AppError('This upload expired. Choose the file again.', 410)
    const [updated] = await tx
      .update(assets)
      .set({
        status: 'processing',
        processingLeaseUntil: lease,
        updatedAt: new Date()
      })
      .where(eq(assets.id, id))
      .returning()
    return updated!
  })
  if (record.status === 'ready') return { asset: assetDescriptor(record) }
  try {
    const head = await headAsset('private', record.stagingKey!)
    if (!head)
      throw new AppError(
        'The upload has not arrived. Finish uploading, then try again.',
        409
      )
    if (
      head.byteSize !== record.declaredBytes ||
      head.byteSize > MAX_UPLOAD_BYTES
    )
      throw new AppError(
        'The uploaded file size does not match this reservation.',
        413
      )
    if (!head.etag) throw new AppError('The upload could not be verified.', 502)
    const bytes = await readAssetBytes(
      'private',
      record.stagingKey!,
      MAX_UPLOAD_BYTES,
      head.etag
    )
    if (bytes.byteLength !== record.declaredBytes)
      throw new AppError('The uploaded file is incomplete.', 409)
    const normalized = await normalizeUploadedImage(
      bytes,
      record.purpose as UploadPurpose,
      record.contentType ?? undefined
    )
    await putImmutableAsset({
      visibility: 'private',
      key: record.objectKey,
      bytes: normalized.bytes,
      contentType: normalized.contentType
    })
    const saved = await getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(userId))
      await requirePaidAccount(userId, tx)
      const [current] = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, id), eq(assets.ownerId, userId)))
        .for('update')
      if (
        !current ||
        current.cleanupPending ||
        current.libraryDeletedAt ||
        current.processingLeaseUntil?.getTime() !== lease.getTime() ||
        lease <= new Date() ||
        current.status !== 'processing'
      )
        throw new AppError('This upload is no longer active.', 409)
      const usage = await libraryUsage(userId, tx)
      if (
        usage.usedBytes +
          usage.reservedBytes -
          current.reservedBytes +
          normalized.bytes.byteLength >
        MAX_LIBRARY_BYTES
      )
        throw new AppError(
          'Your image library is full. Remove an image and upload this file again.',
          413
        )
      const [asset] = await tx
        .update(assets)
        .set({
          status: 'ready',
          byteSize: normalized.bytes.byteLength,
          reservedBytes: 0,
          contentType: normalized.contentType,
          width: normalized.width,
          height: normalized.height,
          sha256: normalized.sha256,
          stagingEtag: head.etag,
          processingLeaseUntil: null,
          errorMessage: null,
          updatedAt: new Date()
        })
        .where(eq(assets.id, id))
        .returning()
      return asset!
    })
    return { asset: assetDescriptor(saved) }
  } catch (err) {
    // Retain retryable transport/lease failures. Confirmed invalid input releases capacity.
    const invalid = err instanceof AppError && [400, 413].includes(err.status)
    await getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(userId))
      await tx
        .update(assets)
        .set({
          status: invalid ? 'failed' : 'pending',
          reservedBytes: invalid ? 0 : record.reservedBytes,
          processingLeaseUntil: null,
          errorMessage: invalid ? err.message : null,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(assets.id, id),
            eq(assets.ownerId, userId),
            eq(assets.status, 'processing'),
            eq(assets.processingLeaseUntil, lease),
            eq(assets.cleanupPending, false)
          )
        )
    })
    throw err
  }
}
export async function removeAsset(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Image not found.', 404)
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requireAssetAccount(userId, tx)
    const [record] = await tx
      .update(assets)
      .set({
        libraryDeletedAt: new Date(),
        reservedBytes: 0,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(assets.id, id),
          eq(assets.ownerId, userId),
          inArray(assets.purpose, uploadPurposes)
        )
      )
      .returning({ id: assets.id })
    if (!record) throw new AppError('Image not found.', 404)
  })
  return { removed: true }
}
export async function assetAccess(userId: string, id: string) {
  await requireAssetAccount(userId)
  const asset = await getOwnedAsset(userId, id, { purpose: readyPurposes })
  if (asset.visibility !== 'private')
    throw new AppError('Image not found.', 404)
  return {
    url: await signPrivateAssetRead(asset.objectKey),
    expiresAt: new Date(Date.now() + 120_000).toISOString()
  }
}
export async function validateRecipeAssets(
  userId: string,
  recipe: TemplateRecipe,
  tx?: Transaction,
  active = true
) {
  const entries: [string | null, readonly string[]][] = [
    [recipe.referenceAssetId, ['reference']],
    [
      recipe.branding.mode === 'custom' ? recipe.branding.assetId : null,
      ['logo']
    ],
    [
      recipe.background.mode === 'uploaded' ? recipe.background.assetId : null,
      ['background']
    ]
  ]
  for (const [id, purpose] of entries)
    if (id) await getOwnedAsset(userId, id, { purpose, active, tx })
}
export async function resolveOwnedCardDesign(
  userId: string,
  design: DraftDesign,
  options: {
    allowPending?: boolean
    tx?: Transaction
    frozen?: ResolvedCardDesign | null
  } = {}
) {
  await requireAssetAccount(userId, options.tx)
  await validateRecipeAssets(userId, design.recipe, options.tx, false)
  const resolved = resolveCardDesign(
    { templateId: design.recipe.baseStyle },
    design
  )!
  if (options.frozen) {
    const frozen = resolvedCardDesignSchema.parse(options.frozen)
    if (
      frozen.template.id !== design.recipe.baseStyle ||
      JSON.stringify(frozen.background) !==
        JSON.stringify(resolved.background) ||
      JSON.stringify(frozen.branding) !== JSON.stringify(resolved.branding) ||
      JSON.stringify(frozen.crop) !== JSON.stringify(resolved.crop)
    )
      throw new AppError(
        'The saved presentation does not match this draft.',
        409
      )
    resolved.template = frozen.template
    resolved.rendererVersion = frozen.rendererVersion
  }
  if (resolved.background.kind === 'pending' && !options.allowPending)
    throw new AppError(
      'Generate a background or explicitly choose a curated or uploaded image before publishing.',
      409
    )
  const ids: [string, readonly string[]][] = []
  if (resolved.background.kind === 'asset')
    ids.push([
      resolved.background.assetId,
      design.recipe.background.mode === 'generated'
        ? ['generated']
        : ['background']
    ])
  if (resolved.branding.mode === 'custom')
    ids.push([resolved.branding.assetId, ['logo']])
  for (const [id, purpose] of ids) {
    const asset = await getOwnedAsset(userId, id, { purpose, tx: options.tx })
    if (!asset.sha256)
      throw new AppError('This image has not finished processing.', 409)
    if (
      options.frozen &&
      !options.frozen.assetVersions.some(
        (version) => version.id === asset.id && version.sha256 === asset.sha256
      )
    )
      throw new AppError('The saved artwork could not be verified.', 409)
    resolved.assetVersions.push({ id: asset.id, sha256: asset.sha256 })
  }
  return resolved
}
export async function readOwnedAssetBytes(
  userId: string,
  id: string,
  purpose?: readonly string[]
) {
  await requireAssetAccount(userId)
  const asset = await getOwnedAsset(userId, id, { purpose })
  const bytes = await readAssetBytes(
    asset.visibility,
    asset.objectKey,
    MAX_UPLOAD_BYTES
  )
  if (assetSha256(bytes) !== asset.sha256)
    throw new AppError('This saved image could not be verified.', 502)
  return { asset, bytes }
}
/** Called in the account deletion transaction, before auth records disappear. */
export async function queueAccountAssetCleanup(
  userId: string,
  tx: Transaction
) {
  await tx
    .update(assets)
    .set({
      ownerId: null,
      reservedBytes: 0,
      cleanupPending: true,
      status: 'failed',
      updatedAt: new Date()
    })
    .where(and(eq(assets.ownerId, userId), eq(assets.visibility, 'private')))
  await tx
    .update(assets)
    .set({ ownerId: null })
    .where(and(eq(assets.ownerId, userId), eq(assets.visibility, 'public')))
}
function privateCleanupEligibility(now: Date) {
  return and(
    eq(assets.visibility, 'private'),
    or(eq(assets.cleanupPending, true), lte(assets.expiresAt, now)),
    or(isNull(assets.expiresAt), lte(assets.expiresAt, now)),
    or(
      isNull(assets.processingLeaseUntil),
      lte(assets.processingLeaseUntil, now)
    ),
    // A cleanup request is only destructive after ownership is detached.
    or(eq(assets.cleanupPending, false), isNull(assets.ownerId)),
    sql`(${assets.purpose} <> 'generated' or not exists (
      select 1 from ${imageOperations}
      where ${imageOperations.id} = ${assets.id}
        and ${imageOperations.status} in ('reserved', 'dispatching', 'running', 'uncertain')
    ))`
  )
}

/** Safe periodic cleanup: never deletes public objects or archived accepted inputs. */
export async function cleanupPrivateAssets(limit = 50) {
  // A transaction lock works through Neon's pooler and releases on interruption.
  // Keep per-owner changes in their own transactions: this guard holds no asset
  // rows or usage locks while storage requests are in flight.
  return getDb().transaction(async (guard) => {
    const [lock] = await guard.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended('private-asset-cleanup', 0)) as acquired`
    )
    if (!lock?.acquired)
      return { examined: 0, cleaned: 0, skipped: 0, failed: 0 }
    return cleanupPrivateAssetBatch(limit)
  })
}

async function cleanupPrivateAssetBatch(limit: number) {
  const now = new Date()
  const rows = await getDb()
    .select({ id: assets.id })
    .from(assets)
    .where(privateCleanupEligibility(now))
    .orderBy(asc(assets.updatedAt), asc(assets.id))
    .limit(Math.min(100, Math.max(1, limit)))
  let cleaned = 0,
    skipped = 0,
    failed = 0
  for (const candidate of rows) {
    // Recheck after earlier rows' storage calls, before touching either object.
    const [row] = await getDb()
      .select()
      .from(assets)
      .where(
        and(eq(assets.id, candidate.id), privateCleanupEligibility(new Date()))
      )
    if (!row) {
      skipped++
      continue
    }
    try {
      if (row.stagingKey) await deletePrivateObject(row.stagingKey)
      if (!row.cleanupPending && row.status !== 'ready')
        await deletePrivateObject(row.objectKey)
      if (row.cleanupPending) {
        await deletePrivateObject(row.objectKey)
        await getDb()
          .delete(assets)
          .where(
            and(
              eq(assets.id, row.id),
              eq(assets.cleanupPending, true),
              isNull(assets.ownerId)
            )
          )
      } else {
        await getDb().transaction(async (tx) => {
          if (row.ownerId) {
            await lockUsageSubjects(tx, accountSubject(row.ownerId))
            await expireReservations(row.ownerId, tx, now)
          }
          await tx
            .update(assets)
            .set({ stagingKey: null, expiresAt: null })
            .where(eq(assets.id, row.id))
        })
      }
      cleaned++
    } catch {
      failed++
      // Retain the cleanup request, but let unattempted rows go first next time.
      await getDb()
        .update(assets)
        .set({ updatedAt: new Date() })
        .where(eq(assets.id, row.id))
    }
  }
  return { examined: rows.length, cleaned, skipped, failed }
}

async function requireImageOperation(
  userId: string,
  operationId: string,
  tx: Transaction
) {
  const [operation] = await tx
    .select()
    .from(imageOperations)
    .where(
      and(
        eq(imageOperations.id, operationId),
        eq(imageOperations.ownerId, userId)
      )
    )
  if (
    !operation ||
    !operation.draftId ||
    !['running', 'uncertain', 'succeeded'].includes(operation.status)
  )
    throw new AppError('This image operation is no longer active.', 410)
  const [draft] = await tx
    .select({ id: savedDrafts.id })
    .from(savedDrafts)
    .where(
      and(
        eq(savedDrafts.id, operation.draftId),
        eq(savedDrafts.ownerId, userId),
        isNull(savedDrafts.deletedAt)
      )
    )
  if (!draft) throw new AppError('This draft is no longer available.', 410)
}
/** Durable image writer. Its immutable identity also recovers a lost persistence response. */
type GeneratedAssetInput = {
  userId: string
  operationId: string
  bytes: Uint8Array
}
export async function storeGeneratedAsset(input: GeneratedAssetInput) {
  const { userId, operationId } = input
  if (!z.uuid().safeParse(operationId).success)
    throw new Error('Invalid image operation identity')
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requireAssetAccount(userId, tx)
    await requireImageOperation(userId, operationId, tx)
    await tx
      .insert(assets)
      .values({
        id: operationId,
        ownerId: userId,
        purpose: 'generated',
        visibility: 'private',
        status: 'pending',
        objectKey: `generated/${operationId}.webp`
      })
      .onConflictDoNothing()
    const [current] = await tx
      .select()
      .from(assets)
      .where(eq(assets.id, operationId))
    if (
      !current ||
      current.ownerId !== userId ||
      current.purpose !== 'generated' ||
      current.cleanupPending
    )
      throw new AppError('This image is no longer active.', 409)
  })
  return storePreauthorizedGeneratedAsset(input)
}
/** Internal worker only: its slot and generation were authorized before provider dispatch.
 * Write bytes before any database dependency so an outage cannot erase a paid result. */
export async function storePreauthorizedGeneratedAsset(
  input: GeneratedAssetInput
) {
  const { userId, operationId } = input
  if (!z.uuid().safeParse(operationId).success)
    throw new Error('Invalid image operation identity')
  const normalized = await normalizeUploadedImage(input.bytes, 'generated')
  if (normalized.width !== 1200 || normalized.height !== 640)
    throw new AppError('The generated image has unsupported dimensions.', 502)
  const key = `generated/${operationId}.webp`
  await putImmutableAsset({
    visibility: 'private',
    key,
    bytes: normalized.bytes,
    contentType: normalized.contentType
  })
  return commitGeneratedAsset(userId, operationId, {
    ...normalized,
    byteSize: normalized.bytes.byteLength
  })
}
async function commitGeneratedAsset(
  userId: string,
  operationId: string,
  normalized: {
    byteSize: number
    width: number
    height: number
    contentType: string
    sha256: string
  }
) {
  try {
    return await getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(userId))
      await requireAssetAccount(userId, tx)
      await requireImageOperation(userId, operationId, tx)
      const [current] = await tx
        .select()
        .from(assets)
        .where(and(eq(assets.id, operationId), eq(assets.ownerId, userId)))
        .for('update')
      if (!current || current.cleanupPending)
        throw new AppError('This image is no longer active.', 410)
      if (
        current.purpose !== 'generated' ||
        current.visibility !== 'private' ||
        current.objectKey !== `generated/${operationId}.webp`
      )
        throw new AppError('This image reservation is invalid.', 409)
      if (current.status === 'ready') {
        if (current.sha256 !== normalized.sha256)
          throw new AppError(
            'This operation already has a different image.',
            409
          )
        return current
      }
      const [saved] = await tx
        .update(assets)
        .set({
          status: 'ready',
          byteSize: normalized.byteSize,
          contentType: normalized.contentType,
          width: normalized.width,
          height: normalized.height,
          sha256: normalized.sha256,
          updatedAt: new Date()
        })
        .where(eq(assets.id, operationId))
        .returning()
      return saved!
    })
  } catch (err) {
    if (err instanceof AppError && [403, 410].includes(err.status)) {
      await getDb()
        .update(assets)
        .set({ ownerId: null, cleanupPending: true, status: 'failed' })
        .where(and(eq(assets.id, operationId), eq(assets.ownerId, userId)))
    }
    throw err
  }
}
/** Persist composed card bytes before the caller's publication lifecycle transaction. */
export async function persistFrozenCard(input: {
  userId: string
  presentationHash: string
  bytes: Uint8Array
}) {
  if (!/^[a-f0-9]{64}$/.test(input.presentationHash))
    throw new Error('Invalid presentation hash')
  await requirePaidAccount(input.userId)
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError('The composed card is too large.', 413)
  const metadata = await sharp(input.bytes).metadata()
  if (
    metadata.format !== 'webp' ||
    metadata.width !== 1200 ||
    metadata.height !== 630 ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error('Frozen cards must be static 1200×630 WebP')
  const identity = assetSha256(
    Buffer.from(`${input.userId}:${input.presentationHash}`)
  )
  const key = `cards/${identity}.webp`
  const stored = await putImmutableAsset({
    visibility: 'public',
    key,
    bytes: input.bytes,
    contentType: 'image/webp'
  })
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(input.userId))
    await requirePaidAccount(input.userId, tx)
    await tx
      .insert(assets)
      .values({
        ownerId: input.userId,
        purpose: 'card',
        visibility: 'public',
        status: 'ready',
        objectKey: key,
        contentType: 'image/webp',
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        width: 1200,
        height: 630
      })
      .onConflictDoNothing({ target: assets.objectKey })
    const [asset] = await tx
      .select()
      .from(assets)
      .where(eq(assets.objectKey, key))
    if (
      !asset ||
      asset.ownerId !== input.userId ||
      asset.sha256 !== stored.sha256 ||
      asset.status !== 'ready'
    )
      throw new AppError('The saved card could not be verified.', 502)
    return asset
  })
}
/** Caller must first enforce the public passage's source/deletion availability. */
export async function readFrozenCard(assetId: string) {
  const [asset] = await getDb()
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.purpose, 'card'),
        eq(assets.visibility, 'public'),
        eq(assets.status, 'ready')
      )
    )
  if (!asset || !asset.sha256)
    throw new AppError('This card is temporarily unavailable.', 503)
  const bytes = await readAssetBytes(
    'public',
    asset.objectKey,
    MAX_UPLOAD_BYTES
  ).catch(() => {
    throw new AppError('This card is temporarily unavailable.', 503)
  })
  if (assetSha256(bytes) !== asset.sha256)
    throw new AppError('This card is temporarily unavailable.', 503)
  return bytes
}

export async function loadCardArtwork(
  userId: string,
  design: import('./paid-design').ResolvedCardDesign
) {
  const media: CardArtwork = {}
  const requested: ['background' | 'logo', string, readonly string[]][] = []
  if (design.background.kind === 'asset')
    requested.push([
      'background',
      design.background.assetId,
      ['background', 'generated']
    ])
  if (design.branding.mode === 'custom')
    requested.push(['logo', design.branding.assetId, ['logo']])
  await Promise.all(
    requested.map(async ([slot, id, purposes]) => {
      const { asset, bytes } = await readOwnedAssetBytes(userId, id, purposes)
      if (
        !design.assetVersions.some(
          (version) => version.id === id && version.sha256 === asset.sha256
        )
      )
        throw new AppError('The card image changed. Reload this draft.', 409)
      media[slot] = `data:image/webp;base64,${bytes.toString('base64')}`
    })
  )
  return media
}

/** Accepts only owned image selections and proves generated-result provenance. */
export async function validateDraftDesign(
  userId: string,
  value: unknown,
  tx?: Transaction,
  previous?: DraftDesign | null
): Promise<DraftDesign> {
  const parsed = draftDesignSchema.safeParse(value)
  if (!parsed.success)
    throw new AppError(
      parsed.error.issues[0]?.message ?? 'Review the card design.'
    )
  await requirePaidAccount(userId, tx)
  const design = parsed.data
  const recipe = design.recipe
  const selections: [string | null, string | null, readonly string[]][] = [
    [
      recipe.referenceAssetId,
      previous?.recipe.referenceAssetId ?? null,
      ['reference']
    ],
    [
      recipe.branding.mode === 'custom' ? recipe.branding.assetId : null,
      previous?.recipe.branding.mode === 'custom'
        ? previous.recipe.branding.assetId
        : null,
      ['logo']
    ],
    [
      recipe.background.mode === 'uploaded' ? recipe.background.assetId : null,
      previous?.recipe.background.mode === 'uploaded'
        ? previous.recipe.background.assetId
        : null,
      ['background']
    ]
  ]
  for (const [id, oldId, purpose] of selections)
    if (id)
      await getOwnedAsset(userId, id, { purpose, active: id !== oldId, tx })
  if (design.generatedImage) {
    const result = design.generatedImage
    const [operation] = await (tx ?? getDb())
      .select()
      .from(imageOperations)
      .where(
        and(
          eq(imageOperations.id, result.operationId),
          eq(imageOperations.ownerId, userId),
          eq(imageOperations.status, 'succeeded')
        )
      )
    if (
      !operation ||
      operation.resultAssetId !== result.assetId ||
      operation.recipeHash !== result.recipeHash
    )
      throw new AppError('Choose a completed image from your account.', 403)
    await getOwnedAsset(userId, result.assetId, { purpose: ['generated'], tx })
  }
  return design
}

/** One durable rendering lease per owner/presentation; retries first recover stored bytes. */
export async function freezeCardPresentation(input: {
  userId: string
  presentationHash: string
  render: () => Promise<Uint8Array>
}) {
  const { userId, presentationHash } = input
  if (!/^[a-f0-9]{64}$/.test(presentationHash))
    throw new Error('Invalid presentation hash')
  const key = `cards/${assetSha256(Buffer.from(`${userId}:${presentationHash}`))}.webp`
  const lease = new Date(Date.now() + 120_000)
  const claim = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requirePaidAccount(userId, tx)
    const [prior] = await tx
      .select()
      .from(assets)
      .where(eq(assets.objectKey, key))
      .for('update')
    if (prior) {
      if (
        prior.ownerId !== userId ||
        prior.purpose !== 'card' ||
        prior.visibility !== 'public'
      )
        throw new AppError('The card is unavailable.', 409)
      if (prior.status === 'ready') return prior
      if (prior.processingLeaseUntil && prior.processingLeaseUntil > new Date())
        throw new AppError(
          'Your card is being saved. Try publishing again shortly.',
          409,
          3
        )
      const [updated] = await tx
        .update(assets)
        .set({
          status: 'processing',
          processingLeaseUntil: lease,
          updatedAt: new Date()
        })
        .where(eq(assets.id, prior.id))
        .returning()
      return updated!
    }
    const [created] = await tx
      .insert(assets)
      .values({
        ownerId: userId,
        purpose: 'card',
        visibility: 'public',
        status: 'processing',
        objectKey: key,
        processingLeaseUntil: lease
      })
      .returning()
    return created!
  })
  if (claim.status === 'ready') return claim
  try {
    const existing = await headAsset('public', key)
    const bytes = existing
      ? await readAssetBytes('public', key, MAX_UPLOAD_BYTES, existing.etag)
      : await input.render()
    if (!bytes.byteLength || bytes.byteLength > MAX_UPLOAD_BYTES)
      throw new AppError('The composed card is too large.', 413)
    const metadata = await sharp(bytes).metadata()
    if (
      metadata.format !== 'webp' ||
      metadata.width !== 1200 ||
      metadata.height !== 630 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Invalid composed card dimensions')
    const hash = assetSha256(bytes)
    if (existing && existing.sha256 !== hash)
      throw new AppError('The stored card could not be verified.', 502)
    if (!existing)
      await putImmutableAsset({
        visibility: 'public',
        key,
        bytes,
        contentType: 'image/webp'
      })
    return await getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(userId))
      await requirePaidAccount(userId, tx)
      const [current] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, claim.id))
        .for('update')
      if (
        !current ||
        current.ownerId !== userId ||
        current.status !== 'processing' ||
        current.processingLeaseUntil?.getTime() !== lease.getTime() ||
        lease <= new Date()
      )
        throw new AppError(
          'This card preparation changed. Try publishing again.',
          409
        )
      const [saved] = await tx
        .update(assets)
        .set({
          status: 'ready',
          byteSize: bytes.byteLength,
          contentType: 'image/webp',
          sha256: hash,
          width: 1200,
          height: 630,
          processingLeaseUntil: null,
          updatedAt: new Date()
        })
        .where(eq(assets.id, claim.id))
        .returning()
      return saved!
    })
  } catch (err) {
    await getDb()
      .update(assets)
      .set({ processingLeaseUntil: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(assets.id, claim.id),
          eq(assets.ownerId, userId),
          eq(assets.status, 'processing'),
          eq(assets.processingLeaseUntil, lease)
        )
      )
      .catch(() => {})
    throw err
  }
}

/** Recover the stored normalized object unchanged; never re-encode or dispatch a provider. */
export async function recoverGeneratedAsset(input: {
  userId: string
  operationId: string
}) {
  const verified = await verifyStoredGeneratedAsset(input.operationId)
  if (!verified) return null
  return commitGeneratedAsset(input.userId, input.operationId, verified)
}
/** Internal worker recovery only. Verifies a fixed operation object even after its owner is deleted. */
export async function verifyStoredGeneratedAsset(operationId: string) {
  if (!z.uuid().safeParse(operationId).success)
    throw new Error('Invalid image operation identity')
  const key = `generated/${operationId}.webp`
  const head = await headAsset('private', key)
  if (!head) return null
  if (
    head.contentType !== 'image/webp' ||
    !head.sha256 ||
    head.byteSize < 1 ||
    head.byteSize > MAX_UPLOAD_BYTES ||
    !head.etag
  )
    throw new AppError('The stored image could not be verified.', 502)
  const bytes = await readAssetBytes(
    'private',
    key,
    MAX_UPLOAD_BYTES,
    head.etag
  )
  if (bytes.length !== head.byteSize || assetSha256(bytes) !== head.sha256)
    throw new AppError('The stored image could not be verified.', 502)
  const metadata = await sharp(bytes, {
    limitInputPixels: 40_000_000,
    animated: true
  }).metadata()
  if (
    metadata.format !== 'webp' ||
    metadata.width !== 1200 ||
    metadata.height !== 640 ||
    (metadata.pages ?? 1) !== 1
  )
    throw new AppError('The stored image has unsupported dimensions.', 502)
  return {
    byteSize: bytes.length,
    width: metadata.width,
    height: metadata.height,
    contentType: 'image/webp',
    sha256: head.sha256
  }
}

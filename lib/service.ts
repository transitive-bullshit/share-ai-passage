import { createHash, randomUUID } from 'node:crypto'

import { and, eq, exists, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import { DEFAULT_CARD_APPEARANCE, type CardAppearance } from './card-appearance'
import { cardAppearanceSchema } from './card-appearance-schema'
import { appUrl } from './config'
import { getDb, type Transaction } from './db'
import { consumeRateLimit } from './db/rate-limit'
import {
  publications,
  rateLimits,
  snapshots,
  sources,
  type Snapshot,
  type Source
} from './db/schema'
import { limits, type ProviderResult } from './domain'
import { createDraftToken, previewHash, readDraftToken } from './drafts'
import { AppError } from './errors'
import { fetchSource, parseSourceUrl } from './providers'
import { parsePassageUrl } from './passage-urls'
import { suggestPreview } from './suggestions'
import { parseGeneratedPreview, validateGeneratedPreview } from './summary'

const leaseMs = 60_000
const preparationRetryMs = 60_000
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function retrySeconds(until: Date, now = new Date()) {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000))
}

export async function enforceBudget(
  key: string,
  limit: number,
  windowMs = limits.cooldownMs
) {
  const result = await consumeRateLimit({ key, limit, windowMs })
  if (!result.allowed) {
    throw new AppError(
      'Too many attempts. Please try again later.',
      429,
      retrySeconds(result.resetAt)
    )
  }
}

async function lockSource(tx: Transaction, id: string) {
  const [source] = await tx
    .select()
    .from(sources)
    .where(eq(sources.id, id))
    .for('update')
  if (!source) throw new AppError('This source is no longer available.', 404)
  return source
}

async function disableSource(tx: Transaction, sourceId: string, now: Date) {
  await tx
    .update(publications)
    .set({ disabledAt: now })
    .where(
      and(eq(publications.sourceId, sourceId), isNull(publications.disabledAt))
    )
  await tx
    .update(sources)
    .set({
      availability: 'unavailable',
      lastCheckedAt: now,
      lastAttemptAt: now,
      retryAfter: null,
      manualCheckAfter: new Date(now.getTime() + limits.cooldownMs),
      updatedAt: now
    })
    .where(eq(sources.id, sourceId))
  // Published readers and images use seven-day ISR. Existing cache entries may
  // continue serving until their lazy revalidation observes this disabled state.
}

function sourceReference(source: Source) {
  return {
    provider: source.provider,
    canonicalUrl: source.canonicalUrl,
    shareId: source.providerShareId
  }
}

async function safelyFetch(source: Source): Promise<ProviderResult> {
  try {
    return await fetchSource(sourceReference(source))
  } catch {
    return {
      status: 'inconclusive',
      reason: 'The provider could not be reached. Please try again later.'
    }
  }
}

export async function prepareSource(input: string) {
  const passage = parsePassageUrl(input, appUrl())
  if (passage) {
    const record = await getPublication(passage.provider, passage.publicationId)
    if (!record) throw new AppError('This passage was not found.', 404)
    if (record.disabled) throw new AppError('This passage is unavailable.', 410)
    return {
      draftToken: createDraftToken(
        record.snapshot.id,
        record.source.publicationGeneration,
        record.preview,
        Date.now(),
        record.publication.id
      ),
      provider: record.source.provider,
      sourceUrl: record.source.canonicalUrl,
      preview: record.preview,
      appearance: record.publication.appearance ?? DEFAULT_CARD_APPEARANCE
    }
  }
  let reference
  try {
    reference = parseSourceUrl(input)
  } catch (err) {
    throw new AppError(
      err instanceof Error ? err.message : 'Enter a supported public share URL.'
    )
  }
  const db = getDb()
  await db
    .insert(sources)
    .values({
      provider: reference.provider,
      canonicalUrl: reference.canonicalUrl,
      providerShareId: reference.shareId
    })
    .onConflictDoNothing({ target: sources.canonicalUrl })
  const [found] = await db
    .select()
    .from(sources)
    .where(eq(sources.canonicalUrl, reference.canonicalUrl))
  if (!found) throw new Error('Source insert failed')

  const token = randomUUID()
  const claim = await db.transaction(async (tx) => {
    const source = await lockSource(tx, found.id)
    const now = new Date()
    let snapshotToSummarize: Snapshot | undefined
    if (source.availability === 'available' && source.latestSnapshotId) {
      const [snapshot] = await tx
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, source.latestSnapshotId))
      // Only a complete content fetch advances this clock; availability checks do not.
      const capture = source.latestSnapshotVerifiedAt || snapshot?.capturedAt
      if (
        snapshot &&
        capture &&
        now.getTime() - capture.getTime() < limits.freshnessMs
      ) {
        if (snapshot.preview) return { source, snapshot, cached: true as const }
        snapshotToSummarize = snapshot
      }
    }
    if (source.preparationRetryAfter && source.preparationRetryAfter > now) {
      throw new AppError(
        'Preparation could not finish recently. Please try again shortly.',
        503,
        retrySeconds(source.preparationRetryAfter, now)
      )
    }
    const lease = [source.preparationLeaseUntil, source.checkLeaseUntil].find(
      (until) => until && until > now
    )
    if (lease)
      throw new AppError(
        'This source is already being checked. Please try again shortly.',
        409,
        retrySeconds(lease, now)
      )
    await tx
      .update(sources)
      .set({
        preparationLeaseToken: token,
        preparationLeaseUntil: new Date(now.getTime() + leaseMs),
        checkLeaseToken: null,
        checkLeaseUntil: null,
        lastAttemptAt: now,
        updatedAt: now
      })
      .where(eq(sources.id, source.id))
    return { source, snapshotToSummarize, cached: false as const }
  })

  if (claim.cached) return preparedResponse(claim.source, claim.snapshot)

  try {
    const result: ProviderResult = claim.snapshotToSummarize
      ? { status: 'available', conversation: claim.snapshotToSummarize }
      : await safelyFetch(claim.source)
    if (result.status !== 'available') {
      const retryMs =
        result.status === 'inconclusive'
          ? preparationRetryMs
          : limits.cooldownMs
      await db.transaction(async (tx) => {
        const source = await lockSource(tx, claim.source.id)
        if (source.preparationLeaseToken !== token) return
        const now = new Date()
        if (result.status === 'unavailable')
          await disableSource(tx, source.id, now)
        await tx
          .update(sources)
          .set({
            preparationLeaseToken: null,
            preparationLeaseUntil: null,
            preparationRetryAfter: new Date(now.getTime() + retryMs),
            retryAfter:
              result.status === 'inconclusive'
                ? new Date(now.getTime() + limits.cooldownMs)
                : null,
            updatedAt: now
          })
          .where(eq(sources.id, source.id))
      })
      throw new AppError(
        result.reason,
        result.status === 'unavailable' ? 410 : 422,
        retryMs / 1000
      )
    }

    const conversation = result.conversation
    if (
      !conversation.messages.length ||
      Buffer.byteLength(JSON.stringify(conversation.messages)) >
        limits.transcriptBytes
    ) {
      throw new AppError(
        'This conversation is empty or exceeds the supported 1 MiB transcript limit.',
        422
      )
    }
    const contentHash =
      claim.snapshotToSummarize?.contentHash ||
      createHash('sha256').update(JSON.stringify(conversation)).digest('hex')
    const [existing] = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.sourceId, claim.source.id),
          eq(snapshots.contentHash, contentHash)
        )
      )
    const preview = validateGeneratedPreview(
      existing?.preview || (await suggestPreview(conversation))
    )

    return await db.transaction(async (tx) => {
      const source = await lockSource(tx, claim.source.id)
      const now = new Date()
      if (
        source.preparationLeaseToken !== token ||
        !source.preparationLeaseUntil ||
        source.preparationLeaseUntil <= now
      ) {
        throw new AppError(
          'This preparation took too long. Please try again.',
          409
        )
      }
      const [snapshot] = await tx
        .insert(snapshots)
        .values({
          sourceId: source.id,
          contentHash,
          title: conversation.title,
          messages: conversation.messages,
          parserVersion: conversation.parserVersion,
          preview,
          capturedAt: now
        })
        .onConflictDoUpdate({
          target: [snapshots.sourceId, snapshots.contentHash],
          set: {
            preview: sql`coalesce(${snapshots.preview}, ${JSON.stringify(preview)}::jsonb)`
          }
        })
        .returning()
      if (!snapshot) throw new Error('Snapshot insert failed')
      const generation =
        source.publicationGeneration +
        (source.availability === 'unavailable' ? 1 : 0)
      const [updated] = await tx
        .update(sources)
        .set({
          availability: 'available',
          publicationGeneration: generation,
          latestSnapshotId: snapshot.id,
          latestSnapshotVerifiedAt: claim.snapshotToSummarize
            ? source.latestSnapshotVerifiedAt ||
              claim.snapshotToSummarize.capturedAt
            : now,
          lastCheckedAt: claim.snapshotToSummarize ? source.lastCheckedAt : now,
          retryAfter: null,
          manualCheckAfter: new Date(now.getTime() + limits.cooldownMs),
          preparationLeaseToken: null,
          preparationLeaseUntil: null,
          preparationRetryAfter: null,
          updatedAt: now
        })
        .where(eq(sources.id, source.id))
        .returning()
      if (!updated) throw new Error('Source update failed')
      return preparedResponse(updated, snapshot)
    })
  } catch (err) {
    // A failed DB/model/size operation also releases the lease and backs off.
    await db
      .update(sources)
      .set({
        preparationLeaseToken: null,
        preparationLeaseUntil: null,
        preparationRetryAfter: new Date(
          Date.now() +
            (err instanceof AppError && err.retryAfter
              ? err.retryAfter * 1000
              : limits.cooldownMs)
        )
      })
      .where(
        and(
          eq(sources.id, claim.source.id),
          eq(sources.preparationLeaseToken, token)
        )
      )
    throw err
  }
}

function preparedResponse(
  source: Source,
  snapshot: typeof snapshots.$inferSelect
) {
  const preview = validateGeneratedPreview(snapshot.preview)
  return {
    draftToken: createDraftToken(
      snapshot.id,
      source.publicationGeneration,
      preview
    ),
    provider: source.provider,
    sourceUrl: source.canonicalUrl,
    preview
  }
}

export async function getDraft(token: string) {
  const draft = readDraftToken(token)
  const [record] = await getDb()
    .select({ source: sources, snapshot: snapshots })
    .from(snapshots)
    .innerJoin(sources, eq(snapshots.sourceId, sources.id))
    .where(eq(snapshots.id, draft.snapshotId))
  if (!record)
    throw new AppError(
      'This preview has expired. Please prepare the source again.',
      410
    )
  if (
    record.source.availability !== 'available' ||
    record.source.publicationGeneration !== draft.generation
  ) {
    throw new AppError(
      'The original is no longer publicly available. Please prepare the source again.',
      410
    )
  }
  const copied = draft.publicationId
    ? await getPublication(record.source.provider, draft.publicationId)
    : null
  if (
    draft.publicationId &&
    (!copied || copied.disabled || copied.snapshot.id !== draft.snapshotId)
  ) {
    throw new AppError('This passage is unavailable.', 410)
  }
  const preview =
    copied?.preview ?? validateGeneratedPreview(record.snapshot.preview)
  if (previewHash(preview) !== draft.previewHash) {
    throw new AppError(
      'This preview has changed. Please prepare the source again.',
      410
    )
  }
  return {
    ...record,
    draft,
    preview,
    appearance: copied?.publication.appearance ?? DEFAULT_CARD_APPEARANCE
  }
}

export async function publishPreview(
  token: string,
  selectedAppearance?: CardAppearance,
  selectedPreview?: unknown
) {
  const parsed = cardAppearanceSchema.optional().safeParse(selectedAppearance)
  if (!parsed.success) throw new AppError('Choose a supported card template.')
  const edited =
    selectedPreview === undefined
      ? undefined
      : parseGeneratedPreview(selectedPreview)
  if (edited && !edited.success)
    throw new AppError(
      edited.error.issues[0]?.message ?? 'Enter a valid preview summary.'
    )
  const {
    draft,
    snapshot,
    preview: generated,
    appearance: savedAppearance
  } = await getDraft(token)
  const appearance = parsed.data ?? savedAppearance
  const preview = edited?.data ?? generated
  const db = getDb()
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        snapshotId: snapshot.id,
        parentPublicationId: draft.publicationId,
        ...preview,
        appearance,
        cardVersion: 4
      })
    )
    .digest('hex')
  const publication = await db.transaction(async (tx) => {
    const source = await lockSource(tx, snapshot.sourceId)
    if (
      source.availability !== 'available' ||
      source.publicationGeneration !== draft.generation
    ) {
      throw new AppError(
        'The original is no longer publicly available. Please prepare the source again.',
        410
      )
    }
    const [created] = await tx
      .insert(publications)
      .values({
        sourceId: source.id,
        snapshotId: snapshot.id,
        fingerprint,
        generation: draft.generation,
        title: preview.title,
        highlights: preview.highlights,
        appearance,
        cardVersion: 4
      })
      .onConflictDoNothing({
        target: [
          publications.sourceId,
          publications.generation,
          publications.fingerprint
        ]
      })
      .returning()
    const record =
      created ||
      (
        await tx
          .select()
          .from(publications)
          .where(
            and(
              eq(publications.sourceId, source.id),
              eq(publications.generation, draft.generation),
              eq(publications.fingerprint, fingerprint)
            )
          )
      )[0]
    if (!record || record.disabledAt)
      throw new AppError('This passage is unavailable.', 410)
    return { ...record, provider: source.provider }
  })
  return {
    publicationId: publication.id,
    shareUrl: `${appUrl()}/${publication.provider}/${publication.id}`
  }
}

export async function getPublication(provider: string, id: string) {
  if (!uuidPattern.test(id) || !['chatgpt', 'claude'].includes(provider))
    return null
  const [record] = await getDb()
    .select({ publication: publications, source: sources, snapshot: snapshots })
    .from(publications)
    .innerJoin(sources, eq(publications.sourceId, sources.id))
    .innerJoin(snapshots, eq(publications.snapshotId, snapshots.id))
    .where(eq(publications.id, id))
  if (!record || record.source.provider !== provider) return null
  const disabled =
    !!record.publication.disabledAt ||
    record.source.availability !== 'available'
  const preview = validateGeneratedPreview({
    title: record.publication.title,
    highlights: record.publication.highlights
  })
  return { ...record, preview, disabled }
}

export async function checkAvailability(
  sourceId: string,
  mode: 'automatic' | 'manual'
) {
  const db = getDb()
  const token = randomUUID()
  const claim = await db.transaction(async (tx) => {
    const source = await lockSource(tx, sourceId)
    const now = new Date()
    if (source.availability === 'unavailable')
      return {
        source,
        shouldCheck: false,
        message:
          'The original is unavailable. This passage remains unavailable.'
      }
    const nextAllowed = [
      source.retryAfter,
      source.checkLeaseUntil,
      source.preparationLeaseUntil,
      ...(mode === 'manual' ? [source.manualCheckAfter] : [])
    ].find((date) => date && date > now)
    if (nextAllowed)
      return {
        source,
        shouldCheck: false,
        message:
          'This source was checked recently or is being checked. Please try again later.'
      }
    if (
      mode === 'automatic' &&
      source.lastCheckedAt &&
      now.getTime() - source.lastCheckedAt.getTime() < limits.freshnessMs
    ) {
      return {
        source,
        shouldCheck: false,
        message: 'The last availability check is still current.'
      }
    }
    await tx
      .update(sources)
      .set({
        checkLeaseToken: token,
        checkLeaseUntil: new Date(now.getTime() + leaseMs),
        lastAttemptAt: now,
        retryAfter: new Date(now.getTime() + limits.cooldownMs),
        manualCheckAfter: new Date(now.getTime() + limits.cooldownMs),
        updatedAt: now
      })
      .where(eq(sources.id, source.id))
    return { source, shouldCheck: true, message: '' }
  })
  if (!claim.shouldCheck)
    return {
      status:
        claim.source.availability === 'unavailable'
          ? 'unavailable'
          : 'cooldown',
      message: claim.message
    }

  const result = await safelyFetch(claim.source)
  return db.transaction(async (tx) => {
    const source = await lockSource(tx, sourceId)
    const now = new Date()
    if (
      source.checkLeaseToken !== token ||
      !source.checkLeaseUntil ||
      source.checkLeaseUntil <= now
    ) {
      return {
        status: 'cooldown',
        message: 'This check expired or a newer check has already completed.'
      }
    }
    if (result.status === 'unavailable') await disableSource(tx, sourceId, now)
    await tx
      .update(sources)
      .set({
        checkLeaseToken: null,
        checkLeaseUntil: null,
        lastCheckedAt:
          result.status === 'inconclusive' ? source.lastCheckedAt : now,
        retryAfter:
          result.status === 'inconclusive'
            ? new Date(now.getTime() + limits.cooldownMs)
            : null,
        updatedAt: now
      })
      .where(eq(sources.id, sourceId))
    return {
      status: result.status,
      message:
        result.status === 'available'
          ? 'The original is publicly available. Your saved conversation is unchanged.'
          : result.status === 'unavailable'
            ? 'The original is no longer public. Its passages and cards are now disabled.'
            : 'The provider could not confirm availability. The saved conversation remains available; please try again later.'
    }
  })
}

/** Small, request-driven cleanup: never deletes a published snapshot. */
export async function cleanupPreparations() {
  const budget = await consumeRateLimit({
    key: 'maintenance:cleanup',
    limit: 1,
    windowMs: limits.cooldownMs
  })
  if (!budget.allowed) return
  const db = getDb()
  const cutoff = new Date(Date.now() - limits.freshnessMs)
  await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date()))
  // Cap each pass. Lock sources first in the same order as publication, so a
  // simultaneous publish cannot lose its snapshot during cleanup.
  const abandoned = db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.sourceId, sources.id),
        lt(snapshots.capturedAt, cutoff),
        notExists(
          db
            .select({ id: publications.id })
            .from(publications)
            .where(eq(publications.snapshotId, snapshots.id))
        )
      )
    )
  const candidates = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        lt(sources.updatedAt, cutoff),
        or(
          exists(abandoned),
          notExists(
            db
              .select({ id: snapshots.id })
              .from(snapshots)
              .where(eq(snapshots.sourceId, sources.id))
          )
        )
      )
    )
    .limit(25)
  for (const { id } of candidates) {
    await db.transaction(async (tx) => {
      const source = await lockSource(tx, id)
      if (
        source.updatedAt >= cutoff ||
        (source.preparationLeaseUntil &&
          source.preparationLeaseUntil > new Date())
      )
        return
      await tx
        .delete(snapshots)
        .where(
          and(
            eq(snapshots.sourceId, id),
            lt(snapshots.capturedAt, cutoff),
            notExists(
              tx
                .select({ id: publications.id })
                .from(publications)
                .where(eq(publications.snapshotId, snapshots.id))
            )
          )
        )
      await tx
        .delete(sources)
        .where(
          and(
            eq(sources.id, id),
            notExists(
              tx
                .select({ id: snapshots.id })
                .from(snapshots)
                .where(eq(snapshots.sourceId, id))
            )
          )
        )
    })
  }
}

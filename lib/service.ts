import { createHash, randomUUID } from 'node:crypto'

import { and, eq, exists, isNull, lt, notExists, or, sql } from 'drizzle-orm'

import type { Actor } from './actors'
import { requireOwnedActor } from './actors'
import {
  freezeCardPresentation,
  loadCardArtwork,
  resolveOwnedCardDesign
} from './assets'
import { requirePaidAccount } from './billing'
import { renderCard } from './card'
import { lockUsageSubjects } from './usage'
import { generateSummary } from './summary-generation'
import { DEFAULT_CARD_APPEARANCE, type CardAppearance } from './card-appearance'
import { cardAppearanceSchema } from './card-appearance-schema'
import { appUrl } from './config'
import { captureConversationImages } from './conversation-images'
import { getDb, type Transaction } from './db'
import { consumeRateLimit } from './db/rate-limit'
import {
  authUsers,
  savedDrafts,
  generationOperations,
  publications,
  rateLimits,
  snapshots,
  sources,
  type SavedDraft,
  type Snapshot,
  type Source
} from './db/schema'
import { limits, type GeneratedPreview, type ProviderResult } from './domain'
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
  // Readers use seven-day ISR and images use 30-day ISR. Existing cache entries
  // may continue serving until their lazy revalidation observes this state.
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

export type PreparationContext = {
  actor: Actor
  requestKey: string
  requestSubjectKey?: string
  draftId?: string
  onSnapshot?: (source: Source, snapshot: Snapshot) => Promise<void>
}

export async function prepareSource(
  input: string,
  context?: PreparationContext
) {
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
        !/^(codex-public-json-v[1-3]|(?:chatgpt|claude)-public-json-v2)$/.test(
          snapshot.parserVersion
        ) &&
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

    const conversation = claim.snapshotToSummarize
      ? result.conversation
      : await captureConversationImages(
          result.conversation,
          sourceReference(claim.source)
        )
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
    // Persist captured input before dispatch, so interrupted work can resume the
    // same operation without re-fetching or changing its identity.
    const captured = await db.transaction(async (tx) => {
      const source = await lockSource(tx, claim.source.id)
      if (source.preparationLeaseToken !== token)
        throw new AppError('This preparation was superseded.', 409)
      const now = new Date()
      const [inserted] = await tx
        .insert(snapshots)
        .values({
          sourceId: source.id,
          contentHash,
          title: conversation.title,
          messages: conversation.messages,
          parserVersion: conversation.parserVersion,
          capturedAt: now
        })
        .onConflictDoNothing({
          target: [snapshots.sourceId, snapshots.contentHash]
        })
        .returning()
      const snapshot = inserted || existing
      if (!snapshot) throw new Error('Snapshot insert failed')
      const [updated] = await tx
        .update(sources)
        .set({
          availability: 'available',
          publicationGeneration:
            source.publicationGeneration +
            (source.availability === 'unavailable' ? 1 : 0),
          latestSnapshotId: snapshot.id,
          latestSnapshotVerifiedAt: claim.snapshotToSummarize
            ? source.latestSnapshotVerifiedAt || snapshot.capturedAt
            : now,
          updatedAt: now
        })
        .where(eq(sources.id, source.id))
        .returning()
      return { source: updated!, snapshot }
    })
    await context?.onSnapshot?.(captured.source, captured.snapshot)
    const preview = validateGeneratedPreview(
      existing?.preview ||
        (context
          ? (
              await generateSummary(conversation, {
                ownerId: context.actor.userId,
                subjectKey: context.actor.subjectKey,
                requestSubjectKey: context.requestSubjectKey,
                allowance: context.actor.allowance,
                requestKey: context.requestKey,
                inputHash: contentHash,
                snapshotId: captured.snapshot.id,
                draftId: context.draftId,
                draftRevision: context.draftId ? 0 : null
              })
            ).preview
          : await suggestPreview(conversation))
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
    // Account limits and stale/forbidden requests must not lock out other sharers
    // of this public source. Only shared preparation failures get a cooldown.
    const callerFailure =
      err instanceof AppError &&
      (Boolean(err.details) || [401, 403, 404, 409].includes(err.status))
    await db
      .update(sources)
      .set({
        preparationLeaseToken: null,
        preparationLeaseUntil: null,
        preparationRetryAfter: callerFailure
          ? null
          : new Date(
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

export async function getDraft(token: string, actor?: Actor) {
  const draft = readDraftToken(token)
  let saved: typeof savedDrafts.$inferSelect | undefined
  if (draft.savedDraftId) {
    if (!actor) throw new AppError('Sign in to open this draft.', 401)
    requireOwnedActor(actor)
    ;[saved] = await getDb()
      .select()
      .from(savedDrafts)
      .where(
        and(
          eq(savedDrafts.id, draft.savedDraftId),
          eq(savedDrafts.ownerId, actor.userId),
          isNull(savedDrafts.deletedAt)
        )
      )
    if (!saved) throw new AppError('Draft not found.', 404)
    if (
      saved.revision !== draft.revision ||
      saved.snapshotId !== draft.snapshotId
    )
      throw new AppError(
        'This draft changed. Reload the latest saved revision.',
        409
      )
  }
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
  const copied =
    !saved && draft.publicationId
      ? await getPublication(record.source.provider, draft.publicationId)
      : null
  if (
    !saved &&
    draft.publicationId &&
    (!copied || copied.disabled || copied.snapshot.id !== draft.snapshotId)
  ) {
    throw new AppError('This passage is unavailable.', 410)
  }
  const preview = saved
    ? { title: saved.title, highlights: saved.highlights }
    : (copied?.preview ?? validateGeneratedPreview(record.snapshot.preview))
  if (previewHash(preview) !== draft.previewHash) {
    throw new AppError(
      'This preview has changed. Please prepare the source again.',
      410
    )
  }
  return {
    ...record,
    draft,
    saved,
    preview,
    design: saved?.design ?? null,
    appearance:
      saved?.appearance ??
      copied?.publication.appearance ??
      DEFAULT_CARD_APPEARANCE
  }
}

export async function publishPreview(
  token: string,
  selectedAppearance?: CardAppearance,
  selectedPreview?: unknown,
  actor?: Actor
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
    saved,
    snapshot,
    preview: generated,
    appearance: savedAppearance
  } = await getDraft(token, actor)
  const appearance = parsed.data ?? savedAppearance
  const preview = validateGeneratedPreview(edited?.data ?? generated)
  // Legacy tokens retain their original anonymous capability; login never claims them.
  const dedupeScope = saved?.namespace ?? 'legacy'
  const ownerId = saved?.ownerId ?? null
  if (
    saved &&
    (previewHash(preview) !==
      previewHash(validateGeneratedPreview(generated)) ||
      JSON.stringify(appearance) !== JSON.stringify(savedAppearance))
  ) {
    throw new AppError(
      'Save your reviewed changes before publishing this draft.',
      409
    )
  }
  if (saved?.design) {
    if (!actor) throw new AppError('Sign in to publish this saved design.', 401)
    return publishPaidPreview(saved, snapshot, preview, appearance, actor)
  }
  const db = getDb()
  const contentFingerprint = createHash('sha256')
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
  // Preserve the old writer's hash exactly for legacy capabilities. Owned work
  // has a stable namespace even after its guest account is merged or removed.
  const fingerprint =
    dedupeScope === 'legacy'
      ? contentFingerprint
      : `${dedupeScope}:${contentFingerprint}`
  const publication = await db.transaction(async (tx) => {
    if (saved && actor) {
      await lockUsageSubjects(tx, actor.subjectKey)
      const [user] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, saved.ownerId))
      const [current] = await tx
        .select()
        .from(savedDrafts)
        .where(eq(savedDrafts.id, saved.id))
        .for('update')
      if (
        !user ||
        user.deletionRequestedAt ||
        !current ||
        current.deletedAt ||
        current.ownerId !== actor.userId
      )
        throw new AppError('Draft not found.', 404)
      if (current.revision !== saved.revision)
        throw new AppError('This draft changed. Reload before publishing.', 409)
    }
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
        ownerId,
        dedupeScope,
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
              eq(publications.dedupeScope, dedupeScope),
              isNull(publications.deletedAt),
              eq(publications.sourceId, source.id),
              eq(publications.generation, draft.generation),
              eq(publications.fingerprint, fingerprint)
            )
          )
      )[0]
    if (!record || record.disabledAt)
      throw new AppError('This passage is unavailable.', 410)
    if (saved)
      await tx
        .update(savedDrafts)
        .set({ publishedPublicationId: record.id })
        .where(eq(savedDrafts.id, saved.id))
    return { ...record, provider: source.provider }
  })
  return {
    publicationId: publication.id,
    shareUrl: `${appUrl()}/${publication.provider}/${publication.id}`
  }
}

async function publishPaidPreview(
  saved: SavedDraft,
  snapshot: Snapshot,
  preview: GeneratedPreview,
  appearance: CardAppearance,
  actor: Actor
) {
  requireOwnedActor(actor)
  if (!saved.design || saved.ownerId !== actor.userId)
    throw new AppError('Draft not found.', 404)
  const db = getDb()
  async function lockCurrent(tx: Transaction) {
    await lockUsageSubjects(tx, actor.subjectKey)
    await requirePaidAccount(saved.ownerId, tx)
    const [current] = await tx
      .select()
      .from(savedDrafts)
      .where(eq(savedDrafts.id, saved.id))
      .for('update')
    if (!current || current.deletedAt || current.ownerId !== actor.userId)
      throw new AppError('Draft not found.', 404)
    if (
      current.revision !== saved.revision ||
      current.snapshotId !== snapshot.id ||
      !current.design
    )
      throw new AppError('This draft changed. Reload before publishing.', 409)
    const source = await lockSource(tx, snapshot.sourceId)
    if (
      source.availability !== 'available' ||
      source.publicationGeneration !== saved.sourceGeneration
    )
      throw new AppError(
        'The original is no longer publicly available. Please prepare the source again.',
        410
      )
    return source
  }
  const resolved = await db.transaction(async (tx) => {
    await lockCurrent(tx)
    return resolveOwnedCardDesign(saved.ownerId, saved.design!, {
      tx,
      frozen: saved.resolvedDesign
    })
  })
  const contentFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        snapshotId: snapshot.id,
        parentPublicationId: saved.parentPublicationId,
        ...preview,
        appearance,
        recipe: saved.design.recipe,
        resolvedDesign: resolved,
        cardVersion: 5
      })
    )
    .digest('hex')
  const fingerprint = `${saved.namespace}:${contentFingerprint}`
  async function findExisting(tx: Transaction) {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.dedupeScope, saved.namespace),
          eq(publications.sourceId, snapshot.sourceId),
          eq(publications.generation, saved.sourceGeneration!),
          eq(publications.fingerprint, fingerprint),
          isNull(publications.deletedAt)
        )
      )
    if (publication?.disabledAt)
      throw new AppError('This passage is unavailable.', 410)
    return publication
  }
  const reused = await db.transaction(async (tx) => {
    const source = await lockCurrent(tx)
    const publication = await findExisting(tx)
    if (!publication) return null
    if (!publication.cardAssetId)
      throw new AppError('This saved card is temporarily unavailable.', 503)
    await tx
      .update(savedDrafts)
      .set({ publishedPublicationId: publication.id })
      .where(eq(savedDrafts.id, saved.id))
    return {
      publicationId: publication.id,
      shareUrl: `${appUrl()}/${source.provider}/${publication.id}`
    }
  })
  if (reused) return reused
  const card = await freezeCardPresentation({
    userId: saved.ownerId,
    presentationHash: contentFingerprint,
    render: async () => {
      const artwork = await loadCardArtwork(saved.ownerId, resolved)
      const [source] = await db
        .select({ provider: sources.provider })
        .from(sources)
        .where(eq(sources.id, snapshot.sourceId))
      if (!source)
        throw new AppError('The original is no longer available.', 410)
      const response = await renderCard(
        { ...preview, provider: source.provider },
        appearance,
        resolved,
        artwork
      )
      return new Uint8Array(await response.arrayBuffer())
    }
  })
  const result = await db.transaction(async (tx) => {
    const source = await lockCurrent(tx)
    await resolveOwnedCardDesign(saved.ownerId, saved.design!, {
      tx,
      frozen: resolved
    })
    const [created] = await tx
      .insert(publications)
      .values({
        ownerId: saved.ownerId,
        dedupeScope: saved.namespace,
        sourceId: snapshot.sourceId,
        snapshotId: snapshot.id,
        fingerprint,
        generation: saved.sourceGeneration!,
        title: preview.title,
        highlights: preview.highlights,
        appearance,
        design: saved.design,
        resolvedDesign: resolved,
        cardAssetId: card.id,
        cardVersion: 5
      })
      .onConflictDoNothing({
        target: [
          publications.sourceId,
          publications.generation,
          publications.fingerprint
        ]
      })
      .returning()
    const publication = created ?? (await findExisting(tx))
    if (!publication || publication.disabledAt)
      throw new AppError('This passage is unavailable.', 410)
    await tx
      .update(savedDrafts)
      .set({ publishedPublicationId: publication.id })
      .where(eq(savedDrafts.id, saved.id))
    return {
      publicationId: publication.id,
      shareUrl: `${appUrl()}/${source.provider}/${publication.id}`
    }
  })
  return result
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
    !!record.publication.deletedAt ||
    !!record.publication.disabledAt ||
    record.source.availability !== 'available'
  const preview = validateGeneratedPreview({
    title: record.publication.title,
    highlights: record.publication.highlights
  })
  const { design: _privateDesign, ...publication } = record.publication
  return { ...record, publication, preview, disabled }
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
        notExists(
          db
            .select({ id: savedDrafts.id })
            .from(savedDrafts)
            .where(eq(savedDrafts.sourceId, sources.id))
        ),
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
        (
          await tx
            .select({ id: savedDrafts.id })
            .from(savedDrafts)
            .where(eq(savedDrafts.sourceId, id))
            .limit(1)
        ).length > 0 ||
        source.updatedAt >= cutoff ||
        (source.preparationLeaseUntil &&
          source.preparationLeaseUntil > new Date())
      )
        return
      await tx.delete(snapshots).where(
        and(
          eq(snapshots.sourceId, id),
          lt(snapshots.capturedAt, cutoff),
          notExists(
            tx
              .select({ id: generationOperations.id })
              .from(generationOperations)
              .where(
                and(
                  eq(generationOperations.snapshotId, snapshots.id),
                  or(
                    eq(generationOperations.status, 'reserved'),
                    eq(generationOperations.status, 'running'),
                    eq(generationOperations.status, 'uncertain')
                  )
                )
              )
          ),
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

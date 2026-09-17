import { createHash } from 'node:crypto'

import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { accountSubject } from './accounts'
import { requireOwnedActor, requireRegisteredActor, type Actor } from './actors'
import {
  assetAccess,
  resolveOwnedCardDesign,
  validateDraftDesign
} from './assets'
import { readEntitlements, requirePaidAccount } from './billing'
import { draftDesignSchema, type DraftDesign } from './paid-design'
import { defaultDraftDesign, snapshotTemplate } from './templates'
import { DEFAULT_CARD_APPEARANCE, type CardAppearance } from './card-appearance'
import { cardAppearanceSchema } from './card-appearance-schema'
import { appUrl } from './config'
import { getDb, type Transaction } from './db'
import {
  accountPreferences,
  authUsers,
  generationOperations,
  imageOperations,
  publications,
  savedDrafts,
  snapshots,
  sources,
  type SavedDraft
} from './db/schema'
import { limits } from './domain'
import { createDraftToken, readDraftToken } from './drafts'
import { AppError } from './errors'
import {
  getDraft,
  getPublication,
  prepareSource,
  publishPreview
} from './service'
import { generateSummary } from './summary-generation'
import {
  cancelUndispatchedSummaries,
  getSummaryUsage,
  lockUsageSubjects
} from './usage'
import { usageLimitError } from './usage-policy'
import { aiSpendingPause } from './ai-spending-policy'

export const draftEditSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  // Autosave permits unfinished text. Publication applies the full summary schema.
  preview: z.strictObject({
    title: z.string().max(limits.title * 2),
    highlights: z
      .array(z.string().max(limits.highlight * 2))
      .max(limits.highlights)
  }),
  appearance: cardAppearanceSchema,
  design: draftDesignSchema.nullable().optional()
})

async function liveUser(tx: Transaction, userId: string) {
  const [user] = await tx
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, userId))
  if (!user || user.deletionRequestedAt)
    throw new AppError('Your account is unavailable.', 403)
  return user
}

async function ownedDraft(tx: Transaction, actor: Actor, id: string) {
  requireOwnedActor(actor)
  await lockUsageSubjects(tx, actor.subjectKey)
  await liveUser(tx, actor.userId)
  const [draft] = await tx
    .select()
    .from(savedDrafts)
    .where(
      and(
        eq(savedDrafts.id, id),
        eq(savedDrafts.ownerId, actor.userId),
        isNull(savedDrafts.deletedAt)
      )
    )
    .for('update')
  if (!draft) throw new AppError('Draft not found.', 404)
  return draft
}

function sameRevision(draft: SavedDraft, revision: number) {
  if (draft.publishedPublicationId)
    throw new AppError(
      'This passage is published. Create a revision to make changes.',
      409
    )
  if (draft.revision !== revision)
    throw new AppError(
      'This draft changed in another tab or device. Reload the saved version before continuing.',
      409
    )
}

function tokenFor(draft: SavedDraft) {
  if (!draft.snapshotId || draft.sourceGeneration === null)
    throw new AppError('This draft is still being prepared.', 409)
  return createDraftToken(
    draft.snapshotId,
    draft.sourceGeneration,
    { title: draft.title, highlights: draft.highlights },
    Date.now(),
    draft.parentPublicationId ?? undefined,
    { savedDraftId: draft.id, revision: draft.revision }
  )
}

type DraftArtwork = { background?: string; logo?: string }

async function present(draft: SavedDraft, actor: Actor) {
  if (draft.status !== 'ready') {
    const generationBlock = await pendingGenerationBlock(draft, actor)
    return {
      draftId: draft.id,
      revision: draft.revision,
      status: draft.status,
      preparationActive:
        draft.status === 'preparing' &&
        Boolean(draft.preparationRunId || draft.preparationEnqueueLeaseUntil),
      errorMessage: generationBlock?.message ?? draft.errorMessage,
      generationBlock
    }
  }
  const draftToken = tokenFor(draft)
  const record = await getDraft(draftToken, actor)
  if (draft.publishedPublicationId) {
    const published = await getPublication(
      record.source.provider,
      draft.publishedPublicationId
    )
    if (!published || published.disabled)
      throw new AppError('This passage is unavailable.', 410)
    record.preview = published.preview
  }
  const [entitlements, resolved] = await Promise.all([
    actor.registered && actor.userId ? readEntitlements(actor.userId) : null,
    draft.design
      ? resolveOwnedCardDesign(draft.ownerId, draft.design, {
          frozen: draft.resolvedDesign
        })
      : null
  ])
  const resolvedDesign = resolved
  const artwork: DraftArtwork = {}
  if (resolvedDesign) {
    await Promise.all([
      resolvedDesign.background.kind === 'asset'
        ? assetAccess(draft.ownerId, resolvedDesign.background.assetId).then(
            (access) => {
              artwork.background = access.url
            }
          )
        : undefined,
      resolvedDesign.branding.mode === 'custom'
        ? assetAccess(draft.ownerId, resolvedDesign.branding.assetId).then(
            (access) => {
              artwork.logo = access.url
            }
          )
        : undefined
    ])
  }
  return {
    draftId: draft.id,
    revision: draft.revision,
    status: draft.publishedPublicationId
      ? ('published' as const)
      : ('ready' as const),
    shareUrl: draft.publishedPublicationId
      ? `${appUrl()}/${record.source.provider}/${draft.publishedPublicationId}`
      : undefined,
    draftToken,
    provider: record.source.provider,
    sourceUrl: record.source.canonicalUrl,
    preview: record.preview,
    appearance: draft.appearance,
    design: draft.design,
    resolvedDesign,
    artwork,
    canCustomize: entitlements?.paidActions ?? false
  }
}

async function pendingGenerationBlock(draft: SavedDraft, actor: Actor) {
  if (draft.status === 'ready' || !draft.snapshotId) return
  const db = getDb()
  const [[operation], [snapshot]] = await Promise.all([
    db
      .select({ id: generationOperations.id })
      .from(generationOperations)
      .where(eq(generationOperations.draftId, draft.id))
      .limit(1),
    db
      .select({ preview: snapshots.preview })
      .from(snapshots)
      .where(eq(snapshots.id, draft.snapshotId))
  ])
  // A reserved generation or reusable result needs no new allowance. Checking
  // current usage also clears an old block after reset, signup, or a refund.
  if (operation || !snapshot || snapshot.preview) return
  const usage = await getSummaryUsage(actor.subjectKey, actor.allowance)
  if (usage.remaining > 0 && !usage.generationPaused) return
  const error =
    usage.generationPauseCode === 'AI_SPEND_LIMIT'
      ? aiSpendingPause({ scope: 'subscription', resetAt: usage.resetAt })
      : usageLimitError(
          usage.resetAt,
          new Date(),
          usage.generationPauseCode === 'SUMMARY_BUDGET_LIMIT'
            ? 'service'
            : usage.generationPaused
        )
  return {
    ...error.details!,
    message: error.message,
    canSignUp: !actor.registered && !usage.generationPaused
  }
}

export async function readSavedDraft(actor: Actor, id: string) {
  const draft = await getDb().transaction((tx) => ownedDraft(tx, actor, id))
  return present(draft, actor)
}

/** Finish work across a guest import, but never after draft/account deletion. */
async function finishDraft(
  id: string,
  update: (tx: Transaction, draft: SavedDraft) => Promise<SavedDraft>
) {
  for (;;) {
    const [before] = await getDb()
      .select()
      .from(savedDrafts)
      .where(eq(savedDrafts.id, id))
    if (!before || before.deletedAt) throw new AppError('Draft not found.', 404)
    const result = await getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(before.ownerId))
      const [draft] = await tx
        .select()
        .from(savedDrafts)
        .where(eq(savedDrafts.id, id))
        .for('update')
      if (!draft || draft.deletedAt) throw new AppError('Draft not found.', 404)
      if (draft.ownerId !== before.ownerId) return null
      await liveUser(tx, draft.ownerId)
      return update(tx, draft)
    })
    if (result) return result
  }
}

export async function createSavedDraft(
  actor: Actor,
  input: {
    url: string
    requestKey: string
    appearance?: CardAppearance
    templateId?: string
  }
) {
  const draft = await allocateSavedDraft(actor, input)
  return prepareSavedDraft(actor, draft)
}

/** Allocate the owned identity before any provider fetching or model work. */
export async function createPendingSavedDraft(
  actor: Actor,
  input: Parameters<typeof createSavedDraft>[1]
) {
  return present(await allocateSavedDraft(actor, input), actor)
}

async function allocateSavedDraft(
  actor: Actor,
  input: Parameters<typeof createSavedDraft>[1]
) {
  requireOwnedActor(actor)
  const draft = await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, actor.subjectKey)
    await liveUser(tx, actor.userId)
    const matches = await tx
      .select()
      .from(savedDrafts)
      .where(
        and(
          eq(savedDrafts.ownerId, actor.userId),
          eq(savedDrafts.requestKey, input.requestKey)
        )
      )
    const existing =
      matches.find((candidate) => candidate.namespace === actor.subjectKey) ??
      (matches.length === 1 ? matches[0] : undefined)
    if (!existing && matches.length > 1)
      throw new AppError('Choose the draft from My passages to resume it.', 409)
    if (existing) {
      if (existing.sourceUrl !== input.url || existing.deletedAt)
        throw new AppError(
          'This creation request was already used. Start a new draft.',
          409
        )
      return existing
    }
    const [preferences] = await tx
      .select()
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, actor.userId))
    let design: DraftDesign | null = null
    if (input.templateId) {
      await requirePaidAccount(actor.userId, tx)
      design = await snapshotTemplate(actor.userId, input.templateId, tx)
    } else if (actor.registered) {
      design = await defaultDraftDesign(actor.userId, tx)
    }
    const [created] = await tx
      .insert(savedDrafts)
      .values({
        ownerId: actor.userId,
        namespace: actor.subjectKey,
        requestKey: input.requestKey,
        sourceUrl: input.url,
        appearance: design
          ? { templateId: design.recipe.baseStyle }
          : (input.appearance ??
            preferences?.appearance ??
            DEFAULT_CARD_APPEARANCE),
        design
      })
      .returning()
    return created!
  })
  return draft
}

async function prepareSavedDraft(
  actor: Actor,
  draft: SavedDraft,
  background = false
) {
  if (draft.status !== 'preparing') return present(draft, actor)
  try {
    const result = await prepareSource(draft.sourceUrl, {
      actor,
      requestKey: `prepare:${draft.requestKey}`,
      requestSubjectKey: draft.namespace,
      draftId: draft.id,
      onSnapshot: async (source, snapshot) => {
        await finishDraft(draft.id, async (tx, current) => {
          const [updated] = await tx
            .update(savedDrafts)
            .set({
              sourceId: source.id,
              snapshotId: snapshot.id,
              sourceGeneration: source.publicationGeneration,
              updatedAt: new Date()
            })
            .where(eq(savedDrafts.id, current.id))
            .returning()
          return updated!
        })
      }
    })
    const capability = readDraftToken(result.draftToken)
    const record = await getDraft(result.draftToken)
    const saved = await finishDraft(draft.id, async (tx, current) => {
      if (current.status === 'ready') return current
      const [original] = capability.publicationId
        ? await tx
            .select({
              ownerId: publications.ownerId,
              design: publications.design,
              resolvedDesign: publications.resolvedDesign
            })
            .from(publications)
            .where(eq(publications.id, capability.publicationId))
        : []
      const ownCopy = original?.ownerId === current.ownerId
      const [updated] = await tx
        .update(savedDrafts)
        .set({
          sourceId: record.source.id,
          snapshotId: capability.snapshotId,
          sourceGeneration: capability.generation,
          parentPublicationId: capability.publicationId ?? null,
          title: result.preview.title,
          highlights: result.preview.highlights,
          appearance: ownCopy
            ? (('appearance' in result ? result.appearance : undefined) ??
              current.appearance)
            : current.appearance,
          design: ownCopy ? original!.design : current.design,
          resolvedDesign: ownCopy
            ? original!.resolvedDesign
            : current.resolvedDesign,
          status: 'ready',
          errorMessage: null,
          updatedAt: new Date()
        })
        .where(eq(savedDrafts.id, draft.id))
        .returning()
      return updated!
    })
    return present(saved, actor)
  } catch (err) {
    if (background) throw err
    // Replays retain the same request key. Source leases and the durable operation
    // prevent a second dispatch when completion is uncertain.
    const message =
      err instanceof AppError
        ? err.message
        : 'Preparation was interrupted. Resume this draft to check its saved result.'
    await finishDraft(draft.id, async (tx, current) => {
      if (current.status === 'ready') return current
      const [updated] = await tx
        .update(savedDrafts)
        .set({ errorMessage: message, updatedAt: new Date() })
        .where(eq(savedDrafts.id, draft.id))
        .returning()
      return updated!
    }).catch(() => {})
    throw err
  }
}

/** Load current ownership: a guest may have registered since queue submission. */
export async function loadDraftPreparation(id: string) {
  const [draft] = await getDb()
    .select()
    .from(savedDrafts)
    .where(and(eq(savedDrafts.id, id), isNull(savedDrafts.deletedAt)))
  if (!draft) throw new AppError('Draft not found.', 404)
  const [user] = await getDb()
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, draft.ownerId))
  if (!user || user.deletionRequestedAt)
    throw new AppError('Your account is unavailable.', 403)
  const registered = user.emailVerified && !user.isAnonymous
  if (!user.isAnonymous && !registered)
    throw new AppError('Verify your email to continue.', 403)
  const actor: Actor & { userId: string } = {
    userId: user.id,
    subjectKey: accountSubject(user.id),
    allowance: registered ? 25 : 5,
    registered
  }
  return { actor, draft }
}

export async function prepareDraftInBackground(id: string) {
  const { actor, draft } = await loadDraftPreparation(id)
  return prepareSavedDraft(actor, draft, true)
}

export async function failDraftPreparation(id: string, message?: string) {
  await finishDraft(id, async (tx, draft) => {
    if (draft.status !== 'preparing') return draft
    const [updated] = await tx
      .update(savedDrafts)
      .set({
        status: 'failed',
        errorMessage:
          message ??
          'We couldn’t prepare this passage. Please try again in a moment.',
        updatedAt: new Date()
      })
      .where(eq(savedDrafts.id, id))
      .returning()
    return updated!
  })
}

export async function queueSavedDraftResume(actor: Actor, id: string) {
  const draft = await getDb().transaction(async (tx) => {
    const current = await ownedDraft(tx, actor, id)
    if (current.status !== 'failed') return current
    const [updated] = await tx
      .update(savedDrafts)
      .set({
        status: 'preparing',
        errorMessage: null,
        preparationRunId: null,
        preparationEnqueueLeaseUntil: null,
        updatedAt: new Date()
      })
      .where(eq(savedDrafts.id, id))
      .returning()
    return updated!
  })
  return present(draft, actor)
}

export async function resumeSavedDraft(actor: Actor, id: string) {
  const draft = await getDb().transaction((tx) => ownedDraft(tx, actor, id))
  return prepareSavedDraft(actor, draft)
}

export async function editSavedDraft(
  actor: Actor,
  id: string,
  input: z.infer<typeof draftEditSchema>
) {
  const draft = await getDb().transaction(async (tx) => {
    const current = await ownedDraft(tx, actor, id)
    sameRevision(current, input.revision)
    if (current.status !== 'ready')
      throw new AppError('Wait for this draft to finish preparing.', 409)
    const changedDesign =
      input.design !== undefined &&
      JSON.stringify(input.design) !== JSON.stringify(current.design)
    const design = input.design === undefined ? current.design : input.design
    if (changedDesign && design) {
      await requirePaidAccount(actor.userId!, tx)
      await validateDraftDesign(actor.userId!, design, tx, current.design)
    }
    const [updated] = await tx
      .update(savedDrafts)
      .set({
        title: input.preview.title,
        highlights: input.preview.highlights,
        appearance: design
          ? { templateId: design.recipe.baseStyle }
          : input.appearance,
        design,
        resolvedDesign: changedDesign ? null : current.resolvedDesign,
        revision: current.revision + 1,
        publishedPublicationId: null,
        updatedAt: new Date()
      })
      .where(eq(savedDrafts.id, id))
      .returning()
    return updated!
  })
  return present(draft, actor)
}

export async function publishSavedDraft(
  actor: Actor,
  id: string,
  revision: number
) {
  const draft = await getDb().transaction(async (tx) => {
    const current = await ownedDraft(tx, actor, id)
    if (!current.publishedPublicationId) sameRevision(current, revision)
    return current
  })
  return publishPreview(tokenFor(draft), undefined, undefined, actor)
}

export async function regenerateSavedDraft(
  actor: Actor,
  id: string,
  revision: number,
  requestKey: string
) {
  const { draft, existing } = await getDb().transaction(async (tx) => {
    const current = await ownedDraft(tx, actor, id)
    const [existing] = await tx
      .select()
      .from(generationOperations)
      .where(
        and(
          eq(generationOperations.subjectKey, current.namespace),
          eq(generationOperations.requestKey, `reroll:${requestKey}`),
          eq(generationOperations.draftId, id),
          eq(generationOperations.ownerId, actor.userId!)
        )
      )
    sameRevision(current, current.revision)
    if (!existing) sameRevision(current, revision)
    if (current.status !== 'ready')
      throw new AppError('Wait for this draft to finish preparing.', 409)
    return { draft: current, existing }
  })
  const originalRevision = existing?.draftRevision ?? draft.revision
  const record = await getDraft(tokenFor(draft), actor)
  const result =
    existing?.status === 'succeeded' && existing.result
      ? { operationId: existing.id, preview: existing.result }
      : await generateSummary(record.snapshot, {
          ownerId: actor.userId,
          subjectKey: actor.subjectKey,
          allowance: actor.allowance,
          requestSubjectKey: draft.namespace,
          requestKey: `reroll:${requestKey}`,
          inputHash:
            existing?.inputHash ??
            createHash('sha256')
              .update(`${record.snapshot.contentHash}:${originalRevision}`)
              .digest('hex'),
          snapshotId: record.snapshot.id,
          draftId: id,
          draftRevision: originalRevision
        })
  const saved = await finishDraft(id, async (tx, current) => {
    if (current.publishedPublicationId || current.revision !== originalRevision)
      return current
    const [updated] = await tx
      .update(savedDrafts)
      .set({
        ...result.preview,
        revision: originalRevision + 1,
        publishedPublicationId: null,
        updatedAt: new Date()
      })
      .where(eq(savedDrafts.id, id))
      .returning()
    return updated!
  })
  return {
    operationId: result.operationId,
    status: 'succeeded',
    preview: result.preview,
    conflict:
      saved.revision !== originalRevision + 1 ||
      saved.title !== result.preview.title ||
      JSON.stringify(saved.highlights) !==
        JSON.stringify(result.preview.highlights),
    draft: await present(saved, actor)
  }
}

export async function draftOperations(actor: Actor, id: string) {
  await getDb().transaction((tx) => ownedDraft(tx, actor, id))
  return {
    operations: await getDb()
      .select({
        id: generationOperations.id,
        status: generationOperations.status,
        result: generationOperations.result,
        createdAt: generationOperations.createdAt,
        draftRevision: generationOperations.draftRevision
      })
      .from(generationOperations)
      .where(
        and(
          eq(generationOperations.draftId, id),
          eq(generationOperations.ownerId, actor.userId!)
        )
      )
      .orderBy(desc(generationOperations.createdAt))
      .limit(20)
  }
}

export async function applyDraftGeneration(
  actor: Actor,
  id: string,
  revision: number,
  operationId: string
) {
  const saved = await getDb().transaction(async (tx) => {
    const draft = await ownedDraft(tx, actor, id)
    sameRevision(draft, revision)
    const [operation] = await tx
      .select()
      .from(generationOperations)
      .where(
        and(
          eq(generationOperations.id, operationId),
          eq(generationOperations.draftId, id),
          eq(generationOperations.ownerId, actor.userId!)
        )
      )
    if (operation?.status !== 'succeeded' || !operation.result)
      throw new AppError('This generation has no saved result to apply.', 409)
    const [updated] = await tx
      .update(savedDrafts)
      .set({
        ...operation.result,
        revision: revision + 1,
        publishedPublicationId: null,
        updatedAt: new Date()
      })
      .where(eq(savedDrafts.id, id))
      .returning()
    return updated!
  })
  return present(saved, actor)
}

export async function deleteSavedDraft(actor: Actor, id: string) {
  await getDb().transaction(async (tx) => {
    await ownedDraft(tx, actor, id)
    await cancelUndispatchedSummaries(tx, actor.subjectKey, id)
    await tx
      .update(imageOperations)
      .set({
        recipe: null,
        prompt: null,
        referenceAssetId: null,
        referenceHash: null
      })
      .where(
        and(
          eq(imageOperations.draftId, id),
          eq(imageOperations.ownerId, actor.userId!)
        )
      )
    await tx
      .update(generationOperations)
      .set({ result: null })
      .where(eq(generationOperations.draftId, id))
    // Retain only the request tombstone so a lost response cannot recreate it.
    await tx
      .update(savedDrafts)
      .set({
        deletedAt: new Date(),
        sourceId: null,
        snapshotId: null,
        sourceGeneration: null,
        sourceUrl: '',
        parentPublicationId: null,
        publishedPublicationId: null,
        title: '',
        highlights: [],
        appearance: DEFAULT_CARD_APPEARANCE,
        design: null,
        resolvedDesign: null,
        errorMessage: null
      })
      .where(eq(savedDrafts.id, id))
  })
  return { deleted: true }
}

export async function deleteOwnedPublication(actor: Actor, id: string) {
  requireRegisteredActor(actor)
  await getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, actor.subjectKey)
    await liveUser(tx, actor.userId)
    const now = new Date()
    const [deleted] = await tx
      .update(publications)
      .set({
        deletedAt: sql`coalesce(${publications.deletedAt}, ${now.toISOString()}::timestamptz)`,
        disabledAt: sql`coalesce(${publications.disabledAt}, ${now.toISOString()}::timestamptz)`,
        fingerprint: sql`'deleted:' || ${publications.id}::text`
      })
      .where(
        and(eq(publications.id, id), eq(publications.ownerId, actor.userId))
      )
      .returning({ id: publications.id })
    if (!deleted) throw new AppError('Passage not found.', 404)
  })
  return { deleted: true }
}

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()])
function decodeCursor(cursor?: string | null) {
  if (!cursor) return null
  try {
    const [date, id] = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString())
    )
    return { date: new Date(date), id }
  } catch {
    throw new AppError('Invalid library page.')
  }
}
function encodeCursor(date: Date, id: string) {
  return Buffer.from(JSON.stringify([date.toISOString(), id])).toString(
    'base64url'
  )
}

export async function listPassages(
  actor: Actor,
  draftCursor?: string | null,
  publicationCursor?: string | null
) {
  requireRegisteredActor(actor)
  const dc = decodeCursor(draftCursor)
  const pc = decodeCursor(publicationCursor)
  const [drafts, published, usage] = await Promise.all([
    getDb()
      .select({
        id: savedDrafts.id,
        title: savedDrafts.title,
        status: savedDrafts.status,
        updatedAt: savedDrafts.updatedAt,
        errorMessage: savedDrafts.errorMessage,
        revision: savedDrafts.revision
      })
      .from(savedDrafts)
      .where(
        and(
          eq(savedDrafts.ownerId, actor.userId),
          isNull(savedDrafts.deletedAt),
          isNull(savedDrafts.publishedPublicationId),
          dc
            ? or(
                lt(savedDrafts.updatedAt, dc.date),
                and(
                  eq(savedDrafts.updatedAt, dc.date),
                  lt(savedDrafts.id, dc.id)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(savedDrafts.updatedAt), desc(savedDrafts.id))
      .limit(21),
    getDb()
      .select({
        id: publications.id,
        title: publications.title,
        provider: sources.provider,
        createdAt: publications.createdAt
      })
      .from(publications)
      .innerJoin(sources, eq(publications.sourceId, sources.id))
      .where(
        and(
          eq(publications.ownerId, actor.userId),
          isNull(publications.deletedAt),
          pc
            ? or(
                lt(publications.createdAt, pc.date),
                and(
                  eq(publications.createdAt, pc.date),
                  lt(publications.id, pc.id)
                )
              )
            : undefined
        )
      )
      .orderBy(desc(publications.createdAt), desc(publications.id))
      .limit(21),
    getSummaryUsage(actor.subjectKey, actor.allowance)
  ])
  const lastDraft = drafts[19]
  const lastPublication = published[19]
  return {
    drafts: drafts.slice(0, 20),
    passages: published
      .slice(0, 20)
      .map((p) => ({ ...p, shareUrl: `${appUrl()}/${p.provider}/${p.id}` })),
    usage,
    nextDraftCursor:
      drafts.length > 20 && lastDraft
        ? encodeCursor(lastDraft.updatedAt, lastDraft.id)
        : null,
    nextPublicationCursor:
      published.length > 20 && lastPublication
        ? encodeCursor(lastPublication.createdAt, lastPublication.id)
        : null
  }
}

export async function reviseOwnedPublication(
  actor: Actor,
  id: string,
  requestKey: string
) {
  requireRegisteredActor(actor)
  const [found] = await getDb()
    .select({ provider: sources.provider })
    .from(publications)
    .innerJoin(sources, eq(publications.sourceId, sources.id))
    .where(and(eq(publications.id, id), eq(publications.ownerId, actor.userId)))
  if (!found) throw new AppError('Passage not found.', 404)
  const record = await getPublication(found.provider, id)
  if (!record || record.disabled)
    throw new AppError('This passage is unavailable.', 410)
  return createSavedDraft(actor, {
    url: `${appUrl()}/${found.provider}/${id}`,
    requestKey,
    appearance: record.publication.appearance ?? DEFAULT_CARD_APPEARANCE
  })
}

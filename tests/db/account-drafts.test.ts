import { createHash, randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  createSavedDraft,
  createPendingSavedDraft,
  prepareDraftInBackground,
  deleteOwnedPublication,
  deleteSavedDraft,
  applyDraftGeneration,
  listPassages,
  editSavedDraft,
  publishSavedDraft,
  readSavedDraft,
  regenerateSavedDraft,
  resumeSavedDraft,
  reviseOwnedPublication
} from '@/lib/account-drafts'
import {
  accountSubject,
  deleteAccountData,
  getAccountPreferences,
  mergeGuestAccount,
  setAccountPreferences
} from '@/lib/accounts'
import { DEFAULT_CARD_APPEARANCE } from '@/lib/card-appearance'
import { closeDatabase, getDb } from '@/lib/db'
import {
  aiBudgetPeriods,
  authUsers,
  generationOperations,
  publications,
  savedDrafts,
  snapshots,
  sources,
  usagePeriods
} from '@/lib/db/schema'
import { previewHash, readDraftToken } from '@/lib/drafts'
import { message } from '@/lib/messages'
import {
  getDraft,
  getPublication,
  prepareSource,
  publishPreview
} from '@/lib/service'
import { getSummaryUsage, reserveSummary } from '@/lib/usage'
import { utcUsagePeriod } from '@/lib/usage-policy'
import { ensureDraftEnqueued } from '@/lib/draft-jobs'

import type { Actor } from '@/lib/actors'
import type {
  ExtractedConversation,
  GeneratedPreview,
  ProviderResult,
  SourceReference
} from '@/lib/domain'
import type { PreviewUsage } from '@/lib/suggestions'

const upstream = vi.hoisted(() => ({
  fetchSource: vi.fn<(source: SourceReference) => Promise<ProviderResult>>(),
  suggestPreview:
    vi.fn<
      (
        conversation: ExtractedConversation,
        observe?: (event: PreviewUsage) => void
      ) => Promise<GeneratedPreview>
    >()
}))

vi.mock('@/lib/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/providers')>()),
  fetchSource: upstream.fetchSource
}))
vi.mock('@/lib/suggestions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/suggestions')>()),
  suggestPreview: upstream.suggestPreview
}))

const testUrl = process.env.TEST_DATABASE_URL
const userIds: string[] = []
const sourceUrls: string[] = []
// Isolate the service-wide budget from other concurrently running DB suites.
const now = new Date(Date.UTC(7200 + Math.floor(Math.random() * 1000), 0, 15))
const original: ExtractedConversation = {
  title: 'A fixture conversation',
  parserVersion: 'account-draft-fixture-v1',
  messages: [
    message(
      'm1',
      'assistant',
      'Keep a saved draft private and publish only its reviewed wording.'
    )
  ]
}
const preview: GeneratedPreview = {
  title: 'Reviewed words stay fixed',
  highlights: ['Save privately before publishing']
}
const rerolled: GeneratedPreview = {
  title: 'A new summary for this draft',
  highlights: ['Shared source summaries stay unchanged']
}
const usage: PreviewUsage = {
  usage: {
    inputTokens: 100,
    inputTokenDetails: {
      noCacheTokens: 100,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 20,
    outputTokenDetails: { textTokens: 20, reasoningTokens: 0 },
    totalTokens: 120
  }
}

async function actor(guest = false): Promise<Actor & { userId: string }> {
  const id = randomUUID()
  userIds.push(id)
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Account draft fixture',
      email: `${id}@example.invalid`,
      emailVerified: !guest,
      isAnonymous: guest
    })
  return {
    userId: id,
    subjectKey: accountSubject(id),
    allowance: guest ? 5 : 25,
    registered: !guest
  }
}

function sourceUrl() {
  const url = `https://chatgpt.com/share/${randomUUID()}`
  sourceUrls.push(url)
  return url
}

async function readyDraft(
  owner: Actor,
  url = sourceUrl(),
  requestKey = randomUUID()
) {
  const draft = await createSavedDraft(owner, { url, requestKey })
  if (draft.status !== 'ready')
    throw new Error('Fixture draft did not finish preparing')
  return draft
}

async function storedDraft(id: string) {
  const [draft] = await getDb()
    .select()
    .from(savedDrafts)
    .where(eq(savedDrafts.id, id))
  return draft
}

function pauseNextSummary() {
  const started = Promise.withResolvers<void>()
  const result = Promise.withResolvers<GeneratedPreview>()
  upstream.suggestPreview.mockImplementationOnce(
    async (_conversation, observe) => {
      observe?.(usage)
      started.resolve()
      return result.promise
    }
  )
  return { started: started.promise, complete: result.resolve }
}

describe.skipIf(!testUrl)(
  'owned drafts and publication boundaries with PostgreSQL',
  () => {
    beforeAll(() => {
      vi.stubEnv('DATABASE_URL', testUrl!)
      vi.stubEnv(
        'APP_SECRET',
        'fixture-draft-secret-with-more-than-thirty-two-characters'
      )
      vi.stubEnv('AI_PROVIDER', 'openai')
      vi.stubEnv('AI_MODEL', 'gpt-5.4-nano')
      vi.stubEnv('OPENAI_API_KEY', 'fixture-unused-model-key')
    })

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(now)
      upstream.fetchSource
        .mockReset()
        .mockResolvedValue({ status: 'available', conversation: original })
      upstream.suggestPreview
        .mockReset()
        .mockImplementation(async (_conversation, observe) => {
          observe?.(usage)
          return preview
        })
    })

    afterEach(() => vi.useRealTimers())

    afterAll(async () => {
      const subjects = userIds.map(accountSubject)
      if (subjects.length) {
        await getDb()
          .delete(generationOperations)
          .where(inArray(generationOperations.subjectKey, subjects))
        await getDb()
          .delete(usagePeriods)
          .where(inArray(usagePeriods.subjectKey, subjects))
        await getDb().delete(authUsers).where(inArray(authUsers.id, userIds))
      }
      if (sourceUrls.length)
        await getDb()
          .delete(sources)
          .where(inArray(sources.canonicalUrl, sourceUrls))
      await getDb()
        .delete(aiBudgetPeriods)
        .where(eq(aiBudgetPeriods.startsAt, utcUsagePeriod(now).startsAt))
      await closeDatabase()
      vi.unstubAllEnvs()
    })

    it('allocates one saved draft immediately and prepares it separately under its original request identity', async () => {
      const owner = await actor()
      const input = { url: sourceUrl(), requestKey: randomUUID() }
      const pending = await createPendingSavedDraft(owner, input)
      const replay = await createPendingSavedDraft(owner, input)
      expect(pending.status).toBe('preparing')
      expect(replay.draftId).toBe(pending.draftId)
      expect(upstream.fetchSource).not.toHaveBeenCalled()
      expect(upstream.suggestPreview).not.toHaveBeenCalled()
      expect(
        (await getSummaryUsage(owner.subjectKey, owner.allowance)).used
      ).toBe(0)
      const ready = await prepareDraftInBackground(pending.draftId)
      const recovered = await prepareDraftInBackground(pending.draftId)
      expect(ready.status).toBe('ready')
      expect(recovered.draftId).toBe(pending.draftId)
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
      expect(
        (await getSummaryUsage(owner.subjectKey, owner.allowance)).used
      ).toBe(1)
    })

    it('deduplicates concurrent queue delivery and recovers a lost response after its lease without creating another draft', async () => {
      const owner = await actor()
      const pending = await createPendingSavedDraft(owner, {
        url: sourceUrl(),
        requestKey: randomUUID()
      })
      const enqueue = vi
        .fn<(id: string) => Promise<{ runId: string }>>()
        .mockRejectedValueOnce(new TypeError('Queue response lost'))
        .mockResolvedValue({ runId: 'recovered-workflow-run' })
      await Promise.all([
        ensureDraftEnqueued(owner, pending.draftId, enqueue),
        ensureDraftEnqueued(owner, pending.draftId, enqueue)
      ])
      expect(enqueue).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date(now.getTime() + 61000))
      await ensureDraftEnqueued(owner, pending.draftId, enqueue)
      await ensureDraftEnqueued(owner, pending.draftId, enqueue)
      expect(enqueue).toHaveBeenCalledTimes(2)
      expect(enqueue.mock.calls).toEqual([[pending.draftId], [pending.draftId]])
      expect((await storedDraft(pending.draftId))?.preparationRunId).toBe(
        'recovered-workflow-run'
      )
      expect(upstream.suggestPreview).not.toHaveBeenCalled()
    })

    it('prepares a queued guest draft after signup using its transferred owner and original namespace', async () => {
      const guest = await actor(true)
      const account = await actor()
      const pending = await createPendingSavedDraft(guest, {
        url: sourceUrl(),
        requestKey: randomUUID()
      })
      await mergeGuestAccount(guest.userId, account.userId)
      expect((await prepareDraftInBackground(pending.draftId)).status).toBe(
        'ready'
      )
      expect((await readSavedDraft(account, pending.draftId)).status).toBe(
        'ready'
      )
      expect((await storedDraft(pending.draftId))?.namespace).toBe(
        guest.subjectKey
      )
      expect(
        (await getSummaryUsage(account.subjectKey, account.allowance)).used
      ).toBe(1)
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    })

    it('checks current email verification before preparing a queued account draft', async () => {
      const owner = await actor()
      const pending = await createPendingSavedDraft(owner, {
        url: sourceUrl(),
        requestKey: randomUUID()
      })
      await getDb()
        .update(authUsers)
        .set({ emailVerified: false })
        .where(eq(authUsers.id, owner.userId))
      await expect(
        prepareDraftInBackground(pending.draftId)
      ).rejects.toMatchObject({ status: 403 })
      expect(upstream.fetchSource).not.toHaveBeenCalled()
      expect(upstream.suggestPreview).not.toHaveBeenCalled()
    })

    it('never queues or prepares a deleted draft or another account’s draft', async () => {
      const owner = await actor()
      const other = await actor()
      const pending = await createPendingSavedDraft(owner, {
        url: sourceUrl(),
        requestKey: randomUUID()
      })
      const enqueue = vi
        .fn<(id: string) => Promise<{ runId: string }>>()
        .mockResolvedValue({ runId: 'forbidden-run' })
      await ensureDraftEnqueued(other, pending.draftId, enqueue)
      await deleteSavedDraft(owner, pending.draftId)
      await ensureDraftEnqueued(owner, pending.draftId, enqueue)
      await expect(
        prepareDraftInBackground(pending.draftId)
      ).rejects.toMatchObject({ status: 404 })
      expect(enqueue).not.toHaveBeenCalled()
      expect(upstream.suggestPreview).not.toHaveBeenCalled()
    })

    it('requires ownership for every private draft read, edit, and publication', async () => {
      const owner = await actor()
      const other = await actor()
      const draft = await readyDraft(owner)
      await expect(readSavedDraft(other, draft.draftId)).rejects.toMatchObject({
        status: 404
      })
      await expect(getDraft(draft.draftToken)).rejects.toMatchObject({
        status: 401
      })
      await expect(getDraft(draft.draftToken, other)).rejects.toMatchObject({
        status: 404
      })
      await expect(
        editSavedDraft(other, draft.draftId, {
          revision: draft.revision,
          preview,
          appearance: DEFAULT_CARD_APPEARANCE
        })
      ).rejects.toMatchObject({ status: 404 })
      await expect(
        publishSavedDraft(other, draft.draftId, draft.revision)
      ).rejects.toMatchObject({ status: 404 })
      expect((await getDraft(draft.draftToken, owner)).preview).toEqual(preview)
    })

    it('does not make an exhausted guest quota block another account sharing the same source', async () => {
      const guest = await actor(true)
      const account = await actor()
      const url = sourceUrl()
      await getDb()
        .insert(usagePeriods)
        .values({
          subjectKey: guest.subjectKey,
          ...utcUsagePeriod(now),
          allowance: 5,
          used: 5
        })
      await expect(readyDraft(guest, url)).rejects.toMatchObject({
        status: 429,
        details: { code: 'SUMMARY_LIMIT' }
      })
      const [source] = await getDb()
        .select()
        .from(sources)
        .where(eq(sources.canonicalUrl, url))
      expect(source).toMatchObject({
        preparationLeaseToken: null,
        preparationLeaseUntil: null,
        preparationRetryAfter: null
      })
      const [snapshot] = await getDb()
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, source!.latestSnapshotId!))
      expect(snapshot?.preview).toBeNull()
      expect(upstream.suggestPreview).not.toHaveBeenCalled()
      const [blockedDraft] = await getDb()
        .select()
        .from(savedDrafts)
        .where(eq(savedDrafts.ownerId, guest.userId))
      expect(await readSavedDraft(guest, blockedDraft!.id)).toMatchObject({
        generationBlock: {
          code: 'SUMMARY_LIMIT',
          resetAt: utcUsagePeriod(now).endsAt.toISOString(),
          canSignUp: true
        }
      })
      vi.setSystemTime(utcUsagePeriod(now).endsAt)
      expect(
        (await readSavedDraft(guest, blockedDraft!.id)).generationBlock
      ).toBeUndefined()
      vi.setSystemTime(now)
      const draft = await readyDraft(account, url)
      expect(draft.preview).toEqual(preview)
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
      expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
      expect(
        await getSummaryUsage(account.subjectKey, account.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
      expect(
        await getSummaryUsage(guest.subjectKey, guest.allowance, now)
      ).toMatchObject({ used: 5, reserved: 0 })
      expect(
        (await readSavedDraft(guest, blockedDraft!.id)).generationBlock
      ).toBeUndefined()
      expect(await resumeSavedDraft(guest, blockedDraft!.id)).toMatchObject({
        status: 'ready',
        preview
      })
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    })

    it('keeps the last reserved summary recoverable instead of reporting a quota block', async () => {
      const guest = await actor(true)
      await getDb()
        .insert(usagePeriods)
        .values({
          subjectKey: guest.subjectKey,
          ...utcUsagePeriod(now),
          allowance: 5,
          used: 4
        })
      const paused = pauseNextSummary()
      const pending = createSavedDraft(guest, {
        url: sourceUrl(),
        requestKey: randomUUID()
      })
      await paused.started
      try {
        const [draft] = await getDb()
          .select()
          .from(savedDrafts)
          .where(eq(savedDrafts.ownerId, guest.userId))
        expect(await getSummaryUsage(guest.subjectKey, 5)).toMatchObject({
          remaining: 0,
          reserved: 1
        })
        const restored = await readSavedDraft(guest, draft!.id)
        expect(restored.status).toBe('preparing')
        expect(restored.generationBlock).toBeUndefined()
      } finally {
        paused.complete(preview)
        await pending
      }
    })

    it('autosaves and publishes full text beyond character recommendations', async () => {
      const owner = await actor()
      const draft = await readyDraft(owner)
      const long = { title: 'T'.repeat(901), highlights: ['A'.repeat(2401)] }
      const edited = await editSavedDraft(owner, draft.draftId, {
        revision: draft.revision,
        preview: long,
        appearance: DEFAULT_CARD_APPEARANCE
      })
      expect(edited.preview).toEqual(long)
      expect((await readSavedDraft(owner, draft.draftId)).preview).toEqual(long)
      const published = await publishSavedDraft(
        owner,
        draft.draftId,
        edited.revision
      )
      expect(
        (await getPublication('chatgpt', published.publicationId))!.preview
      ).toEqual(long)
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
    })

    it('rejects stale autosaves and publication tokens without consuming another generation', async () => {
      const owner = await actor()
      const draft = await readyDraft(owner)
      const changed = await editSavedDraft(owner, draft.draftId, {
        revision: draft.revision,
        preview: { title: 'My reviewed title', highlights: [] },
        appearance: DEFAULT_CARD_APPEARANCE
      })
      expect(changed.revision).toBe(draft.revision + 1)
      await expect(
        editSavedDraft(owner, draft.draftId, {
          revision: draft.revision,
          preview,
          appearance: DEFAULT_CARD_APPEARANCE
        })
      ).rejects.toMatchObject({ status: 409 })
      await expect(getDraft(draft.draftToken, owner)).rejects.toMatchObject({
        status: 409
      })
      await expect(
        publishSavedDraft(owner, draft.draftId, draft.revision)
      ).rejects.toMatchObject({ status: 409 })
      const published = await publishSavedDraft(
        owner,
        draft.draftId,
        changed.revision
      )
      expect(
        (await getPublication('chatgpt', published.publicationId))?.preview
          .title
      ).toBe('My reviewed title')
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    })

    it('reads published state, rejects stale editing without spending, and revises into a separate draft', async () => {
      const owner = await actor()
      const draft = await readyDraft(owner)
      const published = await publishSavedDraft(
        owner,
        draft.draftId,
        draft.revision
      )
      const current = await readSavedDraft(owner, draft.draftId)
      expect(current).toMatchObject({
        status: 'published',
        draftId: draft.draftId,
        shareUrl: published.shareUrl,
        preview: draft.preview
      })
      const library = await listPassages(owner)
      expect(library.drafts.some((item) => item.id === draft.draftId)).toBe(
        false
      )
      expect(
        library.passages.some((item) => item.id === published.publicationId)
      ).toBe(true)
      const before = await getSummaryUsage(
        owner.subjectKey,
        owner.allowance,
        now
      )
      await expect(
        editSavedDraft(owner, draft.draftId, {
          revision: draft.revision,
          preview: rerolled,
          appearance: DEFAULT_CARD_APPEARANCE
        })
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        regenerateSavedDraft(owner, draft.draftId, draft.revision, randomUUID())
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        applyDraftGeneration(owner, draft.draftId, draft.revision, randomUUID())
      ).rejects.toMatchObject({ status: 409 })
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toEqual(before)
      expect(
        await publishSavedDraft(owner, draft.draftId, draft.revision)
      ).toEqual(published)
      const revision = await reviseOwnedPublication(
        owner,
        published.publicationId,
        randomUUID()
      )
      expect(revision.status).toBe('ready')
      expect(revision.draftId).not.toBe(draft.draftId)
      expect((await readSavedDraft(owner, draft.draftId)).status).toBe(
        'published'
      )
    })

    it('imports matching guest and account publications without collapsing either namespace', async () => {
      const guest = await actor(true)
      const account = await actor()
      const url = sourceUrl()
      const guestDraft = await readyDraft(guest, url)
      const accountDraft = await readyDraft(account, url)
      const guestPublished = await publishSavedDraft(
        guest,
        guestDraft.draftId,
        guestDraft.revision
      )
      const accountPublished = await publishSavedDraft(
        account,
        accountDraft.draftId,
        accountDraft.revision
      )
      expect(guestPublished.publicationId).not.toBe(
        accountPublished.publicationId
      )
      await setAccountPreferences(guest.userId, { templateId: 'friendly-lab' })
      await setAccountPreferences(account.userId, {
        templateId: 'midnight-observatory'
      })
      await mergeGuestAccount(guest.userId, account.userId)
      await mergeGuestAccount(guest.userId, account.userId)

      expect((await storedDraft(guestDraft.draftId))?.namespace).toBe(
        guest.subjectKey
      )
      expect((await storedDraft(guestDraft.draftId))?.ownerId).toBe(
        account.userId
      )
      expect((await storedDraft(guestDraft.draftId))?.appearance).toEqual(
        DEFAULT_CARD_APPEARANCE
      )
      expect((await getAccountPreferences(account.userId)).appearance).toEqual({
        templateId: 'midnight-observatory'
      })
      expect(
        await publishSavedDraft(
          account,
          guestDraft.draftId,
          guestDraft.revision
        )
      ).toEqual(guestPublished)
      expect(
        await publishSavedDraft(
          account,
          accountDraft.draftId,
          accountDraft.revision
        )
      ).toEqual(accountPublished)
      expect(
        await getSummaryUsage(account.subjectKey, account.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
      const [imported] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, guestPublished.publicationId))
      expect(imported).toMatchObject({
        ownerId: account.userId,
        dedupeScope: guest.subjectKey
      })

      await deleteOwnedPublication(account, guestPublished.publicationId)
      expect(
        (await getPublication('chatgpt', guestPublished.publicationId))
          ?.disabled
      ).toBe(true)
      expect(
        (await getPublication('chatgpt', accountPublished.publicationId))
          ?.disabled
      ).toBe(false)
      await expect(
        publishSavedDraft(account, guestDraft.draftId, guestDraft.revision)
      ).rejects.toMatchObject({ status: 410 })
      expect(
        (await getPublication('chatgpt', guestPublished.publicationId))
          ?.disabled
      ).toBe(true)
    })

    it('resumes the exact imported draft when guest and account request keys collide', async () => {
      const account = await actor()
      const guest = await actor(true)
      const requestKey = randomUUID()
      const accountUrl = sourceUrl()
      const guestUrl = sourceUrl()
      const accountDraft = await readyDraft(account, accountUrl, requestKey)
      const guestDraft = await readyDraft(guest, guestUrl, requestKey)
      // Model completion persisted, but the request stopped before making the draft ready.
      await getDb()
        .update(savedDrafts)
        .set({ status: 'preparing' })
        .where(eq(savedDrafts.id, guestDraft.draftId))
      await mergeGuestAccount(guest.userId, account.userId)
      const resumed = await resumeSavedDraft(account, guestDraft.draftId)
      expect(resumed).toMatchObject({
        draftId: guestDraft.draftId,
        sourceUrl: guestUrl,
        status: 'ready'
      })
      expect(
        await createSavedDraft(account, { url: accountUrl, requestKey })
      ).toMatchObject({ draftId: accountDraft.draftId })
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(2)
      expect(
        await getSummaryUsage(account.subjectKey, account.allowance, now)
      ).toMatchObject({ used: 2, reserved: 0 })
    })

    it('keeps rerolls private and preserves edits made while generation is running', async () => {
      const owner = await actor()
      const url = sourceUrl()
      const draft = await readyDraft(owner, url)
      const snapshotId = readDraftToken(draft.draftToken).snapshotId
      const pending = pauseNextSummary()
      const attempt = regenerateSavedDraft(
        owner,
        draft.draftId,
        draft.revision,
        randomUUID()
      )
      await Promise.race([
        pending.started,
        attempt.then(() => {
          throw new Error('Expected paused generation')
        })
      ])
      const edited = await editSavedDraft(owner, draft.draftId, {
        revision: draft.revision,
        preview: { title: 'Words edited while waiting', highlights: [] },
        appearance: DEFAULT_CARD_APPEARANCE
      })
      pending.complete(rerolled)
      const result = await attempt
      expect(result.conflict).toBe(true)
      expect((await storedDraft(draft.draftId))?.title).toBe(
        'Words edited while waiting'
      )
      expect((await storedDraft(draft.draftId))?.revision).toBe(edited.revision)
      const [snapshot] = await getDb()
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, snapshotId))
      expect(snapshot?.preview).toEqual(preview)
      expect((await prepareSource(url)).preview).toEqual(preview)
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 2, reserved: 0 })
    })

    it('cancels undispatched work and retains a deletion tombstone against request replay', async () => {
      const owner = await actor()
      const url = sourceUrl()
      const requestKey = randomUUID()
      const draft = await readyDraft(owner, url, requestKey)
      const reserved = await reserveSummary({
        ownerId: owner.userId,
        subjectKey: owner.subjectKey,
        allowance: owner.allowance,
        requestKey: randomUUID(),
        inputHash: randomUUID(),
        draftId: draft.draftId,
        now
      })
      await deleteSavedDraft(owner, draft.draftId)
      const [operation] = await getDb()
        .select()
        .from(generationOperations)
        .where(eq(generationOperations.id, reserved.operation.id))
      expect(operation).toMatchObject({ status: 'cancelled', result: null })
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
      await expect(readSavedDraft(owner, draft.draftId)).rejects.toMatchObject({
        status: 404
      })
      await expect(
        createSavedDraft(owner, { url, requestKey })
      ).rejects.toMatchObject({ status: 409 })
      expect(await storedDraft(draft.draftId)).toMatchObject({
        sourceUrl: '',
        snapshotId: null,
        title: '',
        highlights: []
      })
    })

    it('settles dispatched work after draft deletion without restoring private output', async () => {
      const owner = await actor()
      const draft = await readyDraft(owner)
      const pending = pauseNextSummary()
      const attempt = regenerateSavedDraft(
        owner,
        draft.draftId,
        draft.revision,
        randomUUID()
      )
      const outcome = attempt.then(
        (value) => ({ value }),
        (err: unknown) => ({ error: err })
      )
      await Promise.race([
        pending.started,
        attempt.then(() => {
          throw new Error('Expected paused generation')
        })
      ])
      await deleteSavedDraft(owner, draft.draftId)
      pending.complete(rerolled)
      expect(await outcome).toHaveProperty('error')
      const operations = await getDb()
        .select()
        .from(generationOperations)
        .where(eq(generationOperations.draftId, draft.draftId))
      expect(operations.every((operation) => operation.result === null)).toBe(
        true
      )
      expect(
        operations.filter((operation) => operation.status === 'succeeded')
      ).toHaveLength(2)
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 2, reserved: 0 })
      expect((await storedDraft(draft.draftId))?.deletedAt).toBeTruthy()
    })

    it('does not recreate a draft when its account is deleted during initial preparation', async () => {
      const owner = await actor()
      const pending = pauseNextSummary()
      const attempt = readyDraft(owner)
      const outcome = attempt.then(
        (value) => ({ value }),
        (err: unknown) => ({ error: err })
      )
      await Promise.race([
        pending.started,
        attempt.then(() => {
          throw new Error('Expected paused generation')
        })
      ])
      await deleteAccountData(owner.userId)
      pending.complete(preview)
      expect(await outcome).toHaveProperty('error')
      expect(
        await getDb()
          .select()
          .from(savedDrafts)
          .where(eq(savedDrafts.ownerId, owner.userId))
      ).toEqual([])
      const operations = await getDb()
        .select()
        .from(generationOperations)
        .where(eq(generationOperations.ownerId, owner.userId))
      expect(operations).toHaveLength(1)
      expect(operations[0]).toMatchObject({ status: 'succeeded', result: null })
      expect(
        await getSummaryUsage(owner.subjectKey, owner.allowance, now)
      ).toMatchObject({ used: 1, reserved: 0 })
    })

    it('preserves own revision style and independent saved copies after the parent is deleted', async () => {
      const owner = await actor()
      const other = await actor()
      const draft = await readyDraft(owner)
      const customized = await editSavedDraft(owner, draft.draftId, {
        revision: draft.revision,
        preview,
        appearance: { templateId: 'midnight-observatory' }
      })
      const publication = await publishSavedDraft(
        owner,
        draft.draftId,
        customized.revision
      )
      await setAccountPreferences(owner.userId, {
        templateId: 'electric-risograph'
      })
      await setAccountPreferences(other.userId, { templateId: 'friendly-lab' })
      const revision = await reviseOwnedPublication(
        owner,
        publication.publicationId,
        randomUUID()
      )
      const fork = await readyDraft(other, publication.shareUrl)
      expect(revision).toMatchObject({
        appearance: { templateId: 'midnight-observatory' }
      })
      expect(fork.appearance).toEqual({ templateId: 'friendly-lab' })
      await deleteOwnedPublication(owner, publication.publicationId)
      expect(await readSavedDraft(owner, revision.draftId)).toMatchObject({
        preview
      })
      expect(await readSavedDraft(other, fork.draftId)).toMatchObject({
        preview
      })
      const independent = await publishSavedDraft(
        other,
        fork.draftId,
        fork.revision
      )
      expect(
        (await getPublication('chatgpt', independent.publicationId))?.disabled
      ).toBe(false)
      expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    })

    it('supports the previous writer conflict target and keeps owner deletion visible to its reader', async () => {
      const owner = await actor()
      const url = sourceUrl()
      const draft = await readyDraft(owner, url)
      const owned = await publishSavedDraft(
        owner,
        draft.draftId,
        draft.revision
      )
      const [ownedRow] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, owned.publicationId))
      const capability = readDraftToken(draft.draftToken)
      // This is the exact pre-accounts writer input/hash and conflict target.
      const legacyHash = createHash('sha256')
        .update(
          JSON.stringify({
            snapshotId: capability.snapshotId,
            parentPublicationId: undefined,
            ...preview,
            appearance: DEFAULT_CARD_APPEARANCE,
            cardVersion: 4
          })
        )
        .digest('hex')
      expect(ownedRow?.fingerprint).toBe(`${owner.subjectKey}:${legacyHash}`)
      const legacyInput = {
        sourceId: ownedRow!.sourceId,
        snapshotId: capability.snapshotId,
        fingerprint: legacyHash,
        generation: capability.generation,
        ...preview,
        appearance: DEFAULT_CARD_APPEARANCE,
        cardVersion: 4
      }
      const oldWriter = () =>
        getDb()
          .insert(publications)
          .values(legacyInput)
          .onConflictDoNothing({
            target: [
              publications.sourceId,
              publications.generation,
              publications.fingerprint
            ]
          })
          .returning()
      const [legacy] = await oldWriter()
      expect(legacy).toMatchObject({
        ownerId: null,
        dedupeScope: 'legacy',
        fingerprint: legacyHash
      })
      expect(await oldWriter()).toEqual([])
      const prepared = await prepareSource(url)
      expect((await publishPreview(prepared.draftToken)).publicationId).toBe(
        legacy!.id
      )

      await deleteOwnedPublication(owner, owned.publicationId)
      const [deleted] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, owned.publicationId))
      expect(deleted?.disabledAt).toBeTruthy()
      expect(deleted?.fingerprint).toBe(`deleted:${owned.publicationId}`)
      await deleteOwnedPublication(owner, owned.publicationId)
      const [retried] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, owned.publicationId))
      expect(retried?.disabledAt).toEqual(deleted?.disabledAt)
      expect(retried?.deletedAt).toEqual(deleted?.deletedAt)
      await expect(
        publishSavedDraft(owner, draft.draftId, draft.revision)
      ).rejects.toMatchObject({ status: 410 })
      const newDraft = await readyDraft(owner, url)
      const republished = await publishSavedDraft(
        owner,
        newDraft.draftId,
        newDraft.revision
      )
      expect(republished.publicationId).not.toBe(owned.publicationId)
      await deleteAccountData(owner.userId)
      const [accountDeleted] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, republished.publicationId))
      expect(accountDeleted?.disabledAt).toBeTruthy()
      expect(accountDeleted?.fingerprint).toBe(
        `deleted:${republished.publicationId}`
      )
      expect((await getPublication('chatgpt', legacy!.id))?.disabled).toBe(
        false
      )
    })

    it('keeps legacy capability tokens publishable and unowned even during authenticated use', async () => {
      const owner = await actor()
      const prepared = await prepareSource(sourceUrl())
      const payload = JSON.parse(
        Buffer.from(prepared.draftToken.split('.')[0]!, 'base64url').toString()
      ) as Record<string, unknown>
      expect(payload.previewHash).toBe(previewHash(preview))
      expect(payload).not.toHaveProperty('savedDraftId')
      expect(payload).not.toHaveProperty('revision')
      expect((await getDraft(prepared.draftToken)).preview).toEqual(preview)
      const published = await publishPreview(
        prepared.draftToken,
        undefined,
        undefined,
        owner
      )
      const [stored] = await getDb()
        .select()
        .from(publications)
        .where(eq(publications.id, published.publicationId))
      expect(stored).toMatchObject({ ownerId: null, dedupeScope: 'legacy' })
      expect(await publishPreview(prepared.draftToken)).toEqual(published)
      const copied = await prepareSource(published.shareUrl)
      expect(readDraftToken(copied.draftToken).publicationId).toBe(
        published.publicationId
      )
      expect((await getDraft(copied.draftToken)).preview).toEqual(preview)
    })
  }
)

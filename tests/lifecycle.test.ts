import { randomUUID } from 'node:crypto'

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

import { closeDatabase, getDb } from '@/lib/db'
import {
  DEFAULT_CARD_APPEARANCE,
  type CardAppearance
} from '@/lib/card-appearance'
import * as databaseRateLimit from '@/lib/db/rate-limit'
import { publications, rateLimits, snapshots, sources } from '@/lib/db/schema'
import {
  type ExtractedConversation,
  limits,
  type GeneratedPreview,
  type ProviderResult,
  type SourceReference
} from '@/lib/domain'
import { readDraftToken } from '@/lib/drafts'
import { AppError } from '@/lib/errors'
import { message } from '@/lib/messages'
import {
  checkAvailability,
  cleanupPreparations,
  enforceBudget,
  getDraft,
  getPublication,
  prepareSource,
  publishPreview
} from '@/lib/service'

const upstream = vi.hoisted(() => ({
  fetchSource: vi.fn<(source: SourceReference) => Promise<ProviderResult>>(),
  suggestPreview:
    vi.fn<(conversation: ExtractedConversation) => Promise<GeneratedPreview>>()
}))

vi.mock('@/lib/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/providers')>()),
  fetchSource: upstream.fetchSource
}))

vi.mock('@/lib/suggestions', () => ({
  suggestPreview: upstream.suggestPreview
}))

// Synthetic input tests lifecycle invariants; it is not evidence of live extraction.
const original: ExtractedConversation = {
  title: 'Small changes that compound',
  parserVersion: 'synthetic-v1',
  messages: [
    message('user-1', 'user', 'How can I make steady progress?'),
    message(
      'assistant-1',
      'assistant',
      'Start small 🌱 and keep showing up.\n\n**Consistency** compounds.'
    )
  ]
}

const changed: ExtractedConversation = {
  ...original,
  title: 'A later version of the conversation',
  messages: [
    ...original.messages,
    message('assistant-2', 'assistant', 'A new saved turn.')
  ]
}

const testUrl = process.env.TEST_DATABASE_URL
const baseTime = new Date('2026-09-10T12:00:00.000Z')
const sourceUrls: string[] = []
const rateKeys: string[] = []

function advance(milliseconds: number) {
  vi.setSystemTime(new Date(baseTime.getTime() + milliseconds))
}

function sourceUrl(provider: 'chatgpt' | 'claude' = 'chatgpt') {
  const url = `https://${provider === 'chatgpt' ? 'chatgpt.com' : 'claude.ai'}/share/${randomUUID()}`
  sourceUrls.push(url)
  return url
}

async function sourceRecord(url: string) {
  const [source] = await getDb()
    .select()
    .from(sources)
    .where(eq(sources.canonicalUrl, url))
  return source!
}

const generatedPreview = {
  title: 'A small start becomes progress',
  highlights: [
    'Small habits make consistent progress easier.',
    'Repeated effort builds lasting results.'
  ]
}

async function preparedPublication(url = sourceUrl()) {
  const prepared = await prepareSource(url)
  const published = await publishPreview(prepared.draftToken)
  return { url, prepared, published, source: await sourceRecord(url) }
}

it('rejects invalid appearance at the publication service boundary', async () => {
  await expect(
    publishPreview('unread-draft', {
      templateId: 'unknown'
    } as unknown as CardAppearance)
  ).rejects.toMatchObject({ status: 400 })
})

describe.skipIf(!testUrl)('publication lifecycle with PostgreSQL', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(baseTime)
    upstream.fetchSource
      .mockReset()
      .mockResolvedValue({ status: 'available', conversation: original })
    upstream.suggestPreview.mockReset().mockResolvedValue(generatedPreview)
  })

  afterEach(() => vi.useRealTimers())

  afterAll(async () => {
    if (sourceUrls.length)
      await getDb()
        .delete(sources)
        .where(inArray(sources.canonicalUrl, sourceUrls))
    if (rateKeys.length)
      await getDb().delete(rateLimits).where(inArray(rateLimits.key, rateKeys))
    await closeDatabase()
  })

  it('allows one preparation and suggestion in flight, then reuses both', async () => {
    const url = sourceUrl()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    upstream.fetchSource.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return { status: 'available', conversation: original }
    })

    const first = prepareSource(url)
    await entered.promise
    const overlapping = await Promise.allSettled(
      Array.from({ length: 8 }, () => prepareSource(url))
    )
    expect(
      overlapping.every(
        (result) => result.status === 'rejected' && result.reason.status === 409
      )
    ).toBe(true)
    release.resolve()
    const prepared = await first
    const cached = await Promise.all(
      Array.from({ length: 8 }, () => prepareSource(url))
    )
    expect(
      cached.every((value) => value.draftToken === prepared.draftToken)
    ).toBe(true)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    expect((await getDraft(prepared.draftToken)).snapshot.messages).toEqual(
      original.messages
    )
  })

  it('publishes the server-generated preview idempotently without accepting text edits', async () => {
    const url = sourceUrl('claude')
    const prepared = await prepareSource(url)
    const duplicates = await Promise.all(
      Array.from({ length: 12 }, () => publishPreview(prepared.draftToken))
    )
    expect(new Set(duplicates.map((value) => value.publicationId)).size).toBe(1)
    const firstId = duplicates[0]!.publicationId
    const first = await getPublication('claude', firstId)
    expect(duplicates[0]!.shareUrl).toContain('/claude/')
    expect(prepared.preview).toEqual(generatedPreview)
    expect(prepared).not.toHaveProperty('messages')
    expect(first!.preview).toEqual(prepared.preview)
    expect(first!.publication.cardVersion).toBe(3)
    expect(first!.publication.appearance).toEqual(DEFAULT_CARD_APPEARANCE)
    expect(await getPublication('chatgpt', firstId)).toBeNull()
  })

  it('saves different templates independently and reuses the same content and style across drafts', async () => {
    const url = sourceUrl()
    const first = await prepareSource(url)
    const appearances: CardAppearance[] = [
      DEFAULT_CARD_APPEARANCE,
      { templateId: 'electric-risograph' }
    ]
    const styled = await Promise.all(
      appearances.map(async (appearance) => ({
        appearance,
        ...(await publishPreview(first.draftToken, appearance))
      }))
    )
    expect(new Set(styled.map((value) => value.publicationId)).size).toBe(2)

    advance(1000)
    const next = await prepareSource(url)
    expect(next.draftToken).not.toBe(first.draftToken)
    for (const { appearance, publicationId } of styled) {
      const reused = await publishPreview(next.draftToken, appearance)
      expect(reused.publicationId).toBe(publicationId)
      const saved = await getPublication('chatgpt', publicationId)
      expect(saved!.publication.appearance).toEqual(appearance)
      expect(saved!.publication.cardVersion).toBe(3)
      expect(saved!.preview).toEqual(generatedPreview)
      expect(saved!.snapshot.messages).toEqual(original.messages)
    }
    const defaultPublication = await publishPreview(next.draftToken)
    expect(defaultPublication.publicationId).toBe(styled[0]!.publicationId)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
  })

  it('measures content freshness independently of a later availability check', async () => {
    const { url, source, published } = await preparedPublication()
    advance(6 * 24 * limits.cooldownMs)
    upstream.fetchSource.mockResolvedValue({
      status: 'available',
      conversation: changed
    })
    await checkAvailability(source.id, 'manual')
    const afterCheck = await sourceRecord(url)
    expect(afterCheck.lastCheckedAt!.getTime()).toBe(Date.now())
    expect(afterCheck.latestSnapshotVerifiedAt!.getTime()).toBe(
      baseTime.getTime()
    )
    expect(
      (await getPublication('chatgpt', published.publicationId))!.snapshot
        .messages
    ).toEqual(original.messages)

    advance(limits.freshnessMs - 1)
    await prepareSource(url)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
    advance(limits.freshnessMs)
    const refreshed = await prepareSource(url)
    expect((await getDraft(refreshed.draftToken)).snapshot.messages).toEqual(
      changed.messages
    )
    expect(upstream.fetchSource).toHaveBeenCalledTimes(3)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(2)
    expect(
      (await getPublication('chatgpt', published.publicationId))!.snapshot
        .messages
    ).toEqual(original.messages)
  })

  it('reuses an identical immutable snapshot after a fresh fetch without repeating suggestions', async () => {
    const url = sourceUrl()
    const first = await prepareSource(url)
    const firstSnapshot = (await getDraft(first.draftToken)).snapshot
    advance(limits.freshnessMs)
    const refreshed = await prepareSource(url)
    const saved = (await getDraft(refreshed.draftToken)).snapshot
    expect(saved.id).toBe(firstSnapshot.id)
    expect(saved.capturedAt).toEqual(firstSnapshot.capturedAt)
    expect((await sourceRecord(url)).latestSnapshotVerifiedAt!.getTime()).toBe(
      Date.now()
    )
    await prepareSource(url)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
  })

  it('binds draft capabilities to the exact preview that was shown', async () => {
    const prepared = await prepareSource(sourceUrl())
    const { snapshot } = await getDraft(prepared.draftToken)
    await getDb()
      .update(snapshots)
      .set({ preview: { ...generatedPreview, title: 'Changed after review' } })
      .where(eq(snapshots.id, snapshot.id))
    await expect(getDraft(prepared.draftToken)).rejects.toMatchObject({
      status: 410
    })
    await expect(publishPreview(prepared.draftToken)).rejects.toMatchObject({
      status: 410
    })
  })

  it('generates a preview for a fresh snapshot without a preview without refetching or advancing content freshness', async () => {
    const url = sourceUrl()
    const first = await prepareSource(url)
    const { snapshot } = await getDraft(first.draftToken)
    await getDb()
      .update(snapshots)
      .set({ preview: null })
      .where(eq(snapshots.id, snapshot.id))
    advance(limits.cooldownMs)
    const prepared = await prepareSource(url)
    expect(prepared.preview).toEqual(generatedPreview)
    expect((await getDraft(prepared.draftToken)).snapshot.id).toBe(snapshot.id)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(2)
    expect((await sourceRecord(url)).latestSnapshotVerifiedAt!.getTime()).toBe(
      baseTime.getTime()
    )
  })

  it('retries model failure after thirty seconds and never publishes an excerpt fallback', async () => {
    const url = sourceUrl()
    upstream.suggestPreview.mockRejectedValueOnce(
      new AppError('Summary generation failed. Please try again.', 503, 30)
    )
    await expect(prepareSource(url)).rejects.toMatchObject({
      status: 503,
      retryAfter: 30
    })
    const failed = await sourceRecord(url)
    expect(failed.latestSnapshotId).toBeNull()
    expect(failed.preparationLeaseToken).toBeNull()
    expect(failed.preparationRetryAfter!.getTime()).toBe(
      baseTime.getTime() + 30_000
    )
    advance(29_999)
    await expect(prepareSource(url)).rejects.toMatchObject({ status: 503 })
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
    advance(30_000)
    const prepared = await prepareSource(url)
    expect(prepared.preview).toEqual(generatedPreview)
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(2)
  })

  it('shares the manual cooldown across publications and admits checks at its exact boundary', async () => {
    const { source, prepared } = await preparedPublication()
    await publishPreview(prepared.draftToken)
    advance(limits.cooldownMs - 1)
    expect((await checkAvailability(source.id, 'manual')).status).toBe(
      'cooldown'
    )
    advance(limits.cooldownMs)
    const checks = await Promise.all(
      Array.from({ length: 10 }, () => checkAvailability(source.id, 'manual'))
    )
    expect(
      checks.filter((result) => result.status === 'available')
    ).toHaveLength(1)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
    expect((await checkAvailability(source.id, 'manual')).status).toBe(
      'cooldown'
    )
  })

  it('enforces five manual attempts per client atomically', async () => {
    const key = `test:manual:${randomUUID()}`
    rateKeys.push(key)
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () => enforceBudget(key, 5))
    )
    expect(
      attempts.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(5)
    expect(
      attempts
        .filter((result) => result.status === 'rejected')
        .every((result) => result.reason.status === 429)
    ).toBe(true)
  })

  it('runs one automatic check at the exact seven-day boundary and excludes concurrent preparation', async () => {
    const { source, url } = await preparedPublication()
    advance(limits.freshnessMs - 1)
    expect((await checkAvailability(source.id, 'automatic')).status).toBe(
      'cooldown'
    )
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)

    advance(limits.freshnessMs)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    upstream.fetchSource.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return { status: 'available', conversation: changed }
    })
    const check = checkAvailability(source.id, 'automatic')
    await entered.promise
    const overlap = await Promise.all(
      Array.from({ length: 8 }, () => checkAvailability(source.id, 'automatic'))
    )
    expect(overlap.every((result) => result.status === 'cooldown')).toBe(true)
    await expect(prepareSource(url)).rejects.toMatchObject({ status: 409 })
    release.resolve()
    expect((await check).status).toBe('available')
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
    const saved = await sourceRecord(url)
    expect(saved.lastCheckedAt!.getTime()).toBe(Date.now())
    expect(saved.latestSnapshotVerifiedAt!.getTime()).toBe(baseTime.getTime())
  })

  it('keeps saved content on a transient provider failure and backs off rather than checking on every visit', async () => {
    const { source, url, published } = await preparedPublication()
    advance(limits.freshnessMs)
    upstream.fetchSource.mockResolvedValue({
      status: 'inconclusive',
      reason: 'The provider returned HTTP 429.'
    })
    expect((await checkAvailability(source.id, 'automatic')).status).toBe(
      'inconclusive'
    )
    const attempted = await sourceRecord(url)
    expect(attempted.lastAttemptAt!.getTime()).toBe(Date.now())
    expect(attempted.lastCheckedAt!.getTime()).toBe(baseTime.getTime())
    expect(attempted.retryAfter!.getTime()).toBe(Date.now() + limits.cooldownMs)
    expect(
      (await getPublication('chatgpt', published.publicationId))!.disabled
    ).toBe(false)
    for (const mode of ['manual', 'automatic'] as const) {
      expect((await checkAvailability(source.id, mode)).status).toBe('cooldown')
    }
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
    advance(limits.freshnessMs + limits.cooldownMs)
    upstream.fetchSource.mockResolvedValue({
      status: 'available',
      conversation: original
    })
    expect((await checkAvailability(source.id, 'automatic')).status).toBe(
      'available'
    )
    expect((await sourceRecord(url)).retryAfter).toBeNull()
  })

  it('disables every publication on confirmed removal and rejects a still-unexpired stale draft', async () => {
    const { url, prepared, published, source } = await preparedPublication()
    await getDb()
      .update(sources)
      .set({
        latestSnapshotVerifiedAt: new Date(
          baseTime.getTime() - limits.freshnessMs
        )
      })
      .where(eq(sources.id, source.id))
    upstream.fetchSource.mockResolvedValueOnce({
      status: 'available',
      conversation: changed
    })
    const second = await prepareSource(url)
    const other = await publishPreview(second.draftToken)
    advance(limits.cooldownMs)
    expect(readDraftToken(prepared.draftToken).expiresAt).toBeGreaterThan(
      Date.now()
    )
    upstream.fetchSource.mockResolvedValue({
      status: 'unavailable',
      reason: 'This public share was removed.'
    })
    expect((await checkAvailability(source.id, 'manual')).status).toBe(
      'unavailable'
    )
    expect(
      (await getPublication('chatgpt', published.publicationId))!.disabled
    ).toBe(true)
    expect(
      (await getPublication('chatgpt', other.publicationId))!.disabled
    ).toBe(true)
    await expect(getDraft(prepared.draftToken)).rejects.toMatchObject({
      status: 410
    })
    await expect(publishPreview(prepared.draftToken)).rejects.toMatchObject({
      status: 410
    })
    const saved = await getDb()
      .select()
      .from(publications)
      .where(eq(publications.sourceId, source.id))
    expect(saved).toHaveLength(2)
    expect(saved.every((publication) => publication.disabledAt)).toBe(true)
  })

  it('permits verified recreation with a new link while permanently preserving old disabled publications', async () => {
    const { url, prepared, published, source } = await preparedPublication()
    advance(limits.cooldownMs)
    upstream.fetchSource.mockResolvedValueOnce({
      status: 'unavailable',
      reason: 'This public share was removed.'
    })
    await checkAvailability(source.id, 'manual')
    expect((await checkAvailability(source.id, 'automatic')).status).toBe(
      'unavailable'
    )
    const recreated = await prepareSource(url)
    const next = await publishPreview(recreated.draftToken)
    expect(next.publicationId).not.toBe(published.publicationId)
    expect(
      (await getPublication('chatgpt', next.publicationId))!.disabled
    ).toBe(false)
    expect(
      (await getPublication('chatgpt', published.publicationId))!.disabled
    ).toBe(true)
    expect((await sourceRecord(url)).publicationGeneration).toBe(1)
    await expect(publishPreview(prepared.draftToken)).rejects.toMatchObject({
      status: 410
    })
    expect(upstream.suggestPreview).toHaveBeenCalledTimes(1)
  })

  it('backs off failed initial preparations without saving an empty snapshot or repeating upstream work', async () => {
    const url = sourceUrl()
    upstream.fetchSource.mockResolvedValue({
      status: 'inconclusive',
      reason: 'The provider returned a browser challenge.'
    })
    await expect(prepareSource(url)).rejects.toMatchObject({ status: 422 })
    await expect(prepareSource(url)).rejects.toMatchObject({ status: 503 })
    const source = await sourceRecord(url)
    expect(source.latestSnapshotId).toBeNull()
    expect(source.lastCheckedAt).toBeNull()
    expect(source.preparationLeaseToken).toBeNull()
    expect(source.preparationRetryAfter!.getTime()).toBe(Date.now() + 60_000)
    expect(source.retryAfter!.getTime()).toBe(Date.now() + limits.cooldownMs)
    expect(
      await getDb()
        .select()
        .from(snapshots)
        .where(eq(snapshots.sourceId, source.id))
    ).toHaveLength(0)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
    expect(upstream.suggestPreview).not.toHaveBeenCalled()

    advance(59_999)
    await expect(prepareSource(url)).rejects.toMatchObject({
      status: 503,
      retryAfter: 1
    })
    expect(upstream.fetchSource).toHaveBeenCalledTimes(1)
    advance(60_000)
    upstream.fetchSource.mockResolvedValueOnce({
      status: 'available',
      conversation: original
    })
    expect((await prepareSource(url)).preview).toEqual(generatedPreview)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
  })

  it('prevents an expired preparation lease from overwriting a newer successful capture', async () => {
    const url = sourceUrl()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    upstream.fetchSource.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return { status: 'available', conversation: original }
    })
    const old = prepareSource(url)
    await entered.promise
    advance(60_001)
    upstream.fetchSource.mockResolvedValue({
      status: 'available',
      conversation: changed
    })
    const fresh = await prepareSource(url)
    const rejected = old.catch((err: unknown) => err)
    release.resolve()
    expect(await rejected).toMatchObject({ status: 409 })
    const saved = await getDraft(fresh.draftToken)
    expect(saved.snapshot.messages).toEqual(changed.messages)
    expect(saved.source.latestSnapshotId).toBe(saved.snapshot.id)
    expect(saved.source.preparationLeaseToken).toBeNull()
    expect(saved.source.preparationRetryAfter).toBeNull()
  })

  it('rejects a removal result that arrives exactly when its availability lease expires', async () => {
    const { source, url, published } = await preparedPublication()
    advance(limits.freshnessMs)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    upstream.fetchSource.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return { status: 'unavailable', reason: 'A stale removal response.' }
    })
    const check = checkAvailability(source.id, 'automatic')
    await entered.promise
    const claimed = await sourceRecord(url)
    vi.setSystemTime(claimed.checkLeaseUntil!)
    release.resolve()

    expect((await check).status).toBe('cooldown')
    const saved = await sourceRecord(url)
    expect(saved.availability).toBe('available')
    expect(saved.lastCheckedAt).toEqual(source.lastCheckedAt)
    expect(saved.lastAttemptAt).toEqual(claimed.lastAttemptAt)
    expect(saved.retryAfter).toEqual(claimed.retryAfter)
    expect(
      (await getPublication('chatgpt', published.publicationId))!.disabled
    ).toBe(false)
  })

  it('prevents an expired checker from disabling a source after a newer preparation succeeds', async () => {
    const { source, url, published } = await preparedPublication()
    advance(limits.freshnessMs)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    upstream.fetchSource.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
      return {
        status: 'unavailable',
        reason: 'An old removal response arrived late.'
      }
    })
    const oldCheck = checkAvailability(source.id, 'automatic')
    await entered.promise
    advance(limits.freshnessMs + 60_001)
    upstream.fetchSource.mockResolvedValue({
      status: 'available',
      conversation: changed
    })
    const fresh = await prepareSource(url)
    const latestPublication = await publishPreview(fresh.draftToken)
    const verified = await sourceRecord(url)
    expect(verified.checkLeaseToken).toBeNull()
    expect(verified.checkLeaseUntil).toBeNull()
    expect(verified.latestSnapshotId).not.toBe(source.latestSnapshotId)
    release.resolve()

    expect((await oldCheck).status).toBe('cooldown')
    expect(await sourceRecord(url)).toEqual(verified)
    expect((await getDraft(fresh.draftToken)).snapshot.messages).toEqual(
      changed.messages
    )
    for (const publicationId of [
      published.publicationId,
      latestPublication.publicationId
    ]) {
      expect((await getPublication('chatgpt', publicationId))!.disabled).toBe(
        false
      )
    }
  })

  it('cleans abandoned preparations behind more than one batch of old published-only sources', async () => {
    // An old, isolated fixture period keeps current local app data outside this sweep.
    const fixtureStart = new Date('2000-01-01T12:00:00.000Z')
    vi.setSystemTime(fixtureStart)
    // Keep more than one cleanup batch, without repeating publication workflows.
    const publishedOnly = Array.from({ length: 30 }, () => ({
      id: randomUUID(),
      url: sourceUrl(),
      snapshotId: randomUUID()
    }))
    await getDb()
      .insert(sources)
      .values(
        publishedOnly.map(({ id, url }) => ({
          id,
          provider: 'chatgpt' as const,
          canonicalUrl: url,
          providerShareId: url.split('/').at(-1)!,
          updatedAt: fixtureStart
        }))
      )
    await getDb()
      .insert(snapshots)
      .values(
        publishedOnly.map(({ id, snapshotId }) => ({
          id: snapshotId,
          sourceId: id,
          contentHash: randomUUID(),
          title: original.title,
          messages: original.messages,
          parserVersion: original.parserVersion,
          capturedAt: fixtureStart
        }))
      )
    await getDb()
      .insert(publications)
      .values(
        publishedOnly.map(({ id, snapshotId }) => ({
          sourceId: id,
          snapshotId,
          fingerprint: randomUUID(),
          ...generatedPreview
        }))
      )
    const abandonedUrl = sourceUrl()
    const abandoned = await prepareSource(abandonedUrl)
    const abandonedSnapshotId = readDraftToken(abandoned.draftToken).snapshotId
    const emptyUrl = sourceUrl()
    await getDb()
      .insert(sources)
      .values({
        provider: 'chatgpt',
        canonicalUrl: emptyUrl,
        providerShareId: emptyUrl.split('/').at(-1)!,
        updatedAt: fixtureStart
      })

    const cleanupTime =
      fixtureStart.getTime() + limits.freshnessMs + 2 * limits.cooldownMs
    vi.setSystemTime(new Date(cleanupTime - limits.cooldownMs))
    const recentUrl = sourceUrl()
    const recent = await prepareSource(recentUrl)
    vi.setSystemTime(new Date(cleanupTime))

    // Preserve the real atomic budget while separating this test from app cooldowns.
    const maintenanceKey = `test:cleanup:${randomUUID()}`
    rateKeys.push(maintenanceKey)
    const consumeBudget = databaseRateLimit.consumeRateLimit
    const budget = vi
      .spyOn(databaseRateLimit, 'consumeRateLimit')
      .mockImplementation((input) =>
        consumeBudget({
          ...input,
          key: input.key === 'maintenance:cleanup' ? maintenanceKey : input.key
        })
      )
    try {
      await cleanupPreparations()
    } finally {
      budget.mockRestore()
    }

    expect(
      await getDb()
        .select()
        .from(sources)
        .where(inArray(sources.canonicalUrl, [abandonedUrl, emptyUrl]))
    ).toHaveLength(0)
    expect(
      await getDb()
        .select()
        .from(snapshots)
        .where(eq(snapshots.id, abandonedSnapshotId))
    ).toHaveLength(0)
    expect((await getDraft(recent.draftToken)).snapshot.messages).toEqual(
      original.messages
    )
    const publishedSourceIds = publishedOnly.map((value) => value.id)
    expect(
      await getDb()
        .select()
        .from(sources)
        .where(inArray(sources.id, publishedSourceIds))
    ).toHaveLength(30)
    expect(
      await getDb()
        .select()
        .from(snapshots)
        .where(inArray(snapshots.sourceId, publishedSourceIds))
    ).toHaveLength(30)
    const preserved = await getDb()
      .select()
      .from(publications)
      .where(inArray(publications.sourceId, publishedSourceIds))
    expect(preserved).toHaveLength(30)
    expect(
      preserved.every((publication) => publication.disabledAt === null)
    ).toBe(true)
    expect(upstream.fetchSource).toHaveBeenCalledTimes(2)
  })
})

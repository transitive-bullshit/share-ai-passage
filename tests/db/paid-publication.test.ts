import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import sharp from 'sharp'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import { GET as publicImage } from '@/app/[provider]/[publicationId]/image/route'
import type { Actor } from '@/lib/actors'
import { readSavedDraft, reviseOwnedPublication } from '@/lib/account-drafts'
import { accountSubject } from '@/lib/accounts'
import { assertReadableCardText, renderCard } from '@/lib/card'
import { closeDatabase, getDb } from '@/lib/db'
import {
  assets,
  authUsers,
  billingAccounts,
  publications,
  savedDrafts,
  snapshots,
  sources
} from '@/lib/db/schema'
import { createDraftToken } from '@/lib/drafts'
import { message } from '@/lib/messages'
import { defaultTemplateRecipe, type DraftDesign } from '@/lib/paid-design'
import { assetSha256, readAssetBytes } from '@/lib/r2'
import { getPublication, publishPreview } from '@/lib/service'
import { socialTemplates } from '@/lib/social-templates'

const storage = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>() }))
vi.mock('@/lib/r2', async (original) => {
  const actual = await original<typeof import('@/lib/r2')>()
  return {
    ...actual,
    headAsset: vi.fn<typeof actual.headAsset>(async (_visibility, key) => {
      const bytes = storage.objects.get(key)
      return bytes
        ? {
            byteSize: bytes.length,
            sha256: actual.assetSha256(bytes),
            contentType: 'image/webp',
            etag: 'fixture'
          }
        : null
    }),
    putImmutableAsset: vi.fn<typeof actual.putImmutableAsset>(
      async ({ key, bytes }) => {
        const old = storage.objects.get(key)
        if (old && actual.assetSha256(old) !== actual.assetSha256(bytes))
          throw new Error('Immutable conflict')
        storage.objects.set(key, bytes)
        return { sha256: actual.assetSha256(bytes), byteSize: bytes.length }
      }
    ),
    readAssetBytes: vi.fn<typeof actual.readAssetBytes>(
      async (_visibility, key) => {
        const bytes = storage.objects.get(key)
        if (!bytes) throw new Error('Missing stored bytes')
        return Buffer.from(bytes)
      }
    )
  }
})
vi.mock('@/lib/card', async (original) => {
  const actual = await original<typeof import('@/lib/card')>()
  return {
    ...actual,
    assertReadableCardText: vi.fn<typeof actual.assertReadableCardText>(
      actual.assertReadableCardText
    ),
    renderCard: vi.fn<typeof actual.renderCard>(actual.renderCard)
  }
})
const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = [],
  sourceIds: string[] = []
const preview = {
  title: 'A fixed presentation',
  highlights: ['Your design stays yours']
}
async function fixture() {
  const userId = randomUUID()
  users.push(userId)
  await getDb()
    .insert(authUsers)
    .values({
      id: userId,
      name: 'Paid fixture',
      email: `${userId}@example.invalid`,
      emailVerified: true
    })
  await getDb()
    .insert(billingAccounts)
    .values({
      userId,
      paidPlan: 'plus',
      paidThrough: new Date(Date.now() + 86_400_000),
      allowanceAnchorAt: new Date()
    })
  const sourceId = randomUUID()
  sourceIds.push(sourceId)
  await getDb()
    .insert(sources)
    .values({
      id: sourceId,
      provider: 'chatgpt',
      canonicalUrl: `https://chatgpt.com/share/${sourceId}`,
      providerShareId: sourceId
    })
  const [snapshot] = await getDb()
    .insert(snapshots)
    .values({
      sourceId,
      contentHash: sourceId,
      title: preview.title,
      parserVersion: 'paid-fixture',
      preview,
      messages: [message('one', 'assistant', 'A fixture conversation.')]
    })
    .returning()
  const recipe = {
    ...defaultTemplateRecipe(),
    branding: { mode: 'none' as const },
    artDirection: 'PRIVATE STYLE INSTRUCTIONS'
  }
  const design: DraftDesign = {
    version: 1,
    recipe,
    fromTemplate: null,
    generatedImage: null
  }
  const actor: Actor = {
    userId,
    subjectKey: accountSubject(userId),
    allowance: 25,
    registered: true
  }
  const [draft] = await getDb()
    .insert(savedDrafts)
    .values({
      ownerId: userId,
      namespace: actor.subjectKey,
      requestKey: randomUUID(),
      sourceUrl: `https://chatgpt.com/share/${sourceId}`,
      sourceId,
      sourceGeneration: 0,
      snapshotId: snapshot!.id,
      status: 'ready',
      title: preview.title,
      highlights: preview.highlights,
      design
    })
    .returning()
  const token = createDraftToken(
    snapshot!.id,
    0,
    preview,
    Date.now(),
    undefined,
    { savedDraftId: draft!.id, revision: draft!.revision }
  )
  return { actor, userId, sourceId, draft: draft!, token }
}
describe.skipIf(!testUrl)('immutable paid publications', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterAll(async () => {
    if (users.length) {
      await getDb()
        .delete(savedDrafts)
        .where(inArray(savedDrafts.ownerId, users))
      await getDb()
        .delete(publications)
        .where(inArray(publications.ownerId, users))
      await getDb().delete(assets).where(inArray(assets.ownerId, users))
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    if (sourceIds.length)
      await getDb().delete(sources).where(inArray(sources.id, sourceIds))
    await closeDatabase()
  })
  it.each([false, true])(
    'rejects unreadable new work before persistence (paid design: %s) and retains full draft text',
    async (paid) => {
      const f = await fixture()
      const long = {
        title: 'Keep the full title',
        highlights: ['A'.repeat(1000), 'B'.repeat(1000), 'C'.repeat(637)]
      }
      await getDb()
        .update(savedDrafts)
        .set({ ...long, design: paid ? f.draft.design : null })
        .where(eq(savedDrafts.id, f.draft.id))
      const token = createDraftToken(
        f.draft.snapshotId!,
        0,
        long,
        Date.now(),
        undefined,
        { savedDraftId: f.draft.id, revision: f.draft.revision }
      )
      await expect(
        publishPreview(token, undefined, undefined, f.actor)
      ).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Shorten the highlights')
      })
      const [saved] = await getDb()
        .select()
        .from(savedDrafts)
        .where(eq(savedDrafts.id, f.draft.id))
      expect(saved).toMatchObject({ ...long, publishedPublicationId: null })
      expect(
        await getDb()
          .select()
          .from(publications)
          .where(eq(publications.ownerId, f.userId))
      ).toHaveLength(0)
      expect(
        await getDb().select().from(assets).where(eq(assets.ownerId, f.userId))
      ).toHaveLength(0)
      expect(renderCard).not.toHaveBeenCalled()
    }
  )

  it.each([false, true])(
    'reuses an existing publication before new readability validation (paid design: %s)',
    async (paid) => {
      const f = await fixture()
      if (!paid)
        await getDb()
          .update(savedDrafts)
          .set({ design: null })
          .where(eq(savedDrafts.id, f.draft.id))
      const first = await publishPreview(f.token, undefined, undefined, f.actor)
      const validations = vi.mocked(assertReadableCardText).mock.calls.length
      await vi.mocked(assertReadableCardText).withImplementation(
        async () => {
          throw new Error('Existing publications must not be revalidated')
        },
        async () => {
          expect(
            await publishPreview(f.token, undefined, undefined, f.actor)
          ).toEqual(first)
        }
      )
      expect(assertReadableCardText).toHaveBeenCalledTimes(validations)
    }
  )

  it('publishes once, serves frozen bytes after template changes, and omits private instructions', async () => {
    const f = await fixture()
    const first = await publishPreview(f.token, undefined, undefined, f.actor)
    const record = await getPublication('chatgpt', first.publicationId)
    expect(record?.publication).toMatchObject({
      cardVersion: 5,
      cardAssetId: expect.any(String)
    })
    expect(JSON.stringify(record)).not.toContain('PRIVATE STYLE INSTRUCTIONS')
    expect(record?.publication).not.toHaveProperty('design')
    expect(
      await publishPreview(f.token, undefined, undefined, f.actor)
    ).toEqual(first)
    expect(renderCard).toHaveBeenCalledTimes(1)
    const image = await publicImage(new Request('http://localhost/image'), {
      params: Promise.resolve({
        provider: 'chatgpt',
        publicationId: first.publicationId
      })
    })
    const original = Buffer.from(await image.arrayBuffer())
    const template = socialTemplates[0]!,
      previous = template.colors.text,
      previousCopyLeft = template.layout.copy.left
    template.colors.text = '#123456'
    template.layout.copy.left += 24
    try {
      const revised = await reviseOwnedPublication(
        f.actor,
        first.publicationId,
        randomUUID()
      )
      const resumed = await readSavedDraft(f.actor, revised.draftId)
      expect(resumed).toMatchObject({
        resolvedDesign: record!.publication.resolvedDesign
      })
      expect(
        record!.publication.resolvedDesign!.template.layout.copy.left
      ).not.toBe(template.layout.copy.left)
      await getDb()
        .update(billingAccounts)
        .set({ paidThrough: new Date(0) })
        .where(eq(billingAccounts.userId, f.userId))
      const repeated = await publicImage(
        new Request('http://localhost/image'),
        {
          params: Promise.resolve({
            provider: 'chatgpt',
            publicationId: first.publicationId
          })
        }
      )
      expect(Buffer.from(await repeated.arrayBuffer())).toEqual(original)
      expect(repeated.headers.get('cache-control')).toBe(
        'public, max-age=0, must-revalidate'
      )
      expect(repeated.headers.get('cdn-cache-control')).toBe(
        'public, max-age=86400, stale-while-revalidate=604800'
      )
      expect(repeated.headers.get('vercel-cdn-cache-control')).toBe(
        'public, max-age=2592000'
      )
      expect(renderCard).toHaveBeenCalledTimes(1)
    } finally {
      template.colors.text = previous
      template.layout.copy.left = previousCopyLeft
    }
  })
  it('checks availability before any frozen read and never falls back when bytes are missing', async () => {
    const f = await fixture()
    const published = await publishPreview(
      f.token,
      undefined,
      undefined,
      f.actor
    )
    const record = await getPublication('chatgpt', published.publicationId)
    const [card] = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.id, record!.publication.cardAssetId!))
    storage.objects.delete(card!.objectKey)
    const renders = vi.mocked(renderCard).mock.calls.length
    const missing = await publicImage(new Request('http://localhost/image'), {
      params: Promise.resolve({
        provider: 'chatgpt',
        publicationId: published.publicationId
      })
    })
    expect(missing.status).toBe(503)
    expect(renderCard).toHaveBeenCalledTimes(renders)
    vi.mocked(readAssetBytes).mockClear()
    await getDb()
      .update(sources)
      .set({ availability: 'unavailable' })
      .where(eq(sources.id, f.sourceId))
    const disabled = await publicImage(new Request('http://localhost/image'), {
      params: Promise.resolve({
        provider: 'chatgpt',
        publicationId: published.publicationId
      })
    })
    expect(disabled.headers.get('content-type')).toBe('image/webp')
    expect(readAssetBytes).not.toHaveBeenCalled()
    expect(renderCard).toHaveBeenLastCalledWith({ disabled: true })
  })
  it('rejects publication if source availability changes while card bytes are being rendered', async () => {
    const f = await fixture()
    const webp = await sharp({
      create: { width: 1200, height: 630, channels: 3, background: '#fff' }
    })
      .webp()
      .toBuffer()
    vi.mocked(renderCard).mockImplementationOnce(async () => {
      await getDb()
        .update(sources)
        .set({ availability: 'unavailable' })
        .where(eq(sources.id, f.sourceId))
      return new Response(new Uint8Array(webp))
    })
    await expect(
      publishPreview(f.token, undefined, undefined, f.actor)
    ).rejects.toMatchObject({ status: 410 })
    expect(
      await getDb()
        .select()
        .from(publications)
        .where(eq(publications.ownerId, f.userId))
    ).toHaveLength(0)
    expect(
      [...storage.objects.values()].some(
        (bytes) => assetSha256(bytes) === assetSha256(webp)
      )
    ).toBe(true)
  })
  it('blocks new publication after paid access ends without losing the saved recipe', async () => {
    const f = await fixture()
    await getDb()
      .update(billingAccounts)
      .set({ paidThrough: new Date(0) })
      .where(eq(billingAccounts.userId, f.userId))
    await expect(
      publishPreview(f.token, undefined, undefined, f.actor)
    ).rejects.toMatchObject({ status: 403 })
    expect(renderCard).not.toHaveBeenCalled()
    const [draft] = await getDb()
      .select()
      .from(savedDrafts)
      .where(eq(savedDrafts.id, f.draft.id))
    expect(draft?.design).toEqual(f.draft.design)
  })
})

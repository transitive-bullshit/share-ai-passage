import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import sharp from 'sharp'
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
  assetAccess,
  cleanupPrivateAssets,
  finalizeUpload,
  getOwnedAsset,
  listAssets,
  queueAccountAssetCleanup,
  removeAsset,
  reserveUpload,
  validateDraftDesign
} from '@/lib/assets'
import { closeDatabase, getDb } from '@/lib/db'
import {
  accountPreferences,
  assets,
  authUsers,
  billingAccounts,
  imageCreditGrants,
  imageOperations,
  savedDrafts,
  rateLimits
} from '@/lib/db/schema'
import { defaultTemplateRecipe } from '@/lib/paid-design'
import {
  assetSha256,
  presignUpload,
  signPrivateAssetRead,
  deletePrivateObject,
  headAsset,
  putImmutableAsset,
  readAssetBytes
} from '@/lib/r2'
import {
  defaultDraftDesign,
  deleteTemplate,
  listTemplates,
  saveTemplate,
  setDefaultTemplate,
  snapshotTemplate
} from '@/lib/templates'
import { lockUsageSubjects } from '@/lib/usage'
import { accountSubject } from '@/lib/accounts'

vi.mock('@/lib/r2', async (original) => ({
  ...(await original<typeof import('@/lib/r2')>()),
  r2Configured: () => true,
  presignUpload: vi.fn<typeof presignUpload>(async () => ({
    uploadUrl: 'https://fixture.invalid/upload',
    headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' }
  })),
  signPrivateAssetRead: vi.fn<typeof signPrivateAssetRead>(
    async () => 'https://fixture.invalid/private'
  ),
  headAsset: vi.fn<typeof headAsset>(),
  readAssetBytes: vi.fn<typeof readAssetBytes>(),
  putImmutableAsset: vi.fn<typeof putImmutableAsset>(),
  deletePrivateObject: vi.fn<typeof deletePrivateObject>(async () => {})
}))
const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = []
const assetIds: string[] = []
async function account(paid = true) {
  const id = randomUUID()
  users.push(id)
  await getDb()
    .insert(authUsers)
    .values({
      id,
      name: 'Asset fixture',
      email: `${id}@example.invalid`,
      emailVerified: true
    })
  if (paid)
    await getDb()
      .insert(billingAccounts)
      .values({
        userId: id,
        paidPlan: 'plus',
        paidThrough: new Date(Date.now() + 86_400_000),
        allowanceAnchorAt: new Date(),
        status: 'active'
      })
  return id
}
async function readyAsset(
  userId: string,
  purpose: 'background' | 'logo' | 'card' = 'background',
  byteSize = 1000
) {
  const id = randomUUID()
  assetIds.push(id)
  const [asset] = await getDb()
    .insert(assets)
    .values({
      id,
      ownerId: userId,
      purpose,
      visibility: purpose === 'card' ? 'public' : 'private',
      status: 'ready',
      objectKey: `${purpose === 'card' ? 'cards' : 'assets'}/${id}.webp`,
      byteSize,
      contentType: 'image/webp',
      sha256: 'a'.repeat(64),
      width: 100,
      height: 100
    })
    .returning()
  return asset!
}
async function upload(userId: string, bytes: Buffer) {
  const result = await reserveUpload(userId, {
    requestKey: randomUUID(),
    purpose: 'background',
    contentType: 'image/png',
    byteSize: bytes.length
  })
  assetIds.push(result.assetId)
  vi.mocked(headAsset).mockResolvedValue({
    byteSize: bytes.length,
    contentType: 'image/png',
    etag: 'fixture-etag',
    sha256: undefined
  })
  vi.mocked(readAssetBytes).mockResolvedValue(Buffer.from(bytes))
  return result.assetId
}
describe.skipIf(!testUrl)('owned asset and template transactions', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(putImmutableAsset).mockImplementation(async ({ bytes }) => ({
      byteSize: bytes.length,
      sha256: assetSha256(bytes)
    }))
  })
  afterAll(async () => {
    if (assetIds.length)
      await getDb().delete(assets).where(inArray(assets.id, assetIds))
    if (users.length) {
      await getDb().delete(assets).where(inArray(assets.ownerId, users))
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb()
        .delete(rateLimits)
        .where(
          inArray(
            rateLimits.key,
            users.map((id) => `uploads:${id}`)
          )
        )
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
  })
  it('serializes concurrent reservations at the library cap and rejects changed replay inputs', async () => {
    const userId = await account()
    await readyAsset(userId, 'background', 985_000_000)
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        reserveUpload(userId, {
          requestKey: randomUUID(),
          purpose: 'background',
          contentType: 'image/png',
          byteSize: 10_000_000
        })
      )
    )
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1
    )
    expect((await listAssets(userId)).usage).toMatchObject({
      usedBytes: 985_000_000,
      reservedBytes: 10_000_000
    })
    const other = await account()
    const input = {
      requestKey: randomUUID(),
      purpose: 'logo',
      contentType: 'image/png',
      byteSize: 500
    }
    const first = await reserveUpload(other, input)
    expect((await reserveUpload(other, input)).assetId).toBe(first.assetId)
    await expect(
      reserveUpload(other, { ...input, contentType: 'image/jpeg' })
    ).rejects.toMatchObject({ status: 409 })
  })
  it('finalizes validated bytes once and preserves original request identity after normalization', async () => {
    const userId = await account()
    const bytes = await sharp({
      create: { width: 32, height: 20, channels: 3, background: '#abcdef' }
    })
      .png()
      .toBuffer()
    const input = {
      requestKey: randomUUID(),
      purpose: 'background',
      contentType: 'image/png',
      byteSize: bytes.length
    }
    const reserved = await reserveUpload(userId, input)
    assetIds.push(reserved.assetId)
    vi.mocked(headAsset).mockResolvedValue({
      byteSize: bytes.length,
      contentType: 'image/png',
      etag: 'original',
      sha256: undefined
    })
    vi.mocked(readAssetBytes).mockResolvedValue(Buffer.from(bytes))
    const first = await finalizeUpload(userId, reserved.assetId)
    expect(await finalizeUpload(userId, reserved.assetId)).toEqual(first)
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
    expect(readAssetBytes).toHaveBeenCalledWith(
      'private',
      `uploads/${reserved.assetId}.upload`,
      10_000_000,
      'original'
    )
    expect((await reserveUpload(userId, input)).status).toBe('ready')
    await expect(
      reserveUpload(userId, { ...input, contentType: 'image/jpeg' })
    ).rejects.toMatchObject({ status: 409 })
    expect((await listAssets(userId)).usage.reservedBytes).toBe(0)
  })
  it('releases invalid uploads and isolates private images from other accounts', async () => {
    const userId = await account(),
      other = await account()
    const id = await upload(userId, Buffer.from('<svg>invalid</svg>'))
    await expect(finalizeUpload(userId, id)).rejects.toMatchObject({
      status: 400
    })
    expect((await listAssets(userId)).usage.reservedBytes).toBe(0)
    const image = await readyAsset(userId, 'background')
    await expect(assetAccess(other, image.id)).rejects.toMatchObject({
      status: 404
    })
    await expect(
      saveTemplate(other, {
        name: 'Foreign',
        recipe: {
          ...defaultTemplateRecipe(),
          background: { mode: 'uploaded', assetId: image.id }
        }
      })
    ).rejects.toMatchObject({ status: 404 })
  })
  it('retains archived selections for saved work while freeing library capacity', async () => {
    const userId = await account()
    const asset = await readyAsset(userId)
    const recipe = {
      ...defaultTemplateRecipe(),
      background: { mode: 'uploaded' as const, assetId: asset.id }
    }
    const previous = {
      version: 1 as const,
      recipe,
      fromTemplate: null
    }
    await removeAsset(userId, asset.id)
    expect((await listAssets(userId)).usage.usedBytes).toBe(0)
    expect((await getOwnedAsset(userId, asset.id)).id).toBe(asset.id)
    await expect(validateDraftDesign(userId, previous)).rejects.toMatchObject({
      status: 404
    })
    expect(
      await validateDraftDesign(userId, previous, undefined, previous)
    ).toEqual(previous)
  })
  it('copies recipes, protects template revisions, and clears a deleted default', async () => {
    const userId = await account()
    const recipe = defaultTemplateRecipe()
    const saved = (await saveTemplate(userId, { name: 'Original', recipe }))
      .template!
    const copy = await snapshotTemplate(userId, saved.id)
    await setDefaultTemplate(userId, saved.id)
    await saveTemplate(
      userId,
      {
        name: 'Updated',
        recipe: { ...recipe, branding: { mode: 'none' } },
        revision: saved.revision
      },
      saved.id
    )
    expect(copy.recipe.branding.mode).toBe('passage')
    expect((await defaultDraftDesign(userId))?.recipe.branding.mode).toBe(
      'none'
    )
    await expect(
      saveTemplate(
        userId,
        { name: 'Stale', recipe, revision: saved.revision },
        saved.id
      )
    ).rejects.toMatchObject({ status: 409 })
    await deleteTemplate(userId, saved.id)
    const [preferences] = await getDb()
      .select()
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, userId))
    expect(preferences?.defaultTemplateId).toBeNull()
    expect(copy.recipe).toEqual(recipe)
  })
  it('keeps cancelled templates readable but blocks further paid changes', async () => {
    const userId = await account()
    await saveTemplate(userId, {
      name: 'Kept',
      recipe: defaultTemplateRecipe()
    })
    await getDb()
      .update(billingAccounts)
      .set({ paidThrough: new Date(0) })
      .where(eq(billingAccounts.userId, userId))
    expect((await listTemplates(userId)).templates).toHaveLength(1)
    expect(await defaultDraftDesign(userId)).toBeNull()
    await expect(
      saveTemplate(userId, { name: 'Blocked', recipe: defaultTemplateRecipe() })
    ).rejects.toMatchObject({ status: 403 })
  })
  it('cannot finalize after account deletion and retries only private object cleanup', async () => {
    const userId = await account()
    const publicCard = await readyAsset(userId, 'card')
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#fff' }
    })
      .png()
      .toBuffer()
    const id = await upload(userId, bytes)
    vi.mocked(putImmutableAsset).mockImplementationOnce(
      async ({ bytes: output }) => {
        await getDb().transaction(async (tx) => {
          await lockUsageSubjects(tx, accountSubject(userId))
          await queueAccountAssetCleanup(userId, tx)
          await tx.delete(authUsers).where(eq(authUsers.id, userId))
        })
        return { sha256: assetSha256(output), byteSize: output.length }
      }
    )
    await expect(finalizeUpload(userId, id)).rejects.toMatchObject({
      status: 403
    })
    const [pending] = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.id, id))
    expect(pending).toMatchObject({
      ownerId: null,
      cleanupPending: true,
      status: 'failed'
    })
    await getDb()
      .update(assets)
      .set({ expiresAt: new Date(0), processingLeaseUntil: null })
      .where(eq(assets.id, id))
    await cleanupPrivateAssets()
    expect(
      await getDb().select().from(assets).where(eq(assets.id, id))
    ).toHaveLength(0)
    expect(
      await getDb().select().from(assets).where(eq(assets.id, publicCard.id))
    ).toHaveLength(1)
    expect(deletePrivateObject).not.toHaveBeenCalledWith(publicCard.objectKey)
  })
})

describe.skipIf(!testUrl)('private asset cleanup', () => {
  const assetIds: string[] = [],
    userIds: string[] = [],
    operationIds: string[] = [],
    grantIds: string[] = [],
    draftIds: string[] = []
  const past = new Date('2000-01-01T00:00:00Z')
  const later = new Date('2001-01-01T00:00:00Z')
  async function asset(overrides: Partial<typeof assets.$inferInsert> = {}) {
    const id = randomUUID()
    assetIds.push(id)
    const [record] = await getDb()
      .insert(assets)
      .values({
        id,
        purpose: 'background',
        visibility: 'private',
        status: 'failed',
        cleanupPending: true,
        objectKey: `${overrides.purpose === 'generated' ? 'generated' : 'assets'}/${id}.webp`,
        updatedAt: past,
        ...overrides
      })
      .returning()
    return record!
  }
  async function activeGeneratedAsset(ownerId?: string) {
    const record = await asset({ purpose: 'generated', ownerId })
    let draftId: string | undefined
    if (ownerId) {
      const [draft] = await getDb()
        .insert(savedDrafts)
        .values({
          ownerId,
          namespace: ownerId,
          requestKey: randomUUID(),
          sourceUrl: 'https://chatgpt.com/share/fixture',
          status: 'ready'
        })
        .returning()
      draftId = draft!.id
      draftIds.push(draftId)
    }
    const grantId = randomUUID()
    grantIds.push(grantId)
    operationIds.push(record.id)
    await getDb().insert(imageCreditGrants).values({
      id: grantId,
      userId: record.id,
      grantKey: record.id,
      kind: 'included',
      startsAt: past,
      allowance: 0
    })
    await getDb().insert(imageOperations).values({
      id: record.id,
      ownerId,
      draftId,
      subjectKey: record.id,
      requestKey: record.id,
      inputHash: 'fixture',
      draftRevision: 0,
      grantId,
      recipeHash: 'fixture',
      model: 'fixture',
      configVersion: 'fixture',
      promptVersion: 'fixture',
      config: {},
      status: 'uncertain',
      reservedCostMicros: 0,
      clientRequestId: record.id
    })
    return record
  }

  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })
  beforeEach(() => {
    vi.mocked(deletePrivateObject).mockReset().mockResolvedValue()
  })
  afterEach(async () => {
    if (operationIds.length)
      await getDb()
        .delete(imageOperations)
        .where(inArray(imageOperations.id, operationIds.splice(0)))
    if (assetIds.length)
      await getDb()
        .delete(assets)
        .where(inArray(assets.id, assetIds.splice(0)))
    if (grantIds.length)
      await getDb()
        .delete(imageCreditGrants)
        .where(inArray(imageCreditGrants.id, grantIds.splice(0)))
    if (draftIds.length)
      await getDb()
        .delete(savedDrafts)
        .where(inArray(savedDrafts.id, draftIds.splice(0)))
    if (userIds.length)
      await getDb()
        .delete(authUsers)
        .where(inArray(authUsers.id, userIds.splice(0)))
  })
  afterAll(closeDatabase)

  it('filters active jobs, processing leases and live upload URLs before the batch limit', async () => {
    const future = new Date(Date.now() + 60_000)
    const protectedAssets = [
      await activeGeneratedAsset(),
      await asset({ expiresAt: past, processingLeaseUntil: future }),
      await asset({ expiresAt: future }),
      await asset({ purpose: 'card', visibility: 'public' }),
      await asset({
        status: 'ready',
        cleanupPending: false,
        libraryDeletedAt: past
      })
    ]
    const eligible = await asset({ updatedAt: later })
    expect(await cleanupPrivateAssets(1)).toEqual({
      examined: 1,
      cleaned: 1,
      skipped: 0,
      failed: 0
    })
    expect(deletePrivateObject).toHaveBeenCalledExactlyOnceWith(
      eligible.objectKey
    )
    expect(
      await getDb().select().from(assets).where(eq(assets.id, eligible.id))
    ).toHaveLength(0)
    expect(
      await getDb()
        .select()
        .from(assets)
        .where(
          inArray(
            assets.id,
            protectedAssets.map((row) => row.id)
          )
        )
    ).toHaveLength(protectedAssets.length)
  })

  it('retains failed cleanup but advances the retry order so later work is not starved', async () => {
    const failing = await asset()
    const next = await asset({ updatedAt: later })
    vi.mocked(deletePrivateObject).mockRejectedValueOnce(
      new Error('Fixture storage failure')
    )
    expect(await cleanupPrivateAssets(1)).toEqual({
      examined: 1,
      cleaned: 0,
      skipped: 0,
      failed: 1
    })
    expect(
      await getDb().select().from(assets).where(eq(assets.id, failing.id))
    ).toHaveLength(1)
    expect(await cleanupPrivateAssets(1)).toEqual({
      examined: 1,
      cleaned: 1,
      skipped: 0,
      failed: 0
    })
    expect(deletePrivateObject).toHaveBeenNthCalledWith(2, next.objectKey)
    expect(
      await getDb().select().from(assets).where(eq(assets.id, next.id))
    ).toHaveLength(0)
    expect((await cleanupPrivateAssets(100)).failed).toBe(0)
    expect(
      vi
        .mocked(deletePrivateObject)
        .mock.calls.filter(([key]) => key === failing.objectKey)
    ).toHaveLength(2)
    expect(
      await getDb().select().from(assets).where(eq(assets.id, failing.id))
    ).toHaveLength(0)
  })

  it('does no storage work during an overlapping run and releases the lock afterward', async () => {
    const record = await asset()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.mocked(deletePrivateObject).mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
    })
    const first = cleanupPrivateAssets(1)
    try {
      await entered.promise
      expect(await cleanupPrivateAssets(1)).toEqual({
        examined: 0,
        cleaned: 0,
        skipped: 0,
        failed: 0
      })
      expect(deletePrivateObject).toHaveBeenCalledExactlyOnceWith(
        record.objectKey
      )
    } finally {
      release.resolve()
      await first
    }
    const next = await asset()
    expect(await cleanupPrivateAssets(1)).toEqual({
      examined: 1,
      cleaned: 1,
      skipped: 0,
      failed: 0
    })
    expect(deletePrivateObject).toHaveBeenLastCalledWith(next.objectKey)
  })
})

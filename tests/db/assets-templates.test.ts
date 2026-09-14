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
  purpose: 'background' | 'logo' | 'reference' | 'card' = 'background',
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
    const image = await readyAsset(userId, 'reference')
    await expect(assetAccess(other, image.id)).rejects.toMatchObject({
      status: 404
    })
    await expect(
      saveTemplate(other, {
        name: 'Foreign',
        recipe: { ...defaultTemplateRecipe(), referenceAssetId: image.id }
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
      fromTemplate: null,
      generatedImage: null
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

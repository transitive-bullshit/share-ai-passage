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
  cleanupPrivateAssets,
  queueAccountAssetCleanup,
  recoverGeneratedAsset,
  storePreauthorizedGeneratedAsset
} from '@/lib/assets'
import { closeDatabase, getDb } from '@/lib/db'
import {
  assets,
  authUsers,
  imageCreditGrants,
  imageOperations,
  savedDrafts
} from '@/lib/db/schema'
import {
  assetSha256,
  deletePrivateObject,
  headAsset,
  putImmutableAsset,
  readAssetBytes
} from '@/lib/r2'

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
            etag: 'fixture-etag'
          }
        : null
    }),
    readAssetBytes: vi.fn<typeof actual.readAssetBytes>(
      async (_visibility, key) => {
        const bytes = storage.objects.get(key)
        if (!bytes) throw new Error('Missing fixture object')
        return Buffer.from(bytes)
      }
    ),
    putImmutableAsset: vi.fn<typeof actual.putImmutableAsset>(
      async ({ key, bytes }) => {
        const prior = storage.objects.get(key)
        if (prior && actual.assetSha256(prior) !== actual.assetSha256(bytes))
          throw new Error('Immutable conflict')
        storage.objects.set(key, bytes)
        return { byteSize: bytes.length, sha256: actual.assetSha256(bytes) }
      }
    ),
    deletePrivateObject: vi.fn<typeof actual.deletePrivateObject>(
      async (key) => {
        storage.objects.delete(key)
      }
    )
  }
})
const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = [],
  operationIds: string[] = []
async function fixture() {
  const userId = randomUUID(),
    operationId = randomUUID()
  users.push(userId)
  operationIds.push(operationId)
  await getDb()
    .insert(authUsers)
    .values({
      id: userId,
      name: 'Image persistence fixture',
      email: `${userId}@example.invalid`,
      emailVerified: true
    })
  const [draft] = await getDb()
    .insert(savedDrafts)
    .values({
      ownerId: userId,
      namespace: userId,
      requestKey: randomUUID(),
      sourceUrl: 'https://chatgpt.com/share/fixture',
      status: 'ready'
    })
    .returning()
  const [grant] = await getDb()
    .insert(imageCreditGrants)
    .values({
      userId,
      grantKey: randomUUID(),
      kind: 'included',
      startsAt: new Date(),
      allowance: 10
    })
    .returning()
  await getDb().insert(imageOperations).values({
    id: operationId,
    ownerId: userId,
    subjectKey: userId,
    requestKey: randomUUID(),
    inputHash: 'fixture',
    draftId: draft!.id,
    draftRevision: 0,
    grantId: grant!.id,
    recipeHash: 'fixture',
    model: 'fixture',
    configVersion: 'fixture',
    promptVersion: 'fixture',
    config: {},
    status: 'running',
    reservedCostMicros: 1000,
    clientRequestId: randomUUID()
  })
  const key = `generated/${operationId}.webp`
  await getDb().insert(assets).values({
    id: operationId,
    ownerId: userId,
    purpose: 'generated',
    visibility: 'private',
    status: 'pending',
    objectKey: key
  })
  return { userId, operationId, key, draftId: draft!.id }
}
async function image(width = 1200, height = 640) {
  return sharp({
    create: { width, height, channels: 3, background: '#c9ac84' }
  })
    .png()
    .toBuffer()
}
describe.skipIf(!testUrl)('durable generated image assets', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterAll(async () => {
    if (operationIds.length) {
      await getDb()
        .delete(imageOperations)
        .where(inArray(imageOperations.id, operationIds))
      await getDb().delete(assets).where(inArray(assets.id, operationIds))
    }
    if (users.length) {
      await getDb()
        .delete(savedDrafts)
        .where(inArray(savedDrafts.ownerId, users))
      await getDb()
        .delete(imageCreditGrants)
        .where(inArray(imageCreditGrants.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
  })
  it('writes provider output before a database interruption and recovers exact normalized bytes without another PUT', async () => {
    const f = await fixture()
    const bytes = await image()
    const transaction = vi
      .spyOn(getDb(), 'transaction')
      .mockRejectedValueOnce(new Error('Fixture database interruption'))
    try {
      await expect(
        storePreauthorizedGeneratedAsset({ ...f, bytes })
      ).rejects.toThrow('Fixture database interruption')
      expect(putImmutableAsset).toHaveBeenCalledTimes(1)
      expect(storage.objects.has(f.key)).toBe(true)
    } finally {
      transaction.mockRestore()
    }
    const storedBytes = Buffer.from(storage.objects.get(f.key)!)
    const recovered = await recoverGeneratedAsset(f)
    expect(recovered).toMatchObject({
      id: f.operationId,
      status: 'ready',
      width: 1200,
      height: 640,
      sha256: assetSha256(storedBytes),
      byteSize: storedBytes.length
    })
    expect(readAssetBytes).toHaveBeenCalledWith(
      'private',
      f.key,
      10_000_000,
      'fixture-etag'
    )
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
    expect((await recoverGeneratedAsset(f))?.sha256).toBe(recovered!.sha256)
    expect(Buffer.from(storage.objects.get(f.key)!)).toEqual(storedBytes)
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
  })
  it('returns null only for a missing object and preserves storage failures', async () => {
    const f = await fixture()
    expect(await recoverGeneratedAsset(f)).toBeNull()
    expect(readAssetBytes).not.toHaveBeenCalled()
    vi.mocked(headAsset).mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(recoverGeneratedAsset(f)).rejects.toThrow(
      'Storage unavailable'
    )
    const [slot] = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.id, f.operationId))
    expect(slot?.status).toBe('pending')
  })
  it('rejects incorrect immutable metadata and unsupported dimensions before finalization', async () => {
    const f = await fixture()
    const bytes = await sharp(await image())
      .webp()
      .toBuffer()
    storage.objects.set(f.key, bytes)
    vi.mocked(headAsset).mockResolvedValueOnce({
      byteSize: bytes.length,
      contentType: 'image/webp',
      etag: 'fixture',
      sha256: '0'.repeat(64)
    })
    await expect(recoverGeneratedAsset(f)).rejects.toMatchObject({
      status: 502
    })
    storage.objects.set(
      f.key,
      await sharp(await image(1200, 630))
        .webp()
        .toBuffer()
    )
    await expect(recoverGeneratedAsset(f)).rejects.toMatchObject({
      status: 502
    })
    expect(putImmutableAsset).not.toHaveBeenCalled()
    const [slot] = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.id, f.operationId))
    expect(slot?.status).toBe('pending')
  })
  it('keeps the durable slot during deletion until a late provider result is settled', async () => {
    const f = await fixture()
    await getDb().transaction(async (tx) => {
      await queueAccountAssetCleanup(f.userId, tx)
    })
    await cleanupPrivateAssets(100)
    expect(deletePrivateObject).not.toHaveBeenCalledWith(f.key)
    await expect(
      storePreauthorizedGeneratedAsset({ ...f, bytes: await image() })
    ).rejects.toMatchObject({ status: 410 })
    expect(storage.objects.has(f.key)).toBe(true)
    await cleanupPrivateAssets(100)
    expect(storage.objects.has(f.key)).toBe(true)
    await getDb()
      .update(imageOperations)
      .set({ status: 'succeeded' })
      .where(eq(imageOperations.id, f.operationId))
    await cleanupPrivateAssets(100)
    expect(storage.objects.has(f.key)).toBe(false)
    expect(
      await getDb().select().from(assets).where(eq(assets.id, f.operationId))
    ).toHaveLength(0)
  })
  it('does not recreate a deleted draft when recovering its completed object', async () => {
    const f = await fixture()
    storage.objects.set(
      f.key,
      await sharp(await image())
        .webp()
        .toBuffer()
    )
    await getDb().delete(savedDrafts).where(eq(savedDrafts.id, f.draftId))
    await expect(recoverGeneratedAsset(f)).rejects.toMatchObject({
      status: 410
    })
    const [slot] = await getDb()
      .select()
      .from(assets)
      .where(eq(assets.id, f.operationId))
    expect(slot).toMatchObject({
      cleanupPending: true,
      ownerId: null,
      status: 'failed'
    })
    expect(putImmutableAsset).not.toHaveBeenCalled()
  })
})

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

import type { Actor } from '@/lib/actors'
import { deleteSavedDraft } from '@/lib/account-drafts'
import { queueAccountAssetCleanup } from '@/lib/assets'
import { closeDatabase, getDb } from '@/lib/db'
import {
  assets,
  authUsers,
  billingAccounts,
  imageCreditGrants,
  imageOperations,
  savedDrafts
} from '@/lib/db/schema'
import {
  applyImageResult,
  ensureImageEnqueued,
  presentImageJob,
  readOwnedImageJob,
  requestImageJob
} from '@/lib/image-jobs'
import {
  generateBackgroundImage,
  ImageGenerationError
} from '@/lib/image-model'
import { getImageUsage } from '@/lib/image-usage'
import { recoverImageResult, runImageGeneration } from '@/lib/image-worker'
import { defaultTemplateRecipe, type DraftDesign } from '@/lib/paid-design'
import { putImmutableAsset } from '@/lib/r2'
import { generatePassageBackground } from '@/workflows/generate-background'

const storage = vi.hoisted(() => ({ objects: new Map<string, Uint8Array>() }))
vi.mock('@/lib/r2', async (original) => {
  const actual = await original<typeof import('@/lib/r2')>()
  return {
    ...actual,
    r2Configured: () => true,
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
    readAssetBytes: vi.fn<typeof actual.readAssetBytes>(
      async (_visibility, key) => {
        const bytes = storage.objects.get(key)
        if (!bytes) throw new Error('Missing fixture object')
        return Buffer.from(bytes)
      }
    ),
    putImmutableAsset: vi.fn<typeof actual.putImmutableAsset>(
      async ({ key, bytes }) => {
        const old = storage.objects.get(key)
        if (old && actual.assetSha256(old) !== actual.assetSha256(bytes))
          throw new Error('Immutable conflict')
        storage.objects.set(key, bytes)
        return { sha256: actual.assetSha256(bytes), byteSize: bytes.length }
      }
    )
  }
})
vi.mock('@/lib/image-model', async (original) => {
  const actual = await original<typeof import('@/lib/image-model')>()
  return {
    ...actual,
    getImageGenerationConfig: () =>
      actual.getImageGenerationConfig({
        IMAGE_GENERATION_ENABLED: '1',
        IMAGE_AI_MONTHLY_BUDGET_USD: '2000',
        IMAGE_GENERATION_CONCURRENCY: '32'
      }),
    generateBackgroundImage: vi.fn<typeof actual.generateBackgroundImage>()
  }
})
const testUrl = process.env.TEST_DATABASE_URL
const users: string[] = [],
  operationIds: string[] = []
let providerBytes: Buffer
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function fixture() {
  const userId = randomUUID()
  users.push(userId)
  await getDb()
    .insert(authUsers)
    .values({
      id: userId,
      name: 'Job fixture',
      email: `${userId}@example.invalid`,
      emailVerified: true
    })
  await getDb()
    .insert(billingAccounts)
    .values({
      userId,
      paidPlan: 'plus',
      paidThrough: new Date(Date.now() + 86_400_000),
      allowanceAnchorAt: new Date(),
      status: 'active'
    })
  const actor: Actor = {
    userId,
    subjectKey: `user:${userId}`,
    registered: true,
    allowance: 25
  }
  const design: DraftDesign = {
    version: 1,
    recipe: { ...defaultTemplateRecipe(), background: { mode: 'generated' } },
    fromTemplate: null,
    generatedImage: null
  }
  const [draft] = await getDb()
    .insert(savedDrafts)
    .values({
      ownerId: userId,
      namespace: actor.subjectKey,
      requestKey: randomUUID(),
      sourceUrl: 'https://chatgpt.com/share/fixture',
      status: 'ready',
      title: 'Keep the finished result',
      highlights: ['Recover your image without another generation.'],
      design
    })
    .returning()
  return { userId, actor, draft: draft! }
}
async function request(
  f: Awaited<ReturnType<typeof fixture>>,
  requestKey = randomUUID()
) {
  const operation = await requestImageJob(
    f.actor,
    f.draft.id,
    f.draft.revision,
    requestKey
  )
  if (!operationIds.includes(operation.id)) operationIds.push(operation.id)
  return operation
}
async function result(operationId: string) {
  return {
    bytes: Buffer.from(providerBytes),
    provider: 'openai' as const,
    model: 'gpt-image-2.5-flare-2026-09-08' as const,
    clientRequestId: operationId,
    providerRequestId: 'fixture-provider-request',
    usage: { input_tokens: 100, output_tokens: 300 },
    actualCostMicros: 12000,
    durationMs: 1,
    width: 1200 as const,
    height: 640 as const,
    contentType: 'image/webp' as const
  }
}
async function savedDraft(id: string) {
  return (
    await getDb().select().from(savedDrafts).where(eq(savedDrafts.id, id))
  )[0]
}
async function savedOperation(id: string) {
  return (
    await getDb()
      .select()
      .from(imageOperations)
      .where(eq(imageOperations.id, id))
  )[0]!
}

describe.skipIf(!testUrl)('durable image orchestration', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl!
    providerBytes = await sharp({
      create: { width: 1200, height: 640, channels: 3, background: '#cab8a2' }
    })
      .webp()
      .toBuffer()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateBackgroundImage).mockImplementation(
      async ({ operationId }) => result(operationId)
    )
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
      await getDb()
        .delete(billingAccounts)
        .where(inArray(billingAccounts.userId, users))
      await getDb().delete(authUsers).where(inArray(authUsers.id, users))
    }
    await closeDatabase()
  })
  it('deduplicates queue delivery and concurrent Workflow invocations before the provider boundary', async () => {
    const f = await fixture(),
      requestKey = randomUUID()
    const operations = await Promise.all([
      request(f, requestKey),
      request(f, requestKey)
    ])
    expect(new Set(operations.map((operation) => operation.id)).size).toBe(1)
    const operation = operations[0]!
    const enqueue = vi.fn<() => Promise<{ runId: string }>>(async () => ({
      runId: 'fixture-workflow-run'
    }))
    enqueue.mockRejectedValueOnce(
      new Error('Queue accepted but response was lost')
    )
    await Promise.all([
      ensureImageEnqueued(operation.id, enqueue),
      ensureImageEnqueued(operation.id, enqueue)
    ])
    expect(enqueue).toHaveBeenCalledTimes(1)
    await getDb()
      .update(imageOperations)
      .set({ dispatchLeaseUntil: new Date(Date.now() - 1) })
      .where(eq(imageOperations.id, operation.id))
    await ensureImageEnqueued(operation.id, enqueue)
    expect(enqueue).toHaveBeenCalledTimes(2)
    const entered = deferred<void>(),
      release = deferred<void>()
    vi.mocked(generateBackgroundImage).mockImplementationOnce(
      async ({ operationId }) => {
        entered.resolve()
        await release.promise
        return result(operationId)
      }
    )
    const first = generatePassageBackground(operation.id)
    await entered.promise
    await expect(
      generatePassageBackground(operation.id)
    ).resolves.toMatchObject({ status: 'running' })
    release.resolve()
    await expect(first).resolves.toMatchObject({ status: 'succeeded' })
    await expect(
      generatePassageBackground(operation.id)
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
    expect(await savedDraft(f.draft.id)).toMatchObject({
      revision: 1,
      design: {
        generatedImage: { operationId: operation.id, assetId: operation.id }
      }
    })
    expect(await getImageUsage(f.userId)).toMatchObject({
      used: 1,
      reserved: 0,
      remaining: 9
    })
  })
  it('recovers a durable result after DB finalization interruption without provider retry or replacement bytes', async () => {
    const f = await fixture(),
      operation = await request(f)
    const originalPut = vi.mocked(putImmutableAsset).getMockImplementation()!
    let restoreTransaction: (() => void) | undefined
    vi.mocked(putImmutableAsset).mockImplementationOnce(async (input) => {
      const stored = await originalPut(input)
      const transaction = vi
        .spyOn(getDb(), 'transaction')
        .mockRejectedValueOnce(
          new Error('Fixture DB finalization interruption')
        )
      restoreTransaction = () => transaction.mockRestore()
      return stored
    })
    try {
      await expect(runImageGeneration(operation.id)).resolves.toMatchObject({
        status: 'uncertain'
      })
    } finally {
      restoreTransaction?.()
    }
    const key = `generated/${operation.id}.webp`,
      originalBytes = Buffer.from(storage.objects.get(key)!)
    expect(await recoverImageResult(operation.id)).toMatchObject({
      status: 'succeeded'
    })
    expect(await savedOperation(operation.id)).toMatchObject({
      resultAssetId: operation.id,
      actualCostMicros: 12000,
      providerRequestId: 'fixture-provider-request'
    })
    expect(Buffer.from(storage.objects.get(key)!)).toEqual(originalBytes)
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
  })
  it('keeps an unknown provider outcome reserved across Workflow replay without redispatch', async () => {
    const f = await fixture(),
      operation = await request(f)
    vi.mocked(generateBackgroundImage).mockRejectedValueOnce(
      new ImageGenerationError('PROVIDER_UNCERTAIN', 'uncertain', true, {
        providerRequestId: 'fixture-interrupted-request'
      })
    )
    await expect(
      generatePassageBackground(operation.id)
    ).resolves.toMatchObject({ status: 'uncertain' })
    await expect(
      generatePassageBackground(operation.id)
    ).resolves.toMatchObject({ status: 'uncertain' })
    expect(await presentImageJob(f.actor, operation.id)).toMatchObject({
      status: 'uncertain',
      resultAssetId: null,
      usage: { used: 0, reserved: 1 }
    })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
    expect(putImmutableAsset).not.toHaveBeenCalled()
  })
  it('rejects another owner and a closing account before reserving or reading jobs', async () => {
    const f = await fixture(),
      other = await fixture(),
      operation = await request(f)
    await expect(
      requestImageJob(other.actor, f.draft.id, 0, randomUUID())
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      readOwnedImageJob(other.actor, operation.id)
    ).rejects.toMatchObject({ status: 404 })
    await getDb()
      .update(authUsers)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(authUsers.id, f.userId))
    await expect(
      requestImageJob(f.actor, f.draft.id, 0, randomUUID())
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      readOwnedImageJob(f.actor, operation.id)
    ).rejects.toMatchObject({ status: 403 })
    await expect(runImageGeneration(operation.id)).resolves.toMatchObject({
      status: 'cancelled'
    })
    expect(generateBackgroundImage).not.toHaveBeenCalled()
  })
  it('keeps edits made during generation and requires an explicit apply against their current revision', async () => {
    const f = await fixture(),
      operation = await request(f)
    vi.mocked(generateBackgroundImage).mockImplementationOnce(
      async ({ operationId }) => {
        await getDb()
          .update(savedDrafts)
          .set({ title: 'My newer title', revision: 1 })
          .where(eq(savedDrafts.id, f.draft.id))
        return result(operationId)
      }
    )
    await runImageGeneration(operation.id)
    expect(await savedDraft(f.draft.id)).toMatchObject({
      title: 'My newer title',
      revision: 1,
      design: { generatedImage: null }
    })
    expect(await presentImageJob(f.actor, operation.id)).toMatchObject({
      status: 'succeeded',
      applied: false,
      canApply: true
    })
    await expect(
      applyImageResult(f.actor, operation.id, 0)
    ).rejects.toMatchObject({ status: 409 })
    await expect(
      applyImageResult(f.actor, operation.id, 1)
    ).resolves.toMatchObject({ applied: true })
    expect(await savedDraft(f.draft.id)).toMatchObject({
      title: 'My newer title',
      revision: 2,
      design: { generatedImage: { operationId: operation.id } }
    })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
  })
  it('finishes an accepted title-only job after paid access expires but rejects a fresh generation', async () => {
    const f = await fixture()
    await getDb()
      .update(savedDrafts)
      .set({ highlights: [] })
      .where(eq(savedDrafts.id, f.draft.id))
    const operation = await request(f)
    await getDb()
      .update(billingAccounts)
      .set({ paidThrough: new Date(Date.now() - 1000) })
      .where(eq(billingAccounts.userId, f.userId))
    await expect(runImageGeneration(operation.id)).resolves.toMatchObject({
      status: 'succeeded'
    })
    await expect(
      requestImageJob(f.actor, f.draft.id, 1, randomUUID())
    ).rejects.toMatchObject({ status: 403 })
    expect(await savedDraft(f.draft.id)).toMatchObject({
      design: { generatedImage: { operationId: operation.id } }
    })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
  })
  it('settles usable output once after draft deletion without restoring private content', async () => {
    const f = await fixture(),
      operation = await request(f)
    vi.mocked(generateBackgroundImage).mockImplementationOnce(
      async ({ operationId }) => {
        await deleteSavedDraft(f.actor, f.draft.id)
        return result(operationId)
      }
    )
    await expect(runImageGeneration(operation.id)).resolves.toMatchObject({
      status: 'succeeded'
    })
    expect(await savedOperation(operation.id)).toMatchObject({
      resultAssetId: null,
      recipe: null,
      prompt: null,
      actualCostMicros: 12000
    })
    expect(await savedDraft(f.draft.id)).toMatchObject({
      deletedAt: expect.any(Date),
      title: '',
      design: null
    })
    expect(await getImageUsage(f.userId)).toMatchObject({
      used: 1,
      reserved: 0
    })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
  })
  it('recovers verified usable output even when deletion follows a persistence interruption', async () => {
    const f = await fixture(),
      operation = await request(f)
    const originalPut = vi.mocked(putImmutableAsset).getMockImplementation()!
    let restoreTransaction: (() => void) | undefined
    vi.mocked(putImmutableAsset).mockImplementationOnce(async (input) => {
      const stored = await originalPut(input)
      const transaction = vi
        .spyOn(getDb(), 'transaction')
        .mockRejectedValueOnce(new Error('Fixture DB interruption'))
      restoreTransaction = () => transaction.mockRestore()
      return stored
    })
    try {
      await runImageGeneration(operation.id)
    } finally {
      restoreTransaction?.()
    }
    await getDb().transaction(async (tx) => {
      await queueAccountAssetCleanup(f.userId, tx)
      await tx.delete(authUsers).where(eq(authUsers.id, f.userId))
    })
    await expect(recoverImageResult(operation.id)).resolves.toMatchObject({
      status: 'succeeded'
    })
    expect(await savedOperation(operation.id)).toMatchObject({
      ownerId: null,
      draftId: null,
      resultAssetId: null,
      recipe: null,
      prompt: null
    })
    const [grant] = await getDb()
      .select()
      .from(imageCreditGrants)
      .where(eq(imageCreditGrants.id, operation.grantId))
    expect(grant).toMatchObject({ used: 1, reserved: 0 })
    expect(generateBackgroundImage).toHaveBeenCalledTimes(1)
    expect(putImmutableAsset).toHaveBeenCalledTimes(1)
  })
  it('cancels queued work before provider dispatch and restores the reserved credit', async () => {
    const f = await fixture(),
      operation = await request(f)
    await ensureImageEnqueued(operation.id, async () => ({ runId: 'fixture' }))
    await deleteSavedDraft(f.actor, f.draft.id)
    await expect(
      generatePassageBackground(operation.id)
    ).resolves.toMatchObject({ status: 'cancelled' })
    expect(generateBackgroundImage).not.toHaveBeenCalled()
    expect(putImmutableAsset).not.toHaveBeenCalled()
    expect(await getImageUsage(f.userId)).toMatchObject({
      used: 0,
      reserved: 0,
      remaining: 10
    })
  })
})

import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '@/lib/db'
import { consumeRateLimit } from '@/lib/db/rate-limit'
import { publications, rateLimits, snapshots, sources } from '@/lib/db/schema'

const testUrl = process.env.TEST_DATABASE_URL
const sourceIds: string[] = []
const rateKeys: string[] = []

function rateKey() {
  const key = `test:${randomUUID()}`
  rateKeys.push(key)
  return key
}

async function createSource() {
  const shareId = randomUUID()
  const [source] = await getDb()
    .insert(sources)
    .values({
      provider: 'chatgpt',
      canonicalUrl: `https://chatgpt.com/share/${shareId}`,
      providerShareId: shareId
    })
    .returning()
  sourceIds.push(source!.id)
  return source!
}

async function createSnapshot(sourceId: string) {
  const [snapshot] = await getDb()
    .insert(snapshots)
    .values({
      sourceId,
      contentHash: randomUUID(),
      title: 'A saved conversation',
      messages: [
        {
          id: 'm1',
          speaker: 'assistant',
          markdown: 'Hello 🌎 world',
          text: 'Hello 🌎 world'
        }
      ],
      parserVersion: 'test-v1'
    })
    .returning()
  return snapshot!
}

describe.skipIf(!testUrl)('PostgreSQL persistence and concurrency', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = testUrl!
  })

  afterAll(async () => {
    if (sourceIds.length)
      await getDb().delete(sources).where(inArray(sources.id, sourceIds))
    if (rateKeys.length)
      await getDb().delete(rateLimits).where(inArray(rateLimits.key, rateKeys))
    await closeDatabase()
  })

  it('admits exactly the configured budget under concurrent requests', async () => {
    const key = rateKey()
    const now = new Date()
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        consumeRateLimit({ key, limit: 10, windowMs: 60_000, now })
      )
    )

    expect(results.filter((result) => result.allowed)).toHaveLength(10)
    expect(
      results.every(
        (result) => result.resetAt.getTime() === now.getTime() + 60_000
      )
    ).toBe(true)
    expect(results.every((result) => result.remaining >= 0)).toBe(true)
  })

  it('resets at the exact expiry without extending the window on rejected requests', async () => {
    const key = rateKey()
    const now = new Date()
    await consumeRateLimit({ key, limit: 1, windowMs: 1_000, now })
    const rejected = await consumeRateLimit({
      key,
      limit: 1,
      windowMs: 1_000,
      now: new Date(now.getTime() + 999)
    })
    const reset = await consumeRateLimit({
      key,
      limit: 1,
      windowMs: 1_000,
      now: new Date(now.getTime() + 1_000)
    })

    expect(rejected.allowed).toBe(false)
    expect(rejected.resetAt.getTime()).toBe(now.getTime() + 1_000)
    expect(reset.allowed).toBe(true)
    expect(reset.resetAt.getTime()).toBe(now.getTime() + 2_000)
  })

  it('keeps separate client buckets independent', async () => {
    const now = new Date()
    const first = await consumeRateLimit({
      key: rateKey(),
      limit: 1,
      windowMs: 1_000,
      now
    })
    const second = await consumeRateLimit({
      key: rateKey(),
      limit: 1,
      windowMs: 1_000,
      now
    })
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(true)
  })

  it('deduplicates concurrent captures of identical source content', async () => {
    const source = await createSource()
    const value = {
      sourceId: source.id,
      contentHash: randomUUID(),
      title: 'Same content',
      messages: [
        {
          id: 'm1',
          speaker: 'user' as const,
          markdown: 'Saved text',
          text: 'Saved text'
        }
      ],
      parserVersion: 'test-v1'
    }
    const inserted = await Promise.all(
      Array.from({ length: 12 }, () =>
        getDb()
          .insert(snapshots)
          .values(value)
          .onConflictDoNothing()
          .returning()
      )
    )
    expect(inserted.flat()).toHaveLength(1)
  })

  it('enforces publication idempotency while preserving independent previews and later generations', async () => {
    const source = await createSource()
    const snapshot = await createSnapshot(source.id)
    const value = {
      sourceId: source.id,
      snapshotId: snapshot.id,
      fingerprint: 'same-preview',
      title: 'A useful conversation',
      messageId: 'm1',
      excerptStart: 0,
      excerptEnd: 7
    }
    const inserted = await Promise.all(
      Array.from({ length: 12 }, () =>
        getDb()
          .insert(publications)
          .values(value)
          .onConflictDoNothing()
          .returning()
      )
    )
    const original = inserted.flat()[0]!
    expect(inserted.flat()).toHaveLength(1)

    const [different] = await getDb()
      .insert(publications)
      .values({
        ...value,
        fingerprint: 'different-preview',
        title: 'Another useful title'
      })
      .returning()
    expect(different!.id).not.toBe(original.id)
    await getDb()
      .update(publications)
      .set({ disabledAt: new Date() })
      .where(eq(publications.id, original.id))
    const [later] = await getDb()
      .insert(publications)
      .values({ ...value, generation: 1 })
      .returning()
    const [savedOriginal] = await getDb()
      .select()
      .from(publications)
      .where(eq(publications.id, original.id))
    expect(later!.id).not.toBe(original.id)
    expect(savedOriginal!.disabledAt).toBeInstanceOf(Date)
    expect(savedOriginal!.title).toBe('A useful conversation')
  })

  it('rejects a publication that points to another source’s snapshot', async () => {
    const source = await createSource()
    const otherSource = await createSource()
    const snapshot = await createSnapshot(source.id)

    await expect(
      getDb().insert(publications).values({
        sourceId: otherSource.id,
        snapshotId: snapshot.id,
        fingerprint: randomUUID(),
        title: 'A mismatched source',
        messageId: 'm1',
        excerptStart: 0,
        excerptEnd: 5
      })
    ).rejects.toThrow()
  })
})

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { closeDatabase, getDb } from '@/lib/db'
import { consumeRateLimit } from '@/lib/db/rate-limit'
import { publications, rateLimits, snapshots, sources } from '@/lib/db/schema'
import { message } from '@/lib/messages'

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
      messages: [message('m1', 'assistant', 'Hello 🌎 world')],
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
      messages: [message('m1', 'user', 'Saved text')],
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
      highlights: ['A concise saved summary']
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

  it('rejects invalid or missing publication highlights', async () => {
    const source = await createSource()
    const snapshot = await createSnapshot(source.id)
    const invalidHighlights = [
      sql`NULL`,
      ...[null, [], {}, ['one', 'two', 'three', 'four']].map(
        (value) => sql`${JSON.stringify(value)}::jsonb`
      )
    ]
    for (const highlights of invalidHighlights) {
      await expect(
        getDb().insert(publications).values({
          sourceId: source.id,
          snapshotId: snapshot.id,
          fingerprint: randomUUID(),
          title: 'A saved preview',
          highlights
        })
      ).rejects.toThrow()
    }
  })

  it('migrates saved messages without changing text, order, roles, or existing content blocks', async () => {
    const oldMessages = [
      {
        id: 'one',
        speaker: 'user',
        markdown: '**Original** 🌱\n\n[Image omitted]',
        text: 'Original 🌱'
      },
      {
        id: 'two',
        speaker: 'assistant',
        markdown: '```ts\nconst a = 1\n```',
        text: 'const a = 1'
      },
      { id: 'three', speaker: 'tool', markdown: '', text: '' },
      message('four', 'developer', 'Keep this structured message unchanged.')
    ]
    const migration = await readFile(
      new URL(
        '../../drizzle/0004_responses_message_content.sql',
        import.meta.url
      ),
      'utf8'
    )
    await getDb().transaction(async (tx) => {
      // A temporary table isolates the real migration from saved development data.
      await tx.execute(
        sql`CREATE TEMPORARY TABLE snapshots (id integer, messages jsonb) ON COMMIT DROP`
      )
      await tx.execute(
        sql`INSERT INTO snapshots VALUES (1, ${JSON.stringify(oldMessages)}::jsonb)`
      )
      await tx.execute(sql.raw(migration))
      const [saved] = await tx.execute<{ messages: unknown[] }>(
        sql`SELECT messages FROM snapshots WHERE id = 1`
      )
      expect(saved!.messages).toEqual([
        message('one', 'user', '**Original** 🌱\n\n[Image omitted]'),
        message('two', 'assistant', '```ts\nconst a = 1\n```'),
        message('three', 'tool', ''),
        oldMessages[3]
      ])
      await tx.execute(sql.raw(migration))
      const [repeated] = await tx.execute<{ messages: unknown[] }>(
        sql`SELECT messages FROM snapshots WHERE id = 1`
      )
      expect(repeated!.messages).toEqual(saved!.messages)
    })
  })

  it('rejects a publication that points to another source’s snapshot', async () => {
    const source = await createSource()
    const otherSource = await createSource()
    const snapshot = await createSnapshot(source.id)

    await expect(
      getDb()
        .insert(publications)
        .values({
          sourceId: otherSource.id,
          snapshotId: snapshot.id,
          fingerprint: randomUUID(),
          title: 'A mismatched source',
          highlights: ['A concise saved summary']
        })
    ).rejects.toThrow()
  })
})

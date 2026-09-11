import { sql } from 'drizzle-orm'

import { getDb } from './index'
import { rateLimits } from './schema'

/** One atomic upsert keeps concurrent requests within the same fixed window. */
export async function consumeRateLimit({
  key,
  limit,
  windowMs,
  now = new Date()
}: {
  key: string
  limit: number
  windowMs: number
  now?: Date
}) {
  if (
    !key ||
    key.length > 200 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit >= 2_147_483_647 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1 ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error('Invalid rate limit configuration.')
  }

  const expiresAt = new Date(now.getTime() + windowMs)
  const [record] = await getDb()
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.expiresAt} <= ${now.toISOString()}::timestamptz then 1 else least(${rateLimits.count} + 1, ${limit + 1}) end`,
        expiresAt: sql`case when ${rateLimits.expiresAt} <= ${now.toISOString()}::timestamptz then ${expiresAt.toISOString()}::timestamptz else ${rateLimits.expiresAt} end`
      }
    })
    .returning()

  if (!record) throw new Error('Could not record request budget.')

  return {
    allowed: record.count <= limit,
    remaining: Math.max(0, limit - record.count),
    resetAt: record.expiresAt
  }
}

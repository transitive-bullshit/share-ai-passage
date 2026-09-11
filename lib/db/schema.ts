import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

import type { GeneratedPreview, Message } from '@/lib/domain'
import type { CardAppearance } from '@/lib/card-appearance'

export const providerEnum = pgEnum('provider', ['chatgpt', 'claude'])
export const availabilityEnum = pgEnum('availability', [
  'available',
  'unavailable'
])

export const sources = pgTable(
  'sources',
  {
    // Internal identity of the upstream public share.
    id: uuid('id').defaultRandom().primaryKey(),
    // AI service hosting the original share.
    provider: providerEnum('provider').notNull(),
    // Normalized public URL used to fetch the original.
    canonicalUrl: text('canonical_url').notNull(),
    // Share identifier assigned by the provider.
    providerShareId: text('provider_share_id').notNull(),
    // Most recently verified saved capture.
    latestSnapshotId: uuid('latest_snapshot_id').references(
      (): AnyPgColumn => snapshots.id,
      { onDelete: 'set null' }
    ),
    // Last complete fetch confirming the latest capture.
    latestSnapshotVerifiedAt: timestamp('latest_snapshot_verified_at', {
      withTimezone: true
    }),
    // Last known public accessibility of the source.
    availability: availabilityEnum('availability')
      .notNull()
      .default('available'),
    // Increments on recovery so disabled links stay disabled.
    publicationGeneration: integer('publication_generation')
      .notNull()
      .default(0),
    // Last preparation or availability-check attempt.
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    // Last conclusive availability result.
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    // Earliest availability retry after an inconclusive result.
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    // Earliest user-requested availability check.
    manualCheckAfter: timestamp('manual_check_after', { withTimezone: true }),
    // Identifies the active preparation attempt.
    preparationLeaseToken: uuid('preparation_lease_token'),
    // Expiry of the preparation lock.
    preparationLeaseUntil: timestamp('preparation_lease_until', {
      withTimezone: true
    }),
    // Earliest creation retry after preparation fails.
    preparationRetryAfter: timestamp('preparation_retry_after', {
      withTimezone: true
    }),
    // Identifies the active availability check.
    checkLeaseToken: uuid('check_lease_token'),
    // Expiry of the availability-check lock.
    checkLeaseUntil: timestamp('check_lease_until', { withTimezone: true }),
    // When this source was first registered.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When source state last changed.
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('sources_canonical_url_unique').on(table.canonicalUrl),
    uniqueIndex('sources_provider_share_unique').on(
      table.provider,
      table.providerShareId
    ),
    index('sources_updated_at_idx').on(table.updatedAt),
    index('sources_latest_snapshot_idx').on(table.latestSnapshotId),
    check(
      'sources_generation_nonnegative',
      sql`${table.publicationGeneration} >= 0`
    )
  ]
)

export const snapshots = pgTable(
  'snapshots',
  {
    // Identity of this saved capture.
    id: uuid('id').defaultRandom().primaryKey(),
    // Public share this capture came from.
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    // Deduplicates normalized content within a source.
    contentHash: text('content_hash').notNull(),
    // Original conversation title from the provider.
    title: text('title').notNull(),
    // Ordered normalized conversation content.
    messages: jsonb('messages').$type<Message[]>().notNull(),
    // Adapter version that produced this capture.
    parserVersion: text('parser_version').notNull(),
    // Cached generated title and highlights, when prepared.
    preview: jsonb('preview').$type<GeneratedPreview>(),
    // When this content was first saved.
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('snapshots_source_hash_unique').on(
      table.sourceId,
      table.contentHash
    ),
    unique('snapshots_id_source_unique').on(table.id, table.sourceId),
    index('snapshots_captured_at_idx').on(table.capturedAt),
    check(
      'snapshots_messages_nonempty',
      sql`jsonb_array_length(${table.messages}) > 0`
    )
  ]
)

export const publications = pgTable(
  'publications',
  {
    // Public identity used in the share URL.
    id: uuid('id').defaultRandom().primaryKey(),
    // Original share whose availability governs this publication.
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    // Fixed conversation capture shown by the reader.
    snapshotId: uuid('snapshot_id').notNull(),
    // Deduplicates the snapshot, preview, style, and renderer version.
    fingerprint: text('fingerprint').notNull(),
    // Source generation when this publication was created.
    generation: integer('generation').notNull().default(0),
    // Reviewed title fixed at publication.
    title: text('title').notNull(),
    // Reviewed summary points fixed at publication.
    highlights: jsonb('highlights').$type<string[]>().notNull(),
    // Selected social-card style.
    appearance: jsonb('appearance').$type<CardAppearance>(),
    // Rendering format included in publication identity.
    cardVersion: integer('card_version').notNull().default(1),
    // When source removal disabled this publication.
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    // When this share URL was first published.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    foreignKey({
      columns: [table.snapshotId, table.sourceId],
      foreignColumns: [snapshots.id, snapshots.sourceId],
      name: 'publications_snapshot_source_fk'
    }),
    uniqueIndex('publications_fingerprint_unique').on(
      table.sourceId,
      table.generation,
      table.fingerprint
    ),
    index('publications_snapshot_idx').on(table.snapshotId),
    check(
      'publications_title_length',
      sql`char_length(${table.title}) between 1 and 60`
    ),
    check(
      'publications_highlights_count',
      sql`jsonb_typeof(${table.highlights}) = 'array' and jsonb_array_length(${table.highlights}) between 1 and 3`
    ),
    check('publications_generation_nonnegative', sql`${table.generation} >= 0`)
  ]
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    // Operation and client or source being limited.
    key: text('key').primaryKey(),
    // Attempts consumed in the current window.
    count: integer('count').notNull(),
    // When the current budget resets.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (table) => [index('rate_limits_expires_at_idx').on(table.expiresAt)]
)

export type Source = typeof sources.$inferSelect
export type Snapshot = typeof snapshots.$inferSelect
export type Publication = typeof publications.$inferSelect

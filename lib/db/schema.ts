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

import type { GeneratedPreview, Message, PreviewSelection } from '@/lib/domain'
import type { CardAppearance } from '@/lib/card-appearance'

export const providerEnum = pgEnum('provider', ['chatgpt', 'claude'])
export const availabilityEnum = pgEnum('availability', [
  'available',
  'unavailable'
])

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: providerEnum('provider').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    providerShareId: text('provider_share_id').notNull(),
    latestSnapshotId: uuid('latest_snapshot_id').references(
      (): AnyPgColumn => snapshots.id,
      { onDelete: 'set null' }
    ),
    latestSnapshotVerifiedAt: timestamp('latest_snapshot_verified_at', {
      withTimezone: true
    }),
    availability: availabilityEnum('availability')
      .notNull()
      .default('available'),
    publicationGeneration: integer('publication_generation')
      .notNull()
      .default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    retryAfter: timestamp('retry_after', { withTimezone: true }),
    manualCheckAfter: timestamp('manual_check_after', { withTimezone: true }),
    preparationLeaseToken: uuid('preparation_lease_token'),
    preparationLeaseUntil: timestamp('preparation_lease_until', {
      withTimezone: true
    }),
    preparationRetryAfter: timestamp('preparation_retry_after', {
      withTimezone: true
    }),
    checkLeaseToken: uuid('check_lease_token'),
    checkLeaseUntil: timestamp('check_lease_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    check(
      'sources_generation_nonnegative',
      sql`${table.publicationGeneration} >= 0`
    )
  ]
)

export const snapshots = pgTable(
  'snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull(),
    messages: jsonb('messages').$type<Message[]>().notNull(),
    parserVersion: text('parser_version').notNull(),
    suggestion: jsonb('suggestion').$type<PreviewSelection>(),
    preview: jsonb('preview').$type<GeneratedPreview>(),
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
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    snapshotId: uuid('snapshot_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    generation: integer('generation').notNull().default(0),
    title: text('title').notNull(),
    highlights: jsonb('highlights').$type<string[]>(),
    appearance: jsonb('appearance').$type<CardAppearance>(),
    messageId: text('message_id'),
    excerptStart: integer('excerpt_start'),
    excerptEnd: integer('excerpt_end'),
    cardVersion: integer('card_version').notNull().default(1),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
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
      'publications_excerpt_range',
      sql`(${table.highlights} is not null and jsonb_typeof(${table.highlights}) = 'array' and jsonb_array_length(${table.highlights}) between 1 and 3 and ${table.messageId} is null and ${table.excerptStart} is null and ${table.excerptEnd} is null) or (${table.highlights} is null and ${table.messageId} is not null and ${table.excerptStart} is not null and ${table.excerptEnd} is not null and ${table.excerptStart} >= 0 and ${table.excerptEnd} > ${table.excerptStart} and ${table.excerptEnd} - ${table.excerptStart} <= 240)`
    ),
    check('publications_generation_nonnegative', sql`${table.generation} >= 0`)
  ]
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
  },
  (table) => [index('rate_limits_expires_at_idx').on(table.expiresAt)]
)

export type Source = typeof sources.$inferSelect
export type Snapshot = typeof snapshots.$inferSelect
export type Publication = typeof publications.$inferSelect

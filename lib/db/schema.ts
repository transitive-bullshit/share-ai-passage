import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
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

// Better Auth's standard PostgreSQL models. Application ownership is separate
// from the provider account records used to authenticate a user.
export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  deletionRequestedAt: timestamp('deletion_requested_at', {
    withTimezone: true
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId)]
)

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('auth_accounts_user_idx').on(table.userId),
    uniqueIndex('auth_accounts_provider_unique').on(
      table.providerId,
      table.accountId
    )
  ]
)

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [index('auth_verifications_identifier_idx').on(table.identifier)]
)

export const authRateLimits = pgTable('auth_rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull()
})

export const accountPreferences = pgTable('account_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  appearance: jsonb('appearance').$type<CardAppearance>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

export const guestImports = pgTable('guest_imports', {
  // Kept after Better Auth removes the temporary user; never a claim credential.
  guestUserId: text('guest_user_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow()
})

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
    ownerId: text('owner_id').references(() => authUsers.id, {
      onDelete: 'set null'
    }),
    // Immutable across guest import; existing publications retain legacy identity.
    dedupeScope: text('dedupe_scope').notNull().default('legacy'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    // Original share whose availability governs this publication.
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    // Fixed conversation capture shown by the reader.
    snapshotId: uuid('snapshot_id').notNull(),
    // Legacy content hash, or immutable owner namespace plus that hash.
    // Deleted rows use a unique tombstone key to free their active dedupe identity.
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
    // When source removal or owner deletion disabled this publication.
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
    // Retain the original conflict target so the previous deployment can roll back.
    uniqueIndex('publications_fingerprint_unique').on(
      table.sourceId,
      table.generation,
      table.fingerprint
    ),
    index('publications_owner_idx').on(table.ownerId, table.createdAt),
    index('publications_snapshot_idx').on(table.snapshotId),
    check(
      'publications_title_length',
      sql`char_length(${table.title}) between 1 and 600`
    ),
    check(
      'publications_highlights_count',
      sql`jsonb_typeof(${table.highlights}) = 'array' and jsonb_array_length(${table.highlights}) between 0 and 3`
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

export const savedDrafts = pgTable(
  'saved_drafts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    // Request namespace never changes when guest ownership transfers.
    namespace: text('namespace').notNull(),
    requestKey: text('request_key').notNull(),
    sourceUrl: text('source_url').notNull(),
    sourceId: uuid('source_id').references(() => sources.id),
    snapshotId: uuid('snapshot_id').references(() => snapshots.id),
    sourceGeneration: integer('source_generation'),
    parentPublicationId: uuid('parent_publication_id').references(
      () => publications.id
    ),
    publishedPublicationId: uuid('published_publication_id').references(
      () => publications.id
    ),
    revision: integer('revision').notNull().default(0),
    title: text('title').notNull().default(''),
    highlights: jsonb('highlights').$type<string[]>().notNull().default([]),
    appearance: jsonb('appearance')
      .$type<CardAppearance>()
      .notNull()
      .default({ templateId: 'margin-notes' }),
    status: text('status')
      .$type<'preparing' | 'ready' | 'failed'>()
      .notNull()
      .default('preparing'),
    errorMessage: text('error_message'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('saved_drafts_request_unique').on(
      table.namespace,
      table.requestKey
    ),
    index('saved_drafts_owner_idx').on(table.ownerId, table.updatedAt),
    index('saved_drafts_snapshot_idx').on(table.snapshotId),
    check('saved_drafts_revision_nonnegative', sql`${table.revision} >= 0`),
    check(
      'saved_drafts_status_valid',
      sql`${table.status} in ('preparing', 'ready', 'failed')`
    )
  ]
)

export const usagePeriods = pgTable(
  'usage_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    subjectKey: text('subject_key').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allowance: integer('allowance').notNull(),
    used: integer('used').notNull().default(0),
    reserved: integer('reserved').notNull().default(0)
  },
  (table) => [
    uniqueIndex('usage_periods_subject_unique').on(
      table.subjectKey,
      table.startsAt
    ),
    check(
      'usage_periods_counts_nonnegative',
      sql`${table.allowance} >= 0 and ${table.used} >= 0 and ${table.reserved} >= 0`
    ),
    check(
      'usage_periods_dates_ordered',
      sql`${table.endsAt} > ${table.startsAt}`
    )
  ]
)

export const aiBudgetPeriods = pgTable(
  'ai_budget_periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    limitMicros: integer('limit_micros').notNull().default(25_000_000),
    spentMicros: integer('spent_micros').notNull().default(0),
    reservedMicros: integer('reserved_micros').notNull().default(0)
  },
  (table) => [
    uniqueIndex('ai_budget_periods_start_unique').on(table.startsAt),
    check(
      'ai_budget_periods_nonnegative',
      sql`${table.limitMicros} >= 0 and ${table.spentMicros} >= 0 and ${table.reservedMicros} >= 0`
    )
  ]
)

export const generationOperations = pgTable(
  'generation_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').references(() => authUsers.id, {
      onDelete: 'set null'
    }),
    subjectKey: text('subject_key').notNull(),
    requestKey: text('request_key').notNull(),
    inputHash: text('input_hash').notNull(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => usagePeriods.id),
    budgetPeriodId: uuid('budget_period_id')
      .notNull()
      .references(() => aiBudgetPeriods.id),
    snapshotId: uuid('snapshot_id').references(() => snapshots.id, {
      onDelete: 'set null'
    }),
    draftId: uuid('draft_id').references(() => savedDrafts.id, {
      onDelete: 'set null'
    }),
    draftRevision: integer('draft_revision'),
    status: text('status')
      .$type<
        | 'reserved'
        | 'running'
        | 'succeeded'
        | 'failed'
        | 'uncertain'
        | 'cancelled'
      >()
      .notNull()
      .default('reserved'),
    reservedCostMicros: integer('reserved_cost_micros').notNull(),
    actualCostMicros: integer('actual_cost_micros'),
    result: jsonb('result').$type<GeneratedPreview>(),
    providerRequestId: text('provider_request_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true })
  },
  (table) => [
    uniqueIndex('generation_operations_request_unique').on(
      table.subjectKey,
      table.requestKey
    ),
    index('generation_operations_draft_idx').on(table.draftId),
    index('generation_operations_owner_idx').on(table.ownerId, table.createdAt),
    index('generation_operations_status_idx').on(table.status, table.updatedAt),
    check(
      'generation_operations_status_valid',
      sql`${table.status} in ('reserved', 'running', 'succeeded', 'failed', 'uncertain', 'cancelled')`
    ),
    check(
      'generation_operations_cost_nonnegative',
      sql`${table.reservedCostMicros} >= 0 and (${table.actualCostMicros} is null or ${table.actualCostMicros} >= 0)`
    )
  ]
)

export type SavedDraft = typeof savedDrafts.$inferSelect
export type GenerationOperation = typeof generationOperations.$inferSelect

export type Source = typeof sources.$inferSelect
export type Snapshot = typeof snapshots.$inferSelect
export type Publication = typeof publications.$inferSelect

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
import type {
  DraftDesign,
  ResolvedCardDesign,
  TemplateRecipe
} from '@/lib/paid-design'
import type { PlanId } from '@/lib/plans'

// Better Auth's standard PostgreSQL models. Application ownership is separate
// from the provider account records used to authenticate a user.
export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  stripeCustomerId: text('stripe_customer_id'),
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
  defaultTemplateId: uuid('default_template_id').references(
    (): AnyPgColumn => savedTemplates.id,
    { onDelete: 'set null' }
  ),
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
    design: jsonb('design').$type<DraftDesign>(),
    resolvedDesign: jsonb('resolved_design').$type<ResolvedCardDesign>(),
    cardAssetId: uuid('card_asset_id').references((): AnyPgColumn => assets.id),
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
    design: jsonb('design').$type<DraftDesign>(),
    resolvedDesign: jsonb('resolved_design').$type<ResolvedCardDesign>(),
    status: text('status')
      .$type<'preparing' | 'ready' | 'failed'>()
      .notNull()
      .default('preparing'),
    errorMessage: text('error_message'),
    preparationRunId: text('preparation_run_id'),
    preparationEnqueueLeaseUntil: timestamp('preparation_enqueue_lease_until', {
      withTimezone: true
    }),
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
    budgetPeriodId: uuid('budget_period_id').references(
      () => aiBudgetPeriods.id
    ),
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

// Native Better Auth plugin mirrors; application entitlements use confirmed billing state.
export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: text('id').primaryKey(),
    plan: text('plan').notNull(),
    referenceId: text('reference_id').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    status: text('status').notNull().default('incomplete'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    trialStart: timestamp('trial_start', { withTimezone: true }),
    trialEnd: timestamp('trial_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    seats: integer('seats'),
    billingInterval: text('billing_interval'),
    stripeScheduleId: text('stripe_schedule_id')
  },
  (table) => [
    index('billing_subscriptions_reference_idx').on(table.referenceId)
  ]
)

export const authApiKeys = pgTable(
  'auth_api_keys',
  {
    id: text('id').primaryKey(),
    configId: text('config_id').notNull().default('default'),
    referenceId: text('reference_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name'),
    start: text('start'),
    prefix: text('prefix'),
    key: text('key').notNull(),
    refillInterval: integer('refill_interval'),
    refillAmount: integer('refill_amount'),
    lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
    enabled: boolean('enabled').default(true),
    rateLimitEnabled: boolean('rate_limit_enabled').default(true),
    rateLimitTimeWindow: integer('rate_limit_time_window'),
    rateLimitMax: integer('rate_limit_max'),
    requestCount: integer('request_count').default(0),
    remaining: integer('remaining'),
    lastRequest: timestamp('last_request', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    permissions: text('permissions'),
    metadata: text('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('auth_api_keys_config_idx').on(table.configId),
    index('auth_api_keys_reference_idx').on(table.referenceId),
    index('auth_api_keys_key_idx').on(table.key)
  ]
)

// Retain opaque billing identities after profile deletion for cancellation/event reconciliation.
export const billingAccounts = pgTable(
  'billing_accounts',
  {
    userId: text('user_id').primaryKey(),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id'),
    paidPlan: text('paid_plan').$type<PlanId>().notNull().default('free'),
    paidThrough: timestamp('paid_through', { withTimezone: true }),
    allowanceAnchorAt: timestamp('allowance_anchor_at', { withTimezone: true }),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    status: text('status').notNull().default('free'),
    billingInterval: text('billing_interval'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    paidInvoiceId: text('paid_invoice_id'),
    pendingPlan: text('pending_plan').$type<PlanId>(),
    pendingBillingInterval: text('pending_billing_interval'),
    pendingEffectiveAt: timestamp('pending_effective_at', {
      withTimezone: true
    }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    closingAt: timestamp('closing_at', { withTimezone: true }),
    cancellationCompletedAt: timestamp('cancellation_completed_at', {
      withTimezone: true
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    check(
      'billing_accounts_plan_valid',
      sql`${table.paidPlan} in ('free','plus','pro')`
    )
  ]
)

export const billingEvents = pgTable(
  'billing_events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    livemode: boolean('livemode').notNull(),
    objectId: text('object_id'),
    customerId: text('customer_id'),
    stripeCreatedAt: timestamp('stripe_created_at', {
      withTimezone: true
    }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error')
  },
  (table) => [
    index('billing_events_pending_idx').on(table.processedAt, table.receivedAt)
  ]
)

// Historical image billing audit only; no runtime purchases or generation.
export const imageCreditGrants = pgTable(
  'image_credit_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull(),
    grantKey: text('grant_key').notNull().unique(),
    kind: text('kind').$type<'included' | 'pack'>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    allowance: integer('allowance').notNull(),
    used: integer('used').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    revoked: integer('revoked').notNull().default(0),
    debtApplied: integer('debt_applied').notNull().default(0),
    debtRecovered: integer('debt_recovered').notNull().default(0),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    stripeInvoiceId: text('stripe_invoice_id'),
    paidCents: integer('paid_cents'),
    currency: text('currency').notNull().default('usd'),
    refundedCents: integer('refunded_cents').notNull().default(0),
    disputed: boolean('disputed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('image_credit_grants_user_idx').on(table.userId, table.expiresAt),
    index('image_credit_grants_payment_idx').on(table.stripePaymentIntentId),
    index('image_credit_grants_checkout_idx').on(table.stripeCheckoutSessionId),
    index('image_credit_grants_invoice_idx').on(table.stripeInvoiceId),
    check(
      'image_credit_grants_kind_valid',
      sql`${table.kind} in ('included','pack')`
    ),
    check(
      'image_credit_grants_nonnegative',
      sql`${table.allowance} >= 0 and ${table.used} >= 0 and ${table.reserved} >= 0 and ${table.revoked} >= 0 and ${table.debtApplied} >= 0 and ${table.debtRecovered} >= 0 and ${table.refundedCents} >= 0 and (${table.paidCents} is null or ${table.paidCents} >= 0)`
    )
  ]
)

export const savedTemplates = pgTable(
  'saved_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    revision: integer('revision').notNull().default(0),
    recipe: jsonb('recipe').$type<TemplateRecipe>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  (table) => [
    index('saved_templates_owner_idx').on(table.ownerId, table.updatedAt),
    check(
      'saved_templates_name_length',
      sql`char_length(${table.name}) between 1 and 80`
    ),
    check('saved_templates_revision_nonnegative', sql`${table.revision} >= 0`)
  ]
)

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').references(() => authUsers.id, {
      onDelete: 'set null'
    }),
    purpose: text('purpose')
      .$type<'background' | 'logo' | 'reference' | 'generated' | 'card'>()
      .notNull(),
    visibility: text('visibility').$type<'private' | 'public'>().notNull(),
    status: text('status')
      .$type<'pending' | 'processing' | 'ready' | 'failed' | 'expired'>()
      .notNull()
      .default('pending'),
    objectKey: text('object_key').notNull().unique(),
    stagingKey: text('staging_key').unique(),
    requestKey: text('request_key'),
    inputHash: text('input_hash'),
    declaredBytes: integer('declared_bytes').notNull().default(0),
    reservedBytes: integer('reserved_bytes').notNull().default(0),
    byteSize: integer('byte_size'),
    contentType: text('content_type'),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    stagingEtag: text('staging_etag'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    processingLeaseUntil: timestamp('processing_lease_until', {
      withTimezone: true
    }),
    libraryDeletedAt: timestamp('library_deleted_at', { withTimezone: true }),
    cleanupPending: boolean('cleanup_pending').notNull().default(false),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    uniqueIndex('assets_request_unique').on(table.ownerId, table.requestKey),
    index('assets_library_idx').on(
      table.ownerId,
      table.purpose,
      table.status,
      table.libraryDeletedAt
    ),
    index('assets_expiration_idx').on(table.status, table.expiresAt),
    check(
      'assets_purpose_valid',
      sql`${table.purpose} in ('background','logo','reference','generated','card')`
    ),
    check(
      'assets_visibility_valid',
      sql`${table.visibility} in ('private','public')`
    ),
    check(
      'assets_status_valid',
      sql`${table.status} in ('pending','processing','ready','failed','expired')`
    ),
    check(
      'assets_bytes_nonnegative',
      sql`${table.declaredBytes} >= 0 and ${table.reservedBytes} >= 0 and (${table.byteSize} is null or ${table.byteSize} >= 0)`
    ),
    check(
      'assets_public_cards_only',
      sql`${table.visibility} = 'private' or ${table.purpose} = 'card'`
    )
  ]
)

// Retained for historical cost/privacy audit. Image execution is removed.
export const imageOperations = pgTable(
  'image_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: text('owner_id').references(() => authUsers.id, {
      onDelete: 'set null'
    }),
    subjectKey: text('subject_key').notNull(),
    requestKey: text('request_key').notNull(),
    inputHash: text('input_hash').notNull(),
    draftId: uuid('draft_id').references(() => savedDrafts.id, {
      onDelete: 'set null'
    }),
    draftRevision: integer('draft_revision').notNull(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => imageCreditGrants.id),
    recipe: jsonb('recipe').$type<TemplateRecipe>(),
    recipeHash: text('recipe_hash').notNull(),
    prompt: text('prompt'),
    referenceAssetId: uuid('reference_asset_id').references(() => assets.id, {
      onDelete: 'set null'
    }),
    referenceHash: text('reference_hash'),
    model: text('model').notNull(),
    configVersion: text('config_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    status: text('status')
      .$type<
        | 'reserved'
        | 'dispatching'
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
    usage: jsonb('usage').$type<Record<string, unknown>>(),
    clientRequestId: text('client_request_id').notNull(),
    providerRequestId: text('provider_request_id'),
    providerResultId: text('provider_result_id'),
    workflowRunId: text('workflow_run_id'),
    dispatchLeaseUntil: timestamp('dispatch_lease_until', {
      withTimezone: true
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    resultAssetId: uuid('result_asset_id').references(() => assets.id, {
      onDelete: 'set null'
    }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true })
  },
  (table) => [
    uniqueIndex('image_operations_request_unique').on(
      table.subjectKey,
      table.requestKey
    ),
    uniqueIndex('image_operations_client_request_unique').on(
      table.clientRequestId
    ),
    index('image_operations_owner_idx').on(table.ownerId, table.createdAt),
    index('image_operations_draft_idx').on(table.draftId),
    index('image_operations_status_idx').on(table.status, table.updatedAt),
    check(
      'image_operations_status_valid',
      sql`${table.status} in ('reserved','dispatching','running','succeeded','failed','uncertain','cancelled')`
    ),
    check(
      'image_operations_cost_nonnegative',
      sql`${table.reservedCostMicros} >= 0 and (${table.actualCostMicros} is null or ${table.actualCostMicros} >= 0)`
    )
  ]
)

export type SavedDraft = typeof savedDrafts.$inferSelect
export type GenerationOperation = typeof generationOperations.$inferSelect

export type Source = typeof sources.$inferSelect
export type Snapshot = typeof snapshots.$inferSelect
export type Publication = typeof publications.$inferSelect

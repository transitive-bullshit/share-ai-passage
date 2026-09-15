CREATE TABLE "account_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"appearance" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budget_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"limit_micros" integer DEFAULT 25000000 NOT NULL,
	"spent_micros" integer DEFAULT 0 NOT NULL,
	"reserved_micros" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_budget_periods_nonnegative" CHECK ("ai_budget_periods"."limit_micros" >= 0 and "ai_budget_periods"."spent_micros" >= 0 and "ai_budget_periods"."reserved_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"subject_key" text NOT NULL,
	"request_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"period_id" uuid NOT NULL,
	"budget_period_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"draft_id" uuid,
	"draft_revision" integer,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_cost_micros" integer NOT NULL,
	"actual_cost_micros" integer,
	"result" jsonb,
	"provider_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "generation_operations_status_valid" CHECK ("generation_operations"."status" in ('reserved', 'running', 'succeeded', 'failed', 'uncertain', 'cancelled')),
	CONSTRAINT "generation_operations_cost_nonnegative" CHECK ("generation_operations"."reserved_cost_micros" >= 0 and ("generation_operations"."actual_cost_micros" is null or "generation_operations"."actual_cost_micros" >= 0))
);
--> statement-breakpoint
CREATE TABLE "guest_imports" (
	"guest_user_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"namespace" text NOT NULL,
	"request_key" text NOT NULL,
	"source_url" text NOT NULL,
	"source_id" uuid,
	"snapshot_id" uuid,
	"source_generation" integer,
	"parent_publication_id" uuid,
	"published_publication_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"appearance" jsonb DEFAULT '{"templateId":"margin-notes"}'::jsonb NOT NULL,
	"status" text DEFAULT 'preparing' NOT NULL,
	"error_message" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_drafts_revision_nonnegative" CHECK ("saved_drafts"."revision" >= 0),
	CONSTRAINT "saved_drafts_status_valid" CHECK ("saved_drafts"."status" in ('preparing', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "usage_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_key" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"allowance" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_periods_counts_nonnegative" CHECK ("usage_periods"."allowance" >= 0 and "usage_periods"."used" >= 0 and "usage_periods"."reserved" >= 0),
	CONSTRAINT "usage_periods_dates_ordered" CHECK ("usage_periods"."ends_at" > "usage_periods"."starts_at")
);
--> statement-breakpoint
DROP INDEX "publications_fingerprint_unique";--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "dedupe_scope" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_period_id_usage_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."usage_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_budget_period_id_ai_budget_periods_id_fk" FOREIGN KEY ("budget_period_id") REFERENCES "public"."ai_budget_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_operations" ADD CONSTRAINT "generation_operations_draft_id_saved_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."saved_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_imports" ADD CONSTRAINT "guest_imports_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD CONSTRAINT "saved_drafts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD CONSTRAINT "saved_drafts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD CONSTRAINT "saved_drafts_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD CONSTRAINT "saved_drafts_parent_publication_id_publications_id_fk" FOREIGN KEY ("parent_publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD CONSTRAINT "saved_drafts_published_publication_id_publications_id_fk" FOREIGN KEY ("published_publication_id") REFERENCES "public"."publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_budget_periods_start_unique" ON "ai_budget_periods" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_unique" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_operations_request_unique" ON "generation_operations" USING btree ("subject_key","request_key");--> statement-breakpoint
CREATE INDEX "generation_operations_draft_idx" ON "generation_operations" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "generation_operations_owner_idx" ON "generation_operations" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_operations_status_idx" ON "generation_operations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_drafts_request_unique" ON "saved_drafts" USING btree ("namespace","request_key");--> statement-breakpoint
CREATE INDEX "saved_drafts_owner_idx" ON "saved_drafts" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "saved_drafts_snapshot_idx" ON "saved_drafts" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_periods_subject_unique" ON "usage_periods" USING btree ("subject_key","starts_at");--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_owner_idx" ON "publications" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_fingerprint_unique" ON "publications" USING btree ("dedupe_scope","source_id","generation","fingerprint") WHERE "publications"."deleted_at" is null;
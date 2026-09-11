CREATE TYPE "public"."availability" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('chatgpt', 'claude');--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"message_id" text NOT NULL,
	"excerpt_start" integer NOT NULL,
	"excerpt_end" integer NOT NULL,
	"card_version" integer DEFAULT 1 NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_title_length" CHECK (char_length("publications"."title") between 1 and 60),
	CONSTRAINT "publications_excerpt_range" CHECK ("publications"."excerpt_start" >= 0 and "publications"."excerpt_end" > "publications"."excerpt_start" and "publications"."excerpt_end" - "publications"."excerpt_start" <= 240),
	CONSTRAINT "publications_generation_nonnegative" CHECK ("publications"."generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb NOT NULL,
	"parser_version" text NOT NULL,
	"suggestion" jsonb,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshots_id_source_unique" UNIQUE("id","source_id"),
	CONSTRAINT "snapshots_messages_nonempty" CHECK (jsonb_array_length("snapshots"."messages") > 0)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "provider" NOT NULL,
	"canonical_url" text NOT NULL,
	"provider_share_id" text NOT NULL,
	"latest_snapshot_id" uuid,
	"latest_snapshot_verified_at" timestamp with time zone,
	"availability" "availability" DEFAULT 'available' NOT NULL,
	"publication_generation" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"retry_after" timestamp with time zone,
	"manual_check_after" timestamp with time zone,
	"preparation_lease_token" uuid,
	"preparation_lease_until" timestamp with time zone,
	"preparation_retry_after" timestamp with time zone,
	"check_lease_token" uuid,
	"check_lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_generation_nonnegative" CHECK ("sources"."publication_generation" >= 0)
);
--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_snapshot_source_fk" FOREIGN KEY ("snapshot_id","source_id") REFERENCES "public"."snapshots"("id","source_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_latest_snapshot_id_snapshots_id_fk" FOREIGN KEY ("latest_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publications_fingerprint_unique" ON "publications" USING btree ("source_id","generation","fingerprint");--> statement-breakpoint
CREATE INDEX "publications_snapshot_idx" ON "publications" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_source_hash_unique" ON "snapshots" USING btree ("source_id","content_hash");--> statement-breakpoint
CREATE INDEX "snapshots_captured_at_idx" ON "snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_canonical_url_unique" ON "sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_provider_share_unique" ON "sources" USING btree ("provider","provider_share_id");--> statement-breakpoint
CREATE INDEX "sources_updated_at_idx" ON "sources" USING btree ("updated_at");
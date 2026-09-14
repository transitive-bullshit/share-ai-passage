CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"purpose" text NOT NULL,
	"visibility" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text NOT NULL,
	"staging_key" text,
	"request_key" text,
	"declared_bytes" integer DEFAULT 0 NOT NULL,
	"reserved_bytes" integer DEFAULT 0 NOT NULL,
	"byte_size" integer,
	"content_type" text,
	"width" integer,
	"height" integer,
	"sha256" text,
	"staging_etag" text,
	"expires_at" timestamp with time zone,
	"processing_lease_until" timestamp with time zone,
	"library_deleted_at" timestamp with time zone,
	"cleanup_pending" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "assets_staging_key_unique" UNIQUE("staging_key"),
	CONSTRAINT "assets_purpose_valid" CHECK ("assets"."purpose" in ('background','logo','reference','generated','card')),
	CONSTRAINT "assets_visibility_valid" CHECK ("assets"."visibility" in ('private','public')),
	CONSTRAINT "assets_status_valid" CHECK ("assets"."status" in ('pending','processing','ready','failed','expired')),
	CONSTRAINT "assets_bytes_nonnegative" CHECK ("assets"."declared_bytes" >= 0 and "assets"."reserved_bytes" >= 0 and ("assets"."byte_size" is null or "assets"."byte_size" >= 0)),
	CONSTRAINT "assets_public_cards_only" CHECK ("assets"."visibility" = 'private' or "assets"."purpose" = 'card')
);
--> statement-breakpoint
CREATE TABLE "auth_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"reference_id" text NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"permissions" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"paid_plan" text DEFAULT 'free' NOT NULL,
	"paid_through" timestamp with time zone,
	"allowance_anchor_at" timestamp with time zone,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"status" text DEFAULT 'free' NOT NULL,
	"billing_interval" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"paid_invoice_id" text,
	"pending_plan" text,
	"pending_billing_interval" text,
	"pending_effective_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"closing_at" timestamp with time zone,
	"cancellation_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_accounts_plan_valid" CHECK ("billing_accounts"."paid_plan" in ('free','plus','pro'))
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean NOT NULL,
	"object_id" text,
	"customer_id" text,
	"stripe_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"trial_start" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
CREATE TABLE "image_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"grant_key" text NOT NULL,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"allowance" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_invoice_id" text,
	"paid_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_credit_grants_grant_key_unique" UNIQUE("grant_key"),
	CONSTRAINT "image_credit_grants_kind_valid" CHECK ("image_credit_grants"."kind" in ('included','pack')),
	CONSTRAINT "image_credit_grants_nonnegative" CHECK ("image_credit_grants"."allowance" >= 0 and "image_credit_grants"."used" >= 0 and "image_credit_grants"."reserved" >= 0 and "image_credit_grants"."revoked" >= 0 and "image_credit_grants"."refunded_cents" >= 0 and ("image_credit_grants"."paid_cents" is null or "image_credit_grants"."paid_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "image_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text,
	"subject_key" text NOT NULL,
	"request_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"draft_id" uuid,
	"draft_revision" integer NOT NULL,
	"grant_id" uuid NOT NULL,
	"recipe" jsonb,
	"recipe_hash" text NOT NULL,
	"reference_asset_id" uuid,
	"reference_hash" text,
	"model" text NOT NULL,
	"config_version" text NOT NULL,
	"prompt_version" text NOT NULL,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"reserved_cost_micros" integer NOT NULL,
	"actual_cost_micros" integer,
	"usage" jsonb,
	"client_request_id" text NOT NULL,
	"provider_request_id" text,
	"provider_result_id" text,
	"workflow_run_id" text,
	"dispatch_lease_until" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"result_asset_id" uuid,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_operations_status_valid" CHECK ("image_operations"."status" in ('reserved','dispatching','running','succeeded','failed','uncertain','cancelled')),
	CONSTRAINT "image_operations_cost_nonnegative" CHECK ("image_operations"."reserved_cost_micros" >= 0 and ("image_operations"."actual_cost_micros" is null or "image_operations"."actual_cost_micros" >= 0))
);
--> statement-breakpoint
CREATE TABLE "saved_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"recipe" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "saved_templates_name_length" CHECK (char_length("saved_templates"."name") between 1 and 80),
	CONSTRAINT "saved_templates_revision_nonnegative" CHECK ("saved_templates"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "generation_operations" ALTER COLUMN "budget_period_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_preferences" ADD COLUMN "default_template_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "design" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "resolved_design" jsonb;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "card_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_drafts" ADD COLUMN "design" jsonb;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_api_keys" ADD CONSTRAINT "auth_api_keys_reference_id_auth_users_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_operations" ADD CONSTRAINT "image_operations_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_operations" ADD CONSTRAINT "image_operations_draft_id_saved_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."saved_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_operations" ADD CONSTRAINT "image_operations_grant_id_image_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."image_credit_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_operations" ADD CONSTRAINT "image_operations_reference_asset_id_assets_id_fk" FOREIGN KEY ("reference_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_operations" ADD CONSTRAINT "image_operations_result_asset_id_assets_id_fk" FOREIGN KEY ("result_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_templates" ADD CONSTRAINT "saved_templates_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_request_unique" ON "assets" USING btree ("owner_id","request_key");--> statement-breakpoint
CREATE INDEX "assets_library_idx" ON "assets" USING btree ("owner_id","purpose","status","library_deleted_at");--> statement-breakpoint
CREATE INDEX "assets_expiration_idx" ON "assets" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "auth_api_keys_config_idx" ON "auth_api_keys" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "auth_api_keys_reference_idx" ON "auth_api_keys" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "auth_api_keys_key_idx" ON "auth_api_keys" USING btree ("key");--> statement-breakpoint
CREATE INDEX "billing_events_pending_idx" ON "billing_events" USING btree ("processed_at","received_at");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_reference_idx" ON "billing_subscriptions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "image_credit_grants_user_idx" ON "image_credit_grants" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "image_credit_grants_payment_idx" ON "image_credit_grants" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "image_credit_grants_checkout_idx" ON "image_credit_grants" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "image_credit_grants_invoice_idx" ON "image_credit_grants" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "image_operations_request_unique" ON "image_operations" USING btree ("subject_key","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "image_operations_client_request_unique" ON "image_operations" USING btree ("client_request_id");--> statement-breakpoint
CREATE INDEX "image_operations_owner_idx" ON "image_operations" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "image_operations_draft_idx" ON "image_operations" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "image_operations_status_idx" ON "image_operations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "saved_templates_owner_idx" ON "saved_templates" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "account_preferences" ADD CONSTRAINT "account_preferences_default_template_id_saved_templates_id_fk" FOREIGN KEY ("default_template_id") REFERENCES "public"."saved_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_card_asset_id_assets_id_fk" FOREIGN KEY ("card_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
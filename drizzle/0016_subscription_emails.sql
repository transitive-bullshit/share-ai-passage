CREATE TABLE "billing_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recipient" text NOT NULL,
	"message" jsonb NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_emails_status_valid" CHECK ("billing_emails"."status" in ('pending', 'sent', 'skipped', 'needs_review'))
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD COLUMN "email_state" jsonb;--> statement-breakpoint
ALTER TABLE "billing_emails" ADD CONSTRAINT "billing_emails_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_emails_pending_idx" ON "billing_emails" USING btree ("status","retry_at");
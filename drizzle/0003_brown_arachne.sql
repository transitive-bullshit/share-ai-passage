ALTER TABLE "publications" DROP CONSTRAINT "publications_excerpt_range";--> statement-breakpoint
ALTER TABLE "publications" ALTER COLUMN "highlights" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "publications" DROP COLUMN "message_id";--> statement-breakpoint
ALTER TABLE "publications" DROP COLUMN "excerpt_start";--> statement-breakpoint
ALTER TABLE "publications" DROP COLUMN "excerpt_end";--> statement-breakpoint
ALTER TABLE "snapshots" DROP COLUMN "suggestion";--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_highlights_count" CHECK (jsonb_typeof("publications"."highlights") = 'array' and jsonb_array_length("publications"."highlights") between 1 and 3);
ALTER TABLE "publications" DROP CONSTRAINT "publications_title_length";--> statement-breakpoint
ALTER TABLE "publications" DROP CONSTRAINT "publications_highlights_count";--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_title_length" CHECK (char_length("publications"."title") between 1 and 600);--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_highlights_count" CHECK (jsonb_typeof("publications"."highlights") = 'array' and jsonb_array_length("publications"."highlights") between 0 and 3);
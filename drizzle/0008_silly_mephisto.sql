DROP INDEX "publications_fingerprint_unique";--> statement-breakpoint
-- Retain legacy hashes and URLs. Account records created while 0007 was active
-- gain their immutable namespace prefix before restoring the old conflict key.
-- Deleted rows release that key while remaining disabled for the old reader.
UPDATE "publications"
SET "fingerprint" = CASE
  WHEN "deleted_at" IS NOT NULL THEN 'deleted:' || "id"::text
  WHEN "dedupe_scope" <> 'legacy' AND "fingerprint" ~ '^[0-9a-f]{64}$'
    THEN "dedupe_scope" || ':' || "fingerprint"
  ELSE "fingerprint"
END,
"disabled_at" = CASE
  WHEN "deleted_at" IS NOT NULL THEN coalesce("disabled_at", "deleted_at")
  ELSE "disabled_at"
END
WHERE "deleted_at" IS NOT NULL
   OR ("dedupe_scope" <> 'legacy' AND "fingerprint" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "publications_fingerprint_unique" ON "publications" USING btree ("source_id","generation","fingerprint");

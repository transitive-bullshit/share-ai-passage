-- Preserve completed artwork as an ordinary uploaded background. Public card
-- bytes and frozen rendering descriptors remain unchanged; no R2 objects are deleted.
UPDATE assets SET purpose = 'background' WHERE purpose = 'generated';
--> statement-breakpoint
UPDATE saved_templates
SET recipe = (recipe - 'artDirection' - 'referenceAssetId') ||
  CASE WHEN recipe #>> '{background,mode}' = 'generated'
    THEN '{"background":{"mode":"curated"}}'::jsonb ELSE '{}'::jsonb END;
--> statement-breakpoint
CREATE FUNCTION pg_temp.uploads_only_design(value jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value IS NULL THEN NULL ELSE
    jsonb_set(value - 'generatedImage', '{recipe}',
      ((value->'recipe') - 'artDirection' - 'referenceAssetId') ||
      CASE WHEN value #>> '{recipe,background,mode}' = 'generated' THEN
        jsonb_build_object('background',
          CASE WHEN value #>> '{generatedImage,assetId}' IS NOT NULL THEN
            jsonb_build_object('mode','uploaded','assetId',value #>> '{generatedImage,assetId}')
          ELSE '{"mode":"curated"}'::jsonb END)
      ELSE '{}'::jsonb END)
  END
$$;
--> statement-breakpoint
UPDATE saved_drafts SET design = pg_temp.uploads_only_design(design),
  resolved_design = CASE WHEN resolved_design #>> '{background,kind}' = 'pending'
    THEN NULL ELSE resolved_design END WHERE design IS NOT NULL;
--> statement-breakpoint
UPDATE publications SET design = pg_temp.uploads_only_design(design)
WHERE design IS NOT NULL;

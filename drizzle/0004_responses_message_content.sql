-- Preserve saved Markdown verbatim; new captures record structured media omissions.
UPDATE "snapshots"
SET "messages" = (
  SELECT jsonb_agg(
    CASE
      WHEN item ? 'content' THEN item
      ELSE jsonb_build_object(
        'id', item->>'id',
        'type', 'message',
        'role', item->>'speaker',
        'content', jsonb_build_array(jsonb_build_object(
          'type', CASE WHEN item->>'speaker' = 'assistant' THEN 'output_text' ELSE 'input_text' END,
          'text', coalesce(item->>'markdown', item->>'text', '')
        ))
      )
    END ORDER BY position
  )
  FROM jsonb_array_elements("snapshots"."messages") WITH ORDINALITY AS entries(item, position)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("snapshots"."messages") AS item
  WHERE item ? 'speaker'
);

# Saved message model

The canonical types are [Message and MessageContent](../lib/domain.ts). Passage uses Responses-style `type`, `role`, ordered `content`, and optional assistant `phase`; these saved records are not directly replayable API inputs.

- Preserve message identity, original roles, content order, block boundaries, and Markdown. Assistant text uses `output_text`; other roles use `input_text`.
- Retain `commentary` or `final_answer` only when the source supplies it. Do not infer a phase from message position.
- The local `tool` role preserves visible tool contributions. Typed `omitted` blocks distinguish known missing or unsupported content from original conversation text; they do not claim the media itself was captured.
- Current adapters do not retrieve or render remote images, audio, video, files, or interactive artifacts.

[Message projections](../lib/messages.ts) derive reader Markdown with omission labels (`messageMarkdown`) and summary input containing only extracted text (`messageText`). Neither projection is stored as another copy of the message.

[Migration 0004](../drizzle/0004_responses_message_content.sql) wraps older Markdown in text blocks while preserving identity, roles, and order. Historical omission labels already flattened into Markdown stay verbatim; structured omission metadata is available only from new captures.

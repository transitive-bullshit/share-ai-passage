# Saved message model

The canonical types are [Message and MessageContent](../lib/domain.ts). Passage uses Responses-style `type`, `role`, ordered `content`, and optional assistant `phase`; these saved records are not directly replayable API inputs.

- Preserve message identity, original roles, content order, block boundaries, and Markdown. Assistant text uses `output_text`; other roles use `input_text`.
- Retain `commentary` or `final_answer` only when the source supplies it. Do not infer a phase from message position.
- `kind: 'reasoning_summary'` identifies an assistant summary explicitly exposed by the public source. Codex v3 captures preserve this distinction; the original text stays in `output_text`. This optional JSON field needs no database schema migration.
- The local `tool` role preserves visible tool contributions. Typed `omitted` blocks distinguish known missing or unsupported content from original conversation text; they do not claim the media itself was captured.
- Current adapters do not retrieve or render remote images, audio, video, files, or interactive artifacts.

[Message projections](../lib/messages.ts) derive reader Markdown with omission labels (`messageMarkdown`) and summary input containing only extracted text (`messageText`). Neither projection is stored as another copy of the message.

[Reader groups](../lib/reader.ts) fold consecutive reasoning summaries, commentary, and tool entries into closed “Reasoning & activity” disclosures. User messages and answers remain visible, and all saved content and message anchors retain their order. The reader count and answer jump use the visible messages. Markdown and syntax highlighting run on the server; small client controls handle copying, table width, and long-question expansion.

For Codex user messages, the reader presents a complete `codex_delegation` envelope as its input with a “Sent from another task” note, matching the public source. The original envelope remains stored; ordinary and malformed HTML stays escaped and visible. Local file references keep their labels and gain an unavailable-file glyph, without navigation or downloads. Markdown images retain explicit omission labels and an image placeholder.

Older Codex v1/v2 captures flattened reasoning into unphased assistant messages. Their reader-only compatibility rule uses the stable `codex-<turn>-<item>` identities to retain every explicit final and the last unphased assistant contribution per turn (unless followed by an explicit final), folding earlier contributions as activity. This is a reversible presentation heuristic, not a recovered source classification. Ordinary ChatGPT/Claude messages and new Codex captures never use that heuristic. Existing snapshots, saved phases, and summary-generation inputs are unchanged.

[Migration 0004](../drizzle/0004_responses_message_content.sql) wraps older Markdown in text blocks while preserving identity, roles, and order. Historical omission labels already flattened into Markdown stay verbatim; structured omission metadata is available only from new captures.

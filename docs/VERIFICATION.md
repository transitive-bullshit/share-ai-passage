# Local MVP verification

For the current production-readiness assessment and follow-up fixes, see [the September 11 launch audit](LAUNCH_READINESS.md).

Verified on September 10, 2026 with the installed Next.js 16.3.4, Node.js 25.9.0, pnpm 12.3.4, and an isolated native PostgreSQL instance on `127.0.0.1:55432`.

## Passed

- Repository formatting, oxlint, generated route types, TypeScript, and production build.
- 261 automated tests in 15 files across provider extraction, Unicode summary validation, message-aware compaction, legacy quote integrity, rendering and reader safety, request boundaries, preview-bound signed drafts, rejected client edits, CLI behavior, PostgreSQL constraints/concurrency, and source lifecycle. Integration tests used real PostgreSQL. Unit model responses always come from fixtures and mocks.
- Anonymous extraction of real ChatGPT and Claude sources, including code, long conversations, and omitted attachments/tools. [Extraction evidence](./EXTRACTION.md) distinguishes real observations from sanitized and synthetic fixtures.
- The current summary flow passed full production HTTP smoke for two authored cached fixtures, one for each provider. Repeat preparations, rejected preview edits, duplicate and repeated-draft idempotency, complete Markdown/Unicode readers, unchanged snapshots, source links, and provider mismatch 404s passed. This intentionally made no provider/model calls and does not establish live LLM generation. Earlier versions passed live-source publication smoke for a 16-message ChatGPT conversation and a two-message Claude conversation using legacy excerpts.
- Private preview and public image bytes were identical, with PNG content type and 1200 × 630 dimensions. Normal requests, Twitterbot, and Facebook crawler user agents received the generated summary fields in Open Graph / large-image metadata in the initial HTML, together with `noindex` directives.
- Production reader, metadata, and image responses prohibit storage. The reader returns `private, no-cache, no-store, max-age=0, must-revalidate`; image and mutation responses use `private, no-store`. Development-mode Next.js reader headers differ, which is why the HTTP smoke runs against a production build.
- The saved publication remained readable after stopping/restarting both the Next.js process and the isolated PostgreSQL instance.
- Removal presentation smoke passed for one legacy excerpt publication and one generated-summary publication. Normal HTML, RSC, HEAD, crawler responses, and cache-busting URLs contained no original title or transcript marker after disablement. Direct images matched the generic unavailable PNG. Stale draft card/publish requests returned 410. Old publications stayed disabled after source recovery. Only the script's synthetic rows were removed afterward.
- Browser testing of the current flow covered paste → Go → read-only title/highlights → loaded card → Publish → full reader on desktop and at a 390-pixel mobile viewport. The preview exposed zero editable fields and both preview/reader had no horizontal page overflow. Authored cached data was used, with no model request. Earlier reader checks covered code blocks and Chinese text; a font-subset collision caught visually has a glyph-resolution regression test.
- Sixteen CLI tests exercise real subprocesses and a local HTTP test server, including prepare-only behavior, explicit unattended publishing, immutable draft fields, original-server binding, JSON errors/retry delays, no redirects, and private draft files. The standalone CLI runs from outside the repository. The skill passes its frontmatter/structure validator. An independent skill trial correctly stopped on the shared local preparation budget's 429 response; it did not create a draft or repeat requests.
- Cards render without remote font/emoji requests. Bundled font files and the native renderer are included in build traces; the shaping WebAssembly asset is explicitly included for deployments.
- Docker Compose configuration validates. The native PostgreSQL path was exercised locally.

The HTTP smoke scripts write check summaries and card PNGs to ignored `work/smoke`. They do not write transcript bodies, draft tokens, API keys, or model inputs to those reports.

## Visual redesign

The initial visual redesign gave the homepage, preview, published reader, error states, and legacy social cards a white/charcoal palette and locally hosted Inter typography, following the user's [Ultracite reference](https://www.ultracite.ai/). The landing page uses a centered form, a larger product showcase over original generated landscape artwork, and quieter supporting sections. Artwork is delivered through Next.js responsive image optimization; marketing content remains server rendered.

All 261 offline tests, formatting, lint, TypeScript, and the production build passed. Browser checks covered desktop, 390-pixel mobile, and 320-pixel narrow layouts with no horizontal page overflow, including the complete 22-message reader. Inline errors, keyboard focus rings, read-only preview fields, publication, focus/scroll restoration, and returning to a fresh form were checked. Both existing Codex examples also passed the production HTTP/PNG smoke with model API keys explicitly disabled: 37 and 22 saved messages, unchanged summary fields, matching private/public PNG bytes, and correct crawler metadata. No new summary was generated during redesign verification.

## Five social templates — September 11, 2026

The web review flow offers the five selected designs: Margin notes, Electric risograph, Maker’s workbench, Midnight observatory, and Friendly lab. Margin notes is the initial default. A versioned browser preference stores only the selected template ID; new drafts reuse it. Each publication saves its selection, while legacy publications retain their previous rendering.

- The five original selections were converted directly with ImageMagick into 1200 × 630 progressive JPEGs. Their combined size is 924,736 bytes, down from 11,357,155 bytes of source PNGs. Only the optimized JPEGs are repository assets; image sources and encoding details are recorded in `public/social-templates/README.md`.
- All 341 automated tests passed across the complete set of suites: 291 general/API/preference/database tests, 23 card API tests, and 27 card renderer tests. The local migration was applied to the existing isolated PostgreSQL database. Preview/publication PNG equality, template-specific idempotency, rejected caller edits, Unicode fitting, deterministic offline output, and unchanged legacy/disabled rendering are covered.
- All five final cards were inspected at full size and at a typical feed size. Titles, all highlights, and footers remain readable over the selected artwork, including the busier backgrounds.
- Initial browser checks passed for all five card designs, rapid template switching with Publish disabled until the current PNG loads, remembered choices across new drafts and full reloads, cross-tab preference updates, and a synthetic local publication whose image stayed fixed after the default changed elsewhere. A 390-pixel viewport had no horizontal overflow. The initial Margin notes preference and normal viewport were restored afterward. These checks made no provider or model requests.
- The production build passed. Each of the three image-route traces includes all five JPEGs, all 149 prepared font subsets and their manifest, and the shaping WebAssembly asset. A separate temporary directory containing only traced files successfully rendered all five 1200 × 630 PNGs with network access disabled. This validates local production packaging; it is not a hosted Vercel test.

Picker thumbnails subsequently changed to lightweight browser-rendered HTML with sample text, shared optimized JPEG assets, and the same template typography, colors, and layout definitions. The picker makes no generated-image requests. Selected private previews and published social images retain the full server renderer and reviewed summary content.

Follow-up browser checks confirmed all five local JPEG thumbnails, zero card-render requests from the picker, desktop and 390-pixel mobile layouts without overflow, and Publish remaining disabled until the selected full PNG loads. Cards now use one provider-aware footer: “A passage from ChatGPT worth sharing” or Claude, without the previous provider header and repeated footer copy.

## Preview failure investigation — September 11, 2026

The development log recorded a 4.1-second `/api/prepare` 503 followed by a successful 2.8-second preparation. The reported source now has a saved preview. Earlier error handling discarded the underlying SDK or validation exception, and a successful retry clears the stored cooldown. The original failure's cause cannot be recovered from the retained logs or database state.

An offline regression exposed a separate, reproducible schema mismatch: the JSON Schema sent to the model allowed titles of 120 characters and highlights of 200, while server validation enforced 60 and 100 Unicode characters. Schema metadata now advertises 60/100; runtime normalization and Unicode counting remain intact, including astral characters. This fixes the proven mismatch without establishing that it caused the reported 503.

Generation failures now emit a structured `preview_generation_failed` diagnostic with an allowlisted category, elapsed time, and available safe HTTP status, bounded request ID, and recognized finish reason. Offline cases cover provider errors, malformed or invalid output, timeouts, incomplete responses, content filtering, nested causes, and metadata redaction. Logs exclude raw errors, source URLs, transcript text, generated output, request/response bodies, and credentials. Generation still makes no automatic retries.

After these changes, all 368 tests passed across 18 files: 341 offline tests and 27 local PostgreSQL integration tests. Formatting, lint, TypeScript, and the production build passed. No live provider or paid model requests were made during this follow-up.

## Live generation and free unit tests

Following explicit approval, OpenAI generation is enabled with GPT-5.4 nano, reasoning disabled, no retries, a 15-second timeout, and a 700-token output limit. Input prioritizes the first nonempty user message and last nonempty assistant message within a 20,000-character encoded JSON limit. Oversized priority messages retain their beginnings and ends; saved transcripts are never compacted.

Three successful paid calls were made explicitly during initial verification: one for the small authored reading-group fixture and one for each supplied public Codex chat. The fixture is saved at `tests/fixtures/summary.json`; default tests replay its response through the AI SDK mock model. Both real chats completed CLI prepare and publish with generated titles/highlights, retaining their original 37 and 22 items. Subsequent preparations reuse their stored previews.

Unit tests never incur API charges, locally or in CI. Vitest disables dotenv loading, empties inherited model credentials, and blocks external fetch, HTTP(S), and redirected socket connections. Guard tests passed with fake inherited credentials. `pnpm fixtures:summary --regenerate` is the separate paid fixture command; it refuses missing flags and CI/test environments before loading configuration or provider code. Neither fixture generation nor live smoke is part of `pnpm test`.

## Codex share regression

The public `/s/cx_` test share now passes anonymous extraction through the real adapter and the running Portless development app: prepare, 1200 × 630 preview, local publication, reader with the original source link, and correct Portless metadata. Preview and published PNG bytes matched. The reader retained 37 ordered items, with 36 containing readable text. URL/redirect regressions cover this exact input and reject unsafe source routes, unrelated download domains, and excessive redirects. Parser regressions cover the observed versioned snapshot, public summaries, omission-marker integrity, malformed/unknown items, size limits, and missing-source classification.

A second public Codex share exposed a region-specific host assumption. Its redirect used OpenAI's US West host rather than the first share's New Zealand North host. Both now pass fresh anonymous extraction using the domain-family policy. The second share also passed the full local publication flow with 22 ordered items and matching preview/public PNGs. Its failed-import cooldown was cleared only after successful verification, so the fixed source could be retried immediately.

Compatibility regressions cover copied query parameters/fragments, varied OpenAI download paths and signature fields, two CDN redirects, and valid conversation JSON with generic MIME labels. The actual fetch/parser chain is exercised with mocked network responses, including DNS pinning and checks that private addresses, external domains, credentials, unsafe protocols/ports, and a third redirect remain blocked. Real source responses remain distinct from these synthetic compatibility cases.

Both supplied Codex links also passed fresh anonymous extraction and the running app's earlier prepare endpoint with tracking parameters and fragments attached. Each variant resolved to the existing canonical source and retained its original 37 or 22 items. These real-source observations precede the summary-flow revision; they are extraction evidence, not evidence of live LLM generation.

## Remaining / not verified

- **Hosted extraction is unverified.** Automatic approval review blocked the temporary Vercel probe before deployment because it would fetch public transcript content into Vercel. No deployment or hosted request occurred; the task-created empty project was removed. No hosted PostgreSQL database was provisioned.
- **Real social-platform unfurls are unverified.** HTTP responses were checked using crawler user agents, but no externally reachable app URL was available for an actual platform composer/unfurl test. No posts or messages were sent.
- Docker containers were not started because the local Docker daemon was unavailable. Compose syntax and the native production app were checked; container execution remains a separate environment check.
- Missing-source classification uses observed provider-specific JSON signatures. A nonexistent share is not a controlled deletion of a formerly available real share. Lifecycle and presentation removal scenarios are verified with controlled synthetic records/results.

The generated preview → publish → read behavior is verified locally, including real Codex sources. Previously published legacy links remain readable.

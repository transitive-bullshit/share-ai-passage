# MVP implementation plan

Status: revised MVP contract, September 11, 2026. License: MIT.

## Start here

Implement a small OSS service that turns a public ChatGPT, Codex, or Claude conversation URL into an engaging share URL: a generated concise title and highlights, a beautifully typeset social image, and a readable saved conversation with an original-source link.

The owner will supply a new repository based on their preferred TypeScript/Next.js template, including linting, formatting, and GitHub CI. Begin from that repository. Read its instructions and inspect its package manager, framework version, scripts, styling, and deployment conventions. Extend those conventions; scaffolding or replacing the base template is outside this task.

Read [CONTEXT.md](./CONTEXT.md) before designing entities or naming code. This plan is the authoritative product and implementation scope; CONTEXT.md is the domain glossary. Agent context documents live under `docs/`, with task-specific entry points in the root `AGENTS.md`. They are self-contained and do not require the preceding conversation or research notes.

Proceed through the milestones below. Routine implementation choices are delegated to the agent. Revisit scope only if the extraction gate fails or a material dependency is needed that defeats the simple app-plus-database design.

## Agreed product contract

### Creation and publication

1. The landing page's main action is pasting a supported public conversation URL.
2. Validate the URL, fetch or reuse the saved conversation, and normalize its messages.
3. Make one bounded LLM request for an uncached snapshot's concise title and two or three main highlights, using Vercel AI SDK. Keep the provider/model configurable. Highlights paraphrase the conversation; they are not excerpts or attributed quotations.
4. Show the generated title and highlights as read-only content. Offer five card styles with lightweight browser thumbnails and show the selected style as the actual rendered card preview.
5. Publish exactly that saved preview and selected style, then return a copyable share URL. The only text input is the original public URL; there are no title, highlight, or excerpt editing controls.

Successful LLM generation is required. A missing model configuration, timeout, or invalid output returns a clear retryable error. Never substitute a source-title or excerpt fallback.

Each publication is immutable. Reuse the generated preview for a saved snapshot. Exact duplicate and retried publishes with the same card style reuse the same publication. Publishing changed source content can create a new snapshot and publication; existing publications remain unchanged. Bind draft capabilities to the exact reviewed preview.

### CLI and agent access

Expose the same prepare and publish operations through a small CLI and a portable agent skill. Preparation displays the generated preview and can save a local draft. Publication consumes that saved draft without regenerating or editing its fields. Interactive sharing offers a confirmation after displaying the preview; explicit unattended sharing is available for authorized agent workflows. Keep one service and one API implementation.

### Reader and social card

Serve a normal reader page, with metadata available in the initial response to social crawlers. The agreed reader is a product benefit, not a technical requirement imposed by social previews.

Preserve all successfully extracted message text and ordering, speaker labels, Markdown, code blocks, tables, and links on a best-effort basis. Show explicit placeholders for unsupported images, attachments, tools, or interactive artifacts. Offer a prominent “Open in ChatGPT” or “Open in Claude” link.

Offer the five curated card styles: Margin notes, Electric risograph, Maker’s workbench, Midnight observatory, and Friendly lab. Use optimized local artwork, a short title, main highlights labeled as an AI summary, and one provider-aware footer: “A passage from ChatGPT worth sharing” or Claude. Margin notes is the initial default; remember the selected style in the browser and save it with each publication. Picker thumbnails use lightweight HTML with shared artwork and layout definitions. The selected full preview and published image must use the same server renderer, reviewed text, and style. Preserve already-published legacy cards and readers without restoring excerpt selection to the creation flow.

Publish Open Graph and large-image social-card metadata, absolute public image URLs, appropriate image dimensions/content type, and noindex directives. Keep ordinary reader and image requests publicly accessible to unfurl crawlers. No directory, discovery feed, or sitemap of publications.

### Availability and source removal

Snapshots and published previews remain frozen. Availability checks never replace their contents.

An ordinary reader visit triggers an availability check only if the source's last completed check is at least seven days old. Share the check across all publications of that source and allow only one in flight. A request-driven check is enough; there is no scheduled polling or separate worker service.

Offer “Check original availability” on the reader. It uses the same checker, with a strict source-wide cooldown and per-client rate limit. It checks availability rather than syncing content.

A provider-specific, confirmed removal or loss of public access disables every publication of that source, including direct image/metadata access. A timeout, 429, 5xx, anti-bot page, or changed markup is inconclusive: keep the saved publication available and apply retry backoff. Record both attempts and successful/definitive checks so failures cannot trigger checks on every visit.

Use no-store responses on reader, metadata, and images. Serve a generic unavailable page/card without old titles, highlights, or transcripts. External platforms can retain previously fetched previews; explain this limitation without promising immediate removal everywhere.

There are no creator accounts, private deletion links, or publication-management screens. Users disable the original provider share to initiate removal here. Default: a disabled publication is not automatically revived; if the original becomes public again, a new creation can verify it and publish a new link.

## Architecture

Use the existing Next.js app and TypeScript, PostgreSQL, Drizzle ORM and migrations, and Vercel AI SDK. The default hosted service targets Vercel; self-hosting runs the same application with PostgreSQL, with a small Docker Compose setup.

Keep one application and one durable database. No required Redis, object store, queue service, browser service, authentication provider, or analytics pipeline.

Use a few ordinary modules:

| Responsibility | Boundary |
| --- | --- |
| Provider adapters | Validate/canonicalize URLs; fetch public content; normalize messages; classify availability evidence |
| Snapshot storage | Reuse saved content and generated previews, deduplicate safely, persist with Drizzle |
| Preview generation | Bound model input, generate grounded title/highlights, validate structured output |
| Publication | Authenticate the reviewed preview and atomically create/reuse an immutable share |
| Presentation | Render the reader, initial HTML metadata, and deterministic card image |
| Availability | Apply staleness, source-wide concurrency/cooldown, disable publications, invalidate caches |

A provider adapter returns a shared message structure, not vendor HTML. Preserve supported Markdown and a stable plain-text representation for summarization. Store the generated title and highlights server-side. Card and publication requests contain the draft capability and validated card appearance; client-supplied text edits are rejected.

Suggested public routes are /, /chatgpt/[publicationId], /claude/[publicationId], and an image route per publication. Adapt API/action routes to the template. Route provider values must agree with the stored publication; never accept an arbitrary destination URL for an existing publication.

Use the framework's existing image-generation facilities where suitable, with packaged fonts and a deterministic PNG output. Store source data and final preview fields in PostgreSQL; generate/cache images from that data. No LLM or provider fetch is needed to serve a card.

### Persistence shape

Treat this as a minimal design, not a prescribed set of TypeScript names:

- **Sources:** provider, canonical URL/provider share identifier, latest snapshot reference, availability state, last attempted/definitive check times, retry deadline, and a short check lease/cooldown.
- **Snapshots:** source reference, normalized messages, content hash, capture time, format/parser version, and cached generated preview.
- **Publications:** opaque public ID, snapshot reference, final title and highlights, selected card template and format version, creation time, and disabled state/time as needed. Retain nullable legacy excerpt fields solely for previously published links.
- **Rate-limit records:** atomic counters/expiry for protected mutations. Expired records can be removed opportunistically.

Index lookups and enforce uniqueness in the database. Reuse a source's saved snapshot during its seven-day freshness window, measured from snapshot capture rather than a later availability check. When a creation needs fresh content after that window, fetch it; reuse an identical snapshot or create a new one by content hash. Existing publications keep their original snapshots.

Normal reader-triggered availability checks do not substitute their fetched content into the reader. For a newly submitted source with no saved snapshot, extraction failure returns a clear error rather than publishing an empty conversation. Check source availability again in the publication transaction to prevent a stale draft from publishing a disabled source.

Creation may persist a prepared snapshot and generated preview before publication. Keep incomplete preparations non-public; include a simple retention/cleanup policy for abandoned preparations without adding a scheduled worker.

### Small operational defaults

These are adjustable implementation defaults, not additional product decisions:

| Setting | Starting point |
| --- | --- |
| Automatic availability staleness | 7 days |
| Manual check cooldown | At least 1 hour per source, plus a per-client limit |
| Transient check retry backoff | At least 1 hour |
| Preparation budget | 10 attempts/hour per client; apply before expensive work |
| Manual-check client budget | 5 attempts/hour |
| Title | Prefer 4–8 words; maximum 60 Unicode characters |
| Highlights | Usually 2–3; at most 100 Unicode characters each; one for a very short source |
| Upstream request timeout | 15 seconds, adjusted within the deployment's request budget |
| Upstream response cap | 5 MiB; enforce while streaming, including decompressed data |
| Normalized text cap | 1 MiB; reject oversized conversations clearly rather than silently losing turns |
| Owned public response cache | No-store |
| Model budget | GPT-5.4 nano, no reasoning or retries, 15 seconds, 700 output tokens, 20,000 encoded input characters |

Handle content limits as honest supported-size limits. Bound model input independently of the saved transcript; summarizing a subset must not truncate the reader. Reuse generation results and return retryable errors for failures.

For cheap compaction, prioritize the first user message and the last assistant/model message. Remove middle conversation content first. If either priority message must itself be shortened, preserve its beginning and end. Keep retained messages ordered and mark omissions.

Unit tests must never incur model charges, locally or in CI. Use checked-in fixtures and mocked model responses, remove developer credentials from the test environment, and block external test requests. Fixture regeneration and live smoke checks are separate, explicitly invoked operations; CI does not run them.

## Basic abuse prevention

Implement the low-cost protections appropriate to an anonymous URL-fetching service:

- Accept verified HTTPS provider hosts and supported share routes. Reject private/internal chat routes, credentials, and unusual ports. Normalize harmless copied-link parameters and fragments instead of rejecting them; do not forward them upstream.
- Canonicalize server-side. Validate every redirect hop against provider-domain boundaries and prevent requests to private/local addresses. Allow provider CDN paths and signed-query formats to vary within those boundaries; never become an arbitrary fetch proxy.
- Enforce request, response, redirect-count, transcript, and model-input limits.
- Use atomic PostgreSQL-backed rate limits for creation and manual checking. Trust client-address headers only from the configured deployment proxy; document the self-host configuration.
- Sanitize rendered Markdown and link protocols. Escape titles/highlights; do not execute provider HTML, scripts, or arbitrary remote media.
- Treat transcript text as untrusted model input. Use a structured output schema and instruct the model to ground every highlight in the supplied conversation. The generation call has no tools.
- Use POST for mutations and appropriate same-origin protections. Keep transcripts, secrets, and private model inputs out of routine logs.

Begin with these protections. Bot challenges remain an optional escalation if real abuse warrants them; they are not a launch dependency. Keep reader and social-image fetching free of challenges.

For this MVP, prefer compatibility within these safety boundaries. Do not turn a few observed CDN hostnames, storage paths, signing parameters, or MIME labels into strict API contracts. Add tighter format checks only when real-world usage demonstrates a correctness or safety need. Validate that the fetched body contains a readable conversation before publishing it, and retain faithful transcript handling.

## Implementation milestones

### 1. Prove public extraction in the deployment environment

Before substantial UI work, test anonymous server-side extraction for real ChatGPT and Claude public shares locally and in a Vercel preview deployment. Read the current provider behavior and the installed Next.js/runtime constraints rather than assuming client-side rendering means the data is server-fetchable.

Use representative short and long conversations, formatted code, and unsupported media. Verify unavailable/private cases and distinguish them from challenged or malformed responses. Record observed payload shapes, supported routes, and sanitized fixtures in the repository.

The original idea included https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532. Its actual behavior was not verified during planning; treat it as a specific investigation case rather than assuming /s/ is equivalent to the usual conversation-share route. Verify all accepted patterns empirically.

**Done:** both MVP providers yield correct ordered messages from an ordinary deployed request, with known limitations and evidence-based unavailable/error classifications.

**Gate:** if either provider needs an always-on browser, credentials, circumvention, or another material service, report the evidence and the smallest alternatives before expanding scope. Do not quietly drop a provider or present fixtures as production extraction.

### 2. Build one end-to-end publication

Add Drizzle schema/migrations and provider adapters. Implement paste → Go → generate title/highlights → read-only preview → publish → readable saved page and original-source link. Require successful model output. Expose the same flow through the CLI and agent skill.

**Done:** a real source from each provider can be published; data survives app restarts; repeated submissions reuse cached expensive work and publish exactly the reviewed preview.

### 3. Finish the social presentation

Implement the five card styles, lightweight style picker, selected full preview, initial-response metadata, image route, noindex, and accessible mobile reader. Keep publication disabled until the selected full preview loads. Handle long words, Unicode, missing source titles, and omitted content.

**Done:** preview matches the published card; anonymous crawlers receive usable metadata/image bytes; real unfurls are checked on X and at least one other available sharing surface. Use an unsent composer or preview tool; publishing external posts requires explicit authorization. If credentials prevent an actual platform test, report that limitation separately from HTTP validation.

### 4. Close lifecycle and abuse cases

Implement weekly lazy checking, source-level leases, manual cooldown, transient-error backoff, disabling all source publications and direct images, bounded caches, safe fetching, and mutation limits.

**Done:** tests cover time boundaries, concurrent checks, temporary failure, confirmed removal, stale drafts, and attempts to bypass image/reader disablement. No request storm causes repeated provider/LLM work.

### 5. Package and verify the handoff

Add MIT licensing consistent with the template, an example environment file, migration/setup instructions, Vercel deployment notes, Docker Compose, and a concise README explaining public snapshots, limits, manual checking, source removal, and external preview caching.

Required configuration includes the application base URL, PostgreSQL connection, and chosen model-provider credentials/model ID. Make changing the model a configuration task; avoid requiring a proprietary gateway for self-hosting.

Run the repository's existing formatting, lint, typecheck, build, and CI checks. Add focused tests for adapter fixtures, summary validation, preview binding, URL/redirect safety, publication idempotency, CLI behavior, and lifecycle/rate-limit concurrency. Use a small rendering/unfurl smoke check instead of a large visual-test framework.

**Done:** a fresh setup can migrate the database and publish/read both providers locally; a Vercel preview passes the same core flow; known limitations are documented. Production deployment can follow the owner's normal release process.

## Scope boundary and rationale

Included: public ChatGPT/Codex/Claude sources, generated titles/highlights without editing, CLI and agent skill, five curated card styles with a remembered browser preference, immutable publications, best-effort reader, source link, noindex, lazy removal detection, basic abuse controls, MIT, Vercel hosting, and practical self-hosting.

Deferred: accounts, analytics dashboards, payments, custom domains/slugs, user-authored themes, image uploads or per-conversation artwork generation, post-publication editing, private share access, creator deletion tokens, conversation continuation, embedded agents, full media/artifact rendering, scheduled polling, and generalized URL shortening.

Dub inspired preview-before-publication and separating link identity from destination/metadata. The product's specialization is giving an AI conversation a concise introduction and presenting it well. Future features should build on that separation; no speculative plugin framework or extra infrastructure is needed now.

## Focused reference links

These are implementation references, not guarantees of current extraction behavior. Verify the relevant installed versions and provider behavior during milestone 1.

- [Dub custom previews](https://dub.co/help/article/custom-link-previews): custom metadata and redirects can coexist; social platforms cache previews.
- [Dub link API](https://dub.co/docs/api-reference/links/create): link identity, destination, and preview fields are separate concepts.
- [Open Graph](https://ogp.me/): metadata vocabulary.
- [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata): crawler-visible metadata behavior.
- [Vercel AI SDK structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/output) and [provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management).
- [OpenAI public-share guidance](https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq) and [Claude public links](https://support.claude.com/en/articles/16762437-public-links-for-shared-chats).

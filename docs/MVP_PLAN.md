# MVP implementation plan

Status: agreed product scope, ready for implementation.
License: MIT.

## Start here

Implement a small OSS service that turns a public ChatGPT or Claude conversation URL into an engaging share URL: a concise title, a faithful excerpt, a beautifully typeset social image, and a readable saved conversation with an original-source link.

The owner will supply a new repository based on their preferred TypeScript/Next.js template, including linting, formatting, and GitHub CI. Begin from that repository. Read its instructions and inspect its package manager, framework version, scripts, styling, and deployment conventions. Extend those conventions; scaffolding or replacing the base template is outside this task.

Read [CONTEXT.md](./CONTEXT.md) before designing entities or naming code. This plan is the authoritative product and implementation scope; CONTEXT.md is the domain glossary. Both documents should live at the new repository root. They are self-contained and do not require the preceding conversation or research notes.

Proceed through the milestones below. Routine implementation choices are delegated to the agent. Revisit scope only if the extraction gate fails or a material dependency is needed that defeats the simple app-plus-database design.

## Agreed product contract

### Creation and publication

1. The landing page's main action is pasting a supported public conversation URL.
2. Validate the URL, fetch or reuse the saved conversation, and normalize its messages.
3. Make one bounded LLM request for an uncached snapshot's title/excerpt suggestion, using Vercel AI SDK. Keep the provider/model configurable. Choose and document an inexpensive initial model when implementing.
4. Show the actual card preview alongside optional title and excerpt controls.
5. Allow a concise freeform title. Keep the excerpt a contiguous selection from a single message, with its speaker shown. Selecting or trimming text is sufficient; a general rich-text editor is unnecessary.
6. Publish the settled preview and return a copyable share URL.

Use a basic source-title/first-usable-passage fallback if model generation fails, times out, or returns invalid data. A model failure must not prevent an otherwise valid publication.

Each publication is immutable. Different previews of the same conversation get separate links; an exact duplicate can reuse an existing publication. Retried publish requests must not create accidental duplicates. Changing a published preview or publishing changed source content creates a new publication.

### Reader and social card

Serve a normal reader page, with metadata available in the initial response to social crawlers. The agreed reader is a product benefit, not a technical requirement imposed by social previews.

Preserve all successfully extracted message text and ordering, speaker labels, Markdown, code blocks, tables, and links on a best-effort basis. Show explicit placeholders for unsupported images, attachments, tools, or interactive artifacts. Offer a prominent “Open in ChatGPT” or “Open in Claude” link.

Use one excellent card layout with a short title, attributed excerpt, and quiet provider/service attribution. Focus on the conversation, with no generated artwork, template picker, or promotional filler. The landing-page preview and published image must use the same layout and data.

Publish Open Graph and large-image social-card metadata, absolute public image URLs, appropriate image dimensions/content type, and noindex directives. Keep ordinary reader and image requests publicly accessible to unfurl crawlers. No directory, discovery feed, or sitemap of publications.

### Availability and source removal

Snapshots and published previews remain frozen. Availability checks never replace their contents.

An ordinary reader visit triggers an availability check only if the source's last completed check is at least seven days old. Share the check across all publications of that source and allow only one in flight. A request-driven check is enough; there is no scheduled polling or separate worker service.

Offer “Check original availability” on the reader. It uses the same checker, with a strict source-wide cooldown and per-client rate limit. It checks availability rather than syncing content.

A provider-specific, confirmed removal or loss of public access disables every publication of that source, including direct image/metadata access. A timeout, 429, 5xx, anti-bot page, or changed markup is inconclusive: keep the saved publication available and apply retry backoff. Record both attempts and successful/definitive checks so failures cannot trigger checks on every visit.

Use bounded caching on reader, metadata, and image responses and invalidate owned caches when disabling a source. Serve a generic unavailable page/card without old titles or excerpts. Avoid immutable year-long image caching that defeats removal. External platforms can retain previously fetched previews; explain this limitation without promising immediate removal everywhere.

There are no creator accounts, private deletion links, or publication-management screens. Users disable the original provider share to initiate removal here. Default: a disabled publication is not automatically revived; if the original becomes public again, a new creation can verify it and publish a new link.

## Architecture

Use the existing Next.js app and TypeScript, PostgreSQL, Drizzle ORM and migrations, and Vercel AI SDK. The default hosted service targets Vercel; self-hosting runs the same application with PostgreSQL, with a small Docker Compose setup.

Keep one application and one durable database. No required Redis, object store, queue service, browser service, authentication provider, or analytics pipeline.

Use a few ordinary modules:

| Responsibility | Boundary |
| --- | --- |
| Provider adapters | Validate/canonicalize URLs; fetch public content; normalize messages; classify availability evidence |
| Snapshot storage | Reuse saved content and suggestions, deduplicate safely, persist with Drizzle |
| Preview selection | Bound model input, validate structured output against source text, provide fallback |
| Publication | Validate chosen fields and atomically create/reuse an immutable share |
| Presentation | Render the reader, initial HTML metadata, and deterministic card image |
| Availability | Apply staleness, source-wide concurrency/cooldown, disable publications, invalidate caches |

A provider adapter returns a shared message structure, not vendor HTML. Preserve supported Markdown and a stable plain-text representation for excerpt selection. Store the selected message identity and text range; derive the actual excerpt from the saved message server-side. The LLM proposes a selection; it does not supply trusted quote text.

Suggested public routes are /, /chatgpt/[publicationId], /claude/[publicationId], and an image route per publication. Adapt API/action routes to the template. Route provider values must agree with the stored publication; never accept an arbitrary destination URL for an existing publication.

Use the framework's existing image-generation facilities where suitable, with packaged fonts and a deterministic PNG output. Store source data and final preview fields in PostgreSQL; generate/cache images from that data. No LLM or provider fetch is needed to serve a card.

### Persistence shape

Treat this as a minimal design, not a prescribed set of TypeScript names:

- **Sources:** provider, canonical URL/provider share identifier, latest snapshot reference, availability state, last attempted/definitive check times, retry deadline, and a short check lease/cooldown.
- **Snapshots:** source reference, normalized messages, content hash, capture time, format/parser version, and cached preview suggestion/fallback.
- **Publications:** opaque public ID, snapshot reference, final title, selected message/range, card format version, creation time, and disabled state/time as needed.
- **Rate-limit records:** atomic counters/expiry for protected mutations. Expired records can be removed opportunistically.

Index lookups and enforce uniqueness in the database. Reuse a source's saved snapshot during its seven-day freshness window, measured from snapshot capture rather than a later availability check. When a creation needs fresh content after that window, fetch it; reuse an identical snapshot or create a new one by content hash. Existing publications keep their original snapshots.

Normal reader-triggered availability checks do not substitute their fetched content into the reader. For a newly submitted source with no saved snapshot, extraction failure returns a clear error rather than publishing an empty conversation. Check source availability again in the publication transaction to prevent a stale draft from publishing a disabled source.

Creation may persist a prepared snapshot and suggestion before publication. Keep incomplete preparations non-public; include a simple retention/cleanup policy for abandoned preparations without adding a scheduled worker.

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
| Excerpt | Maximum 240 Unicode characters, from one message |
| Upstream request timeout | 15 seconds, adjusted within the deployment's request budget |
| Upstream response cap | 5 MiB; enforce while streaming, including decompressed data |
| Normalized text cap | 1 MiB; reject oversized conversations clearly rather than silently losing turns |
| Owned public response cache | Start at no more than 5 minutes; test invalidation |
| Model budget | Explicit timeout/output limit and bounded input; record the chosen limits |

Handle content limits as honest supported-size limits. Bound model input independently of the saved transcript; selecting from a subset must not truncate the reader. Limit generation retries, reuse results, and use the fallback for failures.

## Basic abuse prevention

Implement the low-cost protections appropriate to an anonymous URL-fetching service:

- Accept only verified HTTPS provider hosts and supported share routes. Reject private/internal chat routes, credentials, unusual ports, and unsupported URL forms.
- Canonicalize server-side. Validate every redirect hop and constrain redirects to observed, supported provider destinations. Prevent requests to private/local addresses; never become an arbitrary fetch proxy.
- Enforce request, response, redirect-count, transcript, and model-input limits.
- Use atomic PostgreSQL-backed rate limits for creation and manual checking. Trust client-address headers only from the configured deployment proxy; document the self-host configuration.
- Sanitize rendered Markdown and link protocols. Escape titles/excerpts; do not execute provider HTML, scripts, or arbitrary remote media.
- Treat transcript text as untrusted model input. Use a structured output schema and verify any quote selection against the saved text. The metadata-generation call has no tools.
- Use POST for mutations and appropriate same-origin protections. Keep transcripts, secrets, and private model inputs out of routine logs.

Begin with these protections. Bot challenges remain an optional escalation if real abuse warrants them; they are not a launch dependency. Keep reader and social-image fetching free of challenges.

## Implementation milestones

### 1. Prove public extraction in the deployment environment

Before substantial UI work, test anonymous server-side extraction for real ChatGPT and Claude public shares locally and in a Vercel preview deployment. Read the current provider behavior and the installed Next.js/runtime constraints rather than assuming client-side rendering means the data is server-fetchable.

Use representative short and long conversations, formatted code, and unsupported media. Verify unavailable/private cases and distinguish them from challenged or malformed responses. Record observed payload shapes, supported routes, and sanitized fixtures in the repository.

The original idea included https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532. Its actual behavior was not verified during planning; treat it as a specific investigation case rather than assuming /s/ is equivalent to the usual conversation-share route. Verify all accepted patterns empirically.

**Done:** both MVP providers yield correct ordered messages from an ordinary deployed request, with known limitations and evidence-based unavailable/error classifications.

**Gate:** if either provider needs an always-on browser, credentials, circumvention, or another material service, report the evidence and the smallest alternatives before expanding scope. Do not quietly drop a provider or present fixtures as production extraction.

### 2. Build one end-to-end publication

Add Drizzle schema/migrations and provider adapters. Implement paste → prepare snapshot/suggestion → optional edits → publish → readable saved page and original-source link. Add the deterministic fallback before relying on successful model output.

**Done:** a real source from each provider can be published; data survives app restarts; distinct previews remain independent; repeated submissions reuse cached expensive work.

### 3. Finish the social presentation

Implement the single card design and live preview, initial-response metadata, image route, noindex, accessible mobile reader, and excerpt selection/trimming. Handle long words, code excerpts, Unicode, missing titles, and omitted content.

**Done:** preview matches the published card; anonymous crawlers receive usable metadata/image bytes; real unfurls are checked on X and at least one other available sharing surface. Use an unsent composer or preview tool; publishing external posts requires explicit authorization. If credentials prevent an actual platform test, report that limitation separately from HTTP validation.

### 4. Close lifecycle and abuse cases

Implement weekly lazy checking, source-level leases, manual cooldown, transient-error backoff, disabling all source publications and direct images, bounded caches, safe fetching, and mutation limits.

**Done:** tests cover time boundaries, concurrent checks, temporary failure, confirmed removal, stale drafts, and attempts to bypass image/reader disablement. No request storm causes repeated provider/LLM work.

### 5. Package and verify the handoff

Add MIT licensing consistent with the template, an example environment file, migration/setup instructions, Vercel deployment notes, Docker Compose, and a concise README explaining public snapshots, limits, manual checking, source removal, and external preview caching.

Required configuration includes the application base URL, PostgreSQL connection, and chosen model-provider credentials/model ID. Make changing the model a configuration task; avoid requiring a proprietary gateway for self-hosting.

Run the repository's existing formatting, lint, typecheck, build, and CI checks. Add focused tests for adapter fixtures, quote integrity, URL/redirect safety, publication isolation/idempotency, and lifecycle/rate-limit concurrency. Use a small rendering/unfurl smoke check instead of a large visual-test framework.

**Done:** a fresh setup can migrate the database and publish/read both providers locally; a Vercel preview passes the same core flow; known limitations are documented. Production deployment can follow the owner's normal release process.

## Scope boundary and rationale

Included: public ChatGPT/Claude sources, concise model-assisted previews with fallback, immutable publications, best-effort reader, source link, noindex, lazy removal detection, basic abuse controls, MIT, Vercel hosting, and practical self-hosting.

Deferred: accounts, analytics dashboards, payments, custom domains/slugs, themes, image uploads/generated artwork, post-publication editing, private share access, creator deletion tokens, conversation continuation, embedded agents, full media/artifact rendering, scheduled polling, and generalized URL shortening.

Dub inspired preview-before-publication and separating link identity from destination/metadata. The product's specialization is choosing an interesting passage from an AI conversation and presenting it well. Future features should build on that separation; no speculative plugin framework or extra infrastructure is needed now.

## Focused reference links

These are implementation references, not guarantees of current extraction behavior. Verify the relevant installed versions and provider behavior during milestone 1.

- [Dub custom previews](https://dub.co/help/article/custom-link-previews): custom metadata and redirects can coexist; social platforms cache previews.
- [Dub link API](https://dub.co/docs/api-reference/links/create): link identity, destination, and preview fields are separate concepts.
- [Open Graph](https://ogp.me/): metadata vocabulary.
- [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata): crawler-visible metadata behavior.
- [Vercel AI SDK structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/output) and [provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management).
- [OpenAI public-share guidance](https://help.openai.com/en/articles/7925741-chatgpt-shared-links-faq) and [Claude public links](https://support.claude.com/en/articles/16762437-public-links-for-shared-chats).

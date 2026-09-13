# MVP scope and remaining work

Passage turns a public ChatGPT, Codex, or Claude conversation into a share link with generated highlights, a social card, and a readable saved conversation. MIT licensed.

This document owns product scope and remaining work. See the [glossary](CONTEXT.md) for terminology, [contributing guide](../contributing.md) for setup, [testing guidelines](testing.md) for validation, and [production guide](PRODUCTION.md) for hosting. Historical results live in [archived verification](archive/VERIFICATION.md); they describe the revisions tested.

## Product behavior

1. Paste a supported public conversation URL. Fetch or reuse its saved content and normalize the messages.
2. Generate a concise title and up to three grounded highlights for an uncached snapshot; use fewer for short sources and omit highlights that only repeat the title. Aim for a 4–7 word title, roughly 10 words at most, with the most distinctive terms first. Highlights are paraphrases, not attributed quotations. Successful generation is required; failures return a retryable error.
3. Review and edit the title, add or remove optional highlights, then choose one of five curated card styles in the in-page preview. Text and style changes update the card as you work. Publish stays disabled while text is invalid or artwork, fonts, and text fitting are not ready.
4. Publish the reviewed wording and chosen style, then copy or open the share URL. Repeated publication of the same presentation reuses its link while available.
5. Read the saved conversation with its original-source link. Preserve extracted text, ordering, roles, Markdown, code, tables, and safe links. Known unsupported media, tools, and artifacts appear as explicit omissions.

The browser, CLI, and [agent skill](../.agents/skills/passage-share/SKILL.md) use the same prepare/publish operations. Browser drafts support text editing before publication; the standalone CLI publishes its original saved draft without regenerating. Draft tokens authorize publication for 24 hours and stay private.

Card styles are repository-owned presets in [social-templates.ts](../lib/social-templates.ts). The browser remembers only appearance preferences; the initial default is Margin notes. Picker thumbnails and selected previews render [SocialCard](../lib/social-card.tsx) directly in the page. Switching styles makes no `/api/card` request. Browser previews and exported images share template JSX and styles, artwork, font packages, and the fitting policy. Blank or whitespace-only highlights are filtered before publication and rendering; title-only cards and readers omit the highlights heading. Character recommendations do not block publication; the hard caps do. Titles display at most two lines with an ellipsis for overflow; the saved summary and reader retain the full title. Card footers show attribution without a reader CTA. The browser measures its own text, so fitted sizes and rendered pixels can differ from Takumi. Publications retain their selected style when browser preferences change. Existing publications with no style retain the plain layout.

Reader and image routes supply crawler-readable initial metadata, absolute image URLs, and noindex directives. Takumi renders 1200 × 630 WebP cards at quality 90 with bundled artwork and fonts, without provider or model requests. Social metadata declares `image/webp`. The draft card endpoint returns WebP by default and supports explicit HTML requests for agent and HTTP consumers.

## Saved content and availability

A source identifies one public provider share. It can have multiple immutable snapshots and publications. A snapshot holds captured conversation content and its cached generated preview; a publication fixes the reviewed text and style selection. Draft edits leave the cached generation and saved conversation unchanged. Published wording is immutable; different reviewed wording or style creates a separate presentation. Images are rendered from checked-in template definitions and assets using the current renderer; exact historical image bytes are not stored.

- Preparation reuses content for seven days after the last complete content fetch. An identical re-fetch advances content verification freshness while retaining the original snapshot and capture time. Availability checks do not advance that freshness or replace saved content.
- Reader visits trigger a background check when the last conclusive availability result is at least seven days old. Manual checks have a source-wide one-hour cooldown and a per-client budget. Preparation and checks share source-level coordination so concurrent requests do not repeat expensive work.
- Confirmed provider removal disables every existing publication of the source, including reader, metadata, and images. Timeouts, challenges, rate limits, server errors, and unrecognized payloads are inconclusive; keep saved content available and back off.
- Recovery requires a new preparation that verifies the source. It can create new links; old disabled publications remain disabled. Publishing rechecks source state in the transaction, so a stale draft cannot revive removed content.
- Public responses use `no-store` and serve generic unavailable content after disablement. External platforms may retain previews they fetched earlier.
- Request-driven cleanup removes abandoned preparations in bounded batches. Published snapshots are retained; disabled content remains stored but is not served.

## Implementation and limits

One Next.js application, PostgreSQL, Drizzle migrations, and the existing CLI. Keep lifecycle transactions together in [service.ts](../lib/service.ts); storage constraints live in [schema.ts](../lib/db/schema.ts). Provider adapters produce the [shared message model](MESSAGE_MODEL.md). Preview generation lives in [suggestions.ts](../lib/suggestions.ts) and [summary.ts](../lib/summary.ts); reader and image presentation use the reviewed text saved in each publication.

Generation currently uses OpenAI with a configurable model, defaulting to `gpt-5.4-nano`. The request has no tools or retries, reasoning disabled, a 15-second timeout, 700 output tokens, and response storage disabled. Input is capped at 20,000 encoded characters, prioritizing the first user and last assistant messages and marking omissions. This compaction never truncates the saved reader.

| Limit | Default |
| --- | --- |
| Title / highlight | Soft guidance: roughly 10 words for the title, 100 characters per highlight. Hard caps: 600 / 1,000 Unicode code points; 0–3 distinct nonblank highlights |
| Provider fetch | 15 seconds total, 2 redirects, 5 MiB wire and decompressed body |
| Saved transcript | 1 MiB encoded message JSON; oversized input is rejected |
| Mutation body | 16 KiB |
| Prepare / manual check | 10 / 5 attempts per client per hour |
| Publish / card API | 60 / 120 attempts per client per hour |

Accept only supported HTTPS provider shares, canonicalize copied query parameters/fragments away, and validate redirects and resolved public IPs. Keep compatibility within those rules; observed CDN paths, signing parameters, and MIME labels are not permanent provider contracts. See [extraction](EXTRACTION.md).

Use validated POST mutations, configured proxy trust, atomic database budgets, escaped text, and safe Markdown. Provider content and model input are untrusted; neither can execute HTML, scripts, or tools. Keep transcript text, draft tokens, signed URLs, and credentials out of routine logs. Rendering uses local assets and does not load remote media.

## Remaining work

Deployment was recorded on September 11, 2026, with Neon configured and Vercel deployed. Local verification does not close the following launch checks:

1. **Recovery:** retain an independent database backup and verify restoration within the chosen hosting limits.
2. **Hosted configuration:** verify the runtime, database, model settings, automatic origins, and request-host validation on production and any preview environment. Reader and image URLs must be anonymously accessible.
3. **Real production flow:** complete extraction → new generated preview → selected card → publication → reader for ordinary ChatGPT, Codex, and Claude shares. Check transcript fidelity and repeated-publication idempotency.
4. **Social unfurls:** inspect the published link in unsent composers or preview tools on X and one other intended platform, including a cold image request. Crawler HTTP checks alone do not establish actual platform display; sending posts requires authorization.

Use the [production guide](PRODUCTION.md) and [testing guidelines](testing.md) for these checks. Record the tested revision, environment, outcome, and any remaining gaps when closing them. Docker execution and controlled deletion of a real provider share also remain unverified; existing Compose validation and synthetic removal tests have narrower coverage.

The accepted [brand identity](brand-identity.md) defines Passage’s current copy, visual rules, and reusable assets. `docs/brand-exploration/` preserves historical proposals and decisions; future ambitions recorded there remain outside the current product scope.

## Scope boundary

Included: public ChatGPT/Codex/Claude sources, generated previews with title/highlight editing during draft review, five curated card styles, browser preferences, immutable saved content and published wording, CLI/skill access, lazy removal checks, basic abuse controls, Vercel hosting, and practical self-hosting.

Deferred: accounts, payments, analytics dashboards, discovery feeds, custom domains/slugs, user-authored themes, uploads, generated per-conversation artwork, editing published passages, private shares, creator deletion tokens, conversation continuation, rich media/artifact rendering, scheduled polling, and additional infrastructure. Expand scope when a concrete need warrants it.

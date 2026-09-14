# MVP scope and remaining work

Passage turns a public ChatGPT, Codex, or Claude conversation into a share link with generated highlights, a social card, and a readable saved conversation. MIT licensed.

This document owns product scope and remaining work. See the [glossary](CONTEXT.md) for terminology, [contributing guide](../contributing.md) for setup, [testing guidelines](testing.md) for validation, and [production guide](PRODUCTION.md) for hosting. Historical results live in [archived verification](archive/VERIFICATION.md); they describe the revisions tested.

The [accounts and paid features handoff](ACCOUNTS_PAID_FEATURES_PLAN.md) defines the expansion. Accounts passed the owner’s Gate A review on September 15, 2026 (`15755bc`). Phase 2 billing, customization, assets, durable image jobs and authenticated CLI are committed locally in `e5f43dd`; see the [paid review](PAID_REVIEW.md) for validation. Gate B remains pending Stripe/R2 provisioning and live lifecycle checks, hosted Workflow verification, and complete model quality/cost qualification. Neither phase has been deployed or migrated to production. See the [accounts review](ACCOUNTS_REVIEW.md), [measured economics](research/PHASE2_MEASURED_ECONOMICS.md), and launch checks below.

## Product behavior

1. Paste a supported public conversation URL. Fetch or reuse its saved content and normalize the messages. A Passage reader URL instead forks the existing publication into an editable draft, reusing its exact saved conversation, reviewed text, and original provider link; owned revisions preserve their saved style, while another sharer’s passage uses the new sharer’s defaults without fetching or summary generation. A generated default background can still start a paid image job.
2. Generate a concise title and up to three grounded highlights for an uncached snapshot; use fewer for short sources and omit highlights that only repeat the title. Aim for a 4–7 word title, roughly 10 words at most, with the most distinctive terms first. Highlights are paraphrases, not attributed quotations. Successful generation is required; failures return a retryable error.
3. Review and edit the title, add or remove optional highlights, then choose one of five curated card styles in the in-page preview. Text and style changes update the card as you work. Publish stays disabled while text is invalid or artwork, fonts, and text fitting are not ready.
4. Publish the reviewed wording and chosen style, then copy or open the share URL. Repeated publication of the same presentation reuses its link while available. Forks have a separate identity from their parent even when unchanged; repeated publication of the same fork reuses its link.
5. Read the saved conversation with its original-source link. Questions use a distinct surface; reasoning summaries, commentary, and tool entries are folded into expandable activity disclosures. Highlights and long questions can be expanded. Preserve extracted text, ordering, roles, Markdown, syntax-highlighted code with copying, tables with desktop expansion and mobile scrolling, and safe links with local favicon glyphs. Known unsupported media, tools, and artifacts retain explicit omissions. See the [message model](MESSAGE_MODEL.md) for older-capture compatibility.

The browser and authenticated CLI use owned saved drafts; the anonymous CLI and [agent skill](../.agents/skills/passage-share/SKILL.md) retain compatible prepare/publish operations. Install the skill with `npx skills add transitive-bullshit/share-ai-passage --skill passage-share`; its bundled CLI defaults to the hosted Passage service. Browser drafts support text editing before publication. The CLI keeps local preview text read-only; authenticated use applies account defaults and saves operation IDs for resume/status and explicit image generation/application. See the [CLI guide](../contributing.md#authenticated-cli). Legacy anonymous draft tokens authorize publication for 24 hours and stay private. Saved browser drafts remain accessible through their owning session; their renewed tokens also require that session and the reviewed revision.

Card styles are repository-owned presets in [social-templates.ts](../lib/social-templates.ts). The browser remembers appearance preferences and syncs them with its account; the initial default is Margin notes. Picker thumbnails and selected previews render [SocialCard](../lib/social-card.tsx) directly in the page. Switching styles makes no `/api/card` request. Browser previews and exported images share template JSX and styles, artwork, font packages, and the fitting policy. Blank or whitespace-only highlights are filtered before publication and rendering; title-only cards and readers omit the highlights heading. Character recommendations do not block publication; the hard caps do. Titles display at most two lines with an ellipsis for overflow; the saved summary and reader retain the full title. Card footers show attribution without a reader CTA. The browser measures its own text, so fitted sizes and rendered pixels can differ from Takumi. Publications retain their selected style when browser preferences change. Existing publications with no style retain the plain layout.

The production homepage, example passages, available readers, and their public images are indexable. Preview, staging, unknown, and local environments stay `noindex`; API/draft routes and unavailable content remain `noindex` everywhere. Indexing requires an explicit Vercel production environment, with `VERCEL_TARGET_ENV` taking precedence over `VERCEL_ENV`. Crawling remains allowed so social previews and noindex directives can be read.

Public pages supply canonical URLs, crawler-readable initial Open Graph and large-image metadata, and absolute image URLs. The homepage includes `WebSite`/`WebApplication` JSON-LD; saved readers and examples include `WebPage`/`CreativeWork` metadata describing their reviewed introduction and original source where available. JSON-LD escapes untrusted text and never duplicates the transcript or exposes unavailable content. Takumi renders 1200 × 630 WebP cards at quality 90 with bundled artwork and fonts, without provider or model requests. Social metadata declares `image/webp`. The draft card endpoint returns WebP by default and supports explicit HTML requests for agent and HTTP consumers.

## Accounts and saved work

Better Auth provides email/password, Google, and GitHub authentication. Passwords accept 4–128 characters across signup, reset, and change-password flows. Email accounts must verify before receiving registered benefits; password reset and connected-method management use the standard auth flows. A guest session starts on creation, not reader or landing-page visits. Signup and existing-account login import that guest’s work and consumption once; account preferences win when already saved.

My passages shows private drafts and owned published passages with pagination. Autosave uses revision checks; another tab cannot silently replace reviewed work. Rerolls are separate charged operations whose results never mutate a shared snapshot’s initial preview. Recovered results can be applied explicitly. Revising an owned passage creates a new draft with its saved text/style; publication remains immutable and produces a new URL.

Quotas count usable generations, including disliked results and unpublished work. Cached summaries, manual edits, style changes and publication are unmetered. Definitive failures refund customer units; internal billed cost remains counted. Uncertain outcomes retain their original-period reservation and require reconciliation, not blind retries. Exhaustion blocks fresh model work while saved work and cached creation remain available.

Owners can delete their passages independently or delete their account and its owned work. Independent passages by other sharers and shared source captures survive. Legacy URLs remain unowned and cannot be claimed through their public address or an old anonymous draft token. Guest imports preserve existing URLs and generation identity.

## Saved content and availability

A source identifies one public provider share. It can have multiple immutable snapshots and publications. A snapshot holds captured conversation content and its cached generated preview; a publication fixes the reviewed text and style selection. Draft edits leave the cached generation and saved conversation unchanged. Published wording is immutable; different reviewed wording or style creates a separate presentation. Images are rendered from checked-in template definitions and assets using the current renderer; exact historical image bytes are not stored for legacy publications. New paid publications instead persist their composed final card and resolved design in immutable R2 assets. Draft artwork and style references remain private; direct public R2 card URLs intentionally remain accessible after Passage disables a publication.

- Preparation reuses content for seven days after the last complete content fetch. An identical re-fetch advances content verification freshness while retaining the original snapshot and capture time. Availability checks do not advance that freshness or replace saved content.
- Reader visits trigger a background check when the last conclusive availability result is at least seven days old. The reader ends with the conversation, without an availability notice or manual-check CTA. Manual checks through the API have a source-wide one-hour cooldown and a per-client budget. Preparation and checks share source-level coordination so concurrent requests do not repeat expensive work.
- Confirmed provider removal disables every existing publication of the source, including reader, metadata, and images. Timeouts, challenges, rate limits, server errors, and unrecognized payloads are inconclusive; keep saved content available and back off.
- Recovery requires a new preparation that verifies the source. It can create new links; old disabled publications remain disabled. Publishing rechecks source state in the transaction, so a stale draft cannot revive removed content.
- Public responses use `no-store` and serve generic unavailable content after disablement. External platforms may retain previews they fetched earlier.
- Request-driven cleanup removes abandoned preparations in bounded batches. Published snapshots, saved-draft references, and unfinished generation inputs are retained; disabled content remains stored but is not served.

## Implementation and limits

One Next.js application, PostgreSQL, Drizzle migrations, and the existing CLI. Paid extensions use Stripe, R2 and the installed Vercel Workflow integration; the [handoff](ACCOUNTS_PAID_FEATURES_PLAN.md) defines their module boundaries. Keep lifecycle transactions together in [service.ts](../lib/service.ts); storage constraints live in [schema.ts](../lib/db/schema.ts). Provider adapters produce the [shared message model](MESSAGE_MODEL.md). Preview generation lives in [suggestions.ts](../lib/suggestions.ts) and [summary.ts](../lib/summary.ts); reader and image presentation use the reviewed text saved in each publication.

Metered summary generation uses `gpt-5.4-nano`; an unpriced `AI_MODEL` override is rejected before reserving usage. A different model requires an explicit supported cost bound. The request has no tools or retries, reasoning disabled, a 15-second timeout, 700 output tokens, and response storage disabled. Input is capped at 20,000 encoded characters, prioritizing the first user and last assistant messages and marking omissions. This compaction never truncates the saved reader.

| Limit | Default |
| --- | --- |
| Title / highlight | Soft guidance: roughly 10 words for the title, 100 characters per highlight. Hard caps: 600 / 1,000 Unicode code points; 0–3 distinct nonblank highlights |
| Provider fetch | 15 seconds total, 2 redirects, 5 MiB wire and decompressed body |
| Saved transcript | 1 MiB encoded message JSON; oversized input is rejected |
| Mutation body | 16 KiB |
| Guest / verified Free summaries | 5 / 25 new generations per UTC calendar month |
| Plus / Pro summaries and images | 100 + 10 / 300 + 25 generations per anchored month |
| Paid uploads | 10 MB per file; 1 GB active uploaded assets per account |
| Shared guest/Free AI budget | $25 per UTC month, including outstanding liability |
| Prepare / manual check | 10 / 5 attempts per client per hour |
| Publish / card API | 60 / 120 attempts per client per hour |

Accept supported HTTPS provider shares and trusted Passage reader links (see the fork rules in the extraction guide), canonicalize copied query parameters/fragments away, and validate redirects and resolved public IPs. Keep compatibility within those rules; observed CDN paths, signing parameters, and MIME labels are not permanent provider contracts. See [extraction](EXTRACTION.md).

Use validated POST mutations, configured proxy trust, atomic database budgets, escaped text, and safe Markdown. Provider content and model input are untrusted; neither can execute HTML, scripts, or tools. Keep transcript text, draft tokens, signed URLs, and credentials out of routine logs. Rendering resolves checked-in artwork or validated owned R2 assets; it does not fetch arbitrary remote media. Use [generation reconciliation](GENERATION_RECONCILIATION.md) for uncertain operations and recorded provider costs.

## Remaining work

The original MVP deployment was recorded on September 11, 2026, with Neon configured and Vercel deployed. The accounts/paid expansion has not been deployed. Its Gate B requires actual Stripe sandbox checkout/webhooks/renewal/cancellation and pack settlement, R2 upload/private access/immutable publication recovery, hosted Workflow lifecycle checks, and qualified image quality/input costs. The remaining 25-call qualification batch awaits the explicit approval requested after automatic approval review rejected it; no batch call ran. The [measured report](research/PHASE2_MEASURED_ECONOMICS.md) separates existing observations from unverified margins.

Local verification also does not close these hosted checks:

1. **Recovery:** retain an independent database backup and verify restoration within the chosen hosting limits.
2. **Hosted configuration:** verify the runtime, database, model settings, automatic origins, and request-host validation on production and any preview environment. Reader and image URLs must be anonymously accessible.
3. **Real production flow:** complete extraction → new generated preview → selected card → publication → reader for ordinary ChatGPT, Codex, and Claude shares. Check transcript fidelity and repeated-publication idempotency.
4. **Social unfurls:** inspect the published link in unsent composers or preview tools on X and one other intended platform, including a cold image request. Crawler HTTP checks alone do not establish actual platform display; sending posts requires authorization.

Use the [production guide](PRODUCTION.md) and [testing guidelines](testing.md) for these checks. Record the tested revision, environment, outcome, and any remaining gaps when closing them. Docker execution and controlled deletion of a real provider share also remain unverified; existing Compose validation and synthetic removal tests have narrower coverage.

The accepted [brand identity](brand-identity.md) defines Passage’s current copy, visual rules, and reusable assets. `docs/brand-exploration/` preserves historical proposals and decisions; future ambitions recorded there remain outside the current product scope.

## Scope boundary

Included: guest creation; email/password, Google and GitHub accounts; saved drafts, My passages, curated preference sync, generation limits, owner deletion, and public ChatGPT/Codex/Claude sources, generated previews with title/highlight editing during draft review, five curated card styles, browser preferences, immutable saved content and published wording, CLI/skill access, lazy removal checks, basic abuse controls, Vercel hosting, and practical self-hosting.

Implemented locally, awaiting Gate B: Plus ($10/month or $96/year), Pro ($25/month or $240/year), the $10/50 image pack, custom branding, uploads, saved templates, generated artwork and account API keys. Both paid plans share customization features; annual plans refill monthly with no included rollover.

Deferred scope: analytics dashboards, discovery feeds, custom domains/slugs, user-authored themes, editing published passages, private shares, creator deletion tokens, conversation continuation, rich media/artifact rendering, scheduled polling, and additional infrastructure. Expand scope when a concrete need warrants it.

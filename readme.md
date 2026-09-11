# Passage

Turn a public ChatGPT, Codex, or Claude conversation into an immutable share link with a generated title and highlights, a typeset social card, and a readable saved conversation.

One Next.js app, PostgreSQL, and Drizzle. No accounts, worker, Redis, object storage, or browser extraction service. [MIT licensed](./license). Product scope and terminology live in the [MVP plan](docs/MVP_PLAN.md) and [domain glossary](docs/CONTEXT.md).

## Run locally

Requires Node.js 24+ and pnpm. The template currently uses pnpm 12.3.4.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:local start
pnpm db:migrate
pnpm dev
```

`pnpm dev` runs Next.js through [Portless](https://portless.sh/). Open the named URL printed in the terminal, normally `https://ai-chat-proxy.localhost`. Portless reuses your existing proxy settings, so the scheme or proxy port may differ. Git worktrees get their own subdomain automatically. The app uses the assigned URL for metadata, share links, and same-origin requests during development.

Paste a public `https://chatgpt.com/share/<uuid>`, `https://chatgpt.com/s/cx_<id>` (Codex), or `https://claude.ai/share/<uuid>` link and press **Go**. Review the automatically generated title and highlights, choose a social-card template, then **Publish**. The title and highlights stay unchanged; the preview is the actual PNG served by the published link. Your last template choice becomes the default for your next share in this browser.

To run Next.js directly at [localhost:3000](http://localhost:3000), use `PORTLESS=0 pnpm dev` with `APP_URL=http://localhost:3000`.

`db:local` uses installed PostgreSQL binaries (Postgres.app, Homebrew, or `PG_BIN`). It creates an isolated database in ignored `work/postgres-data`, listening only on `127.0.0.1:55432`. It never replaces an existing database. Data survives app restarts and `pnpm db:local stop`. Use `pnpm db:local status` to inspect it.

The native local connection is `postgresql://postgres@127.0.0.1:55432/ai_chat_proxy`. Set `DATABASE_URL` to use any other PostgreSQL instance. After schema changes, run `pnpm db:generate` and commit the migration. Apply checked-in migrations with `pnpm db:migrate`.

### Docker alternative

Stop the native helper first if it occupies port 55432:

```sh
docker compose up -d db
```

Set `DATABASE_URL=postgresql://postgres:passage-local@127.0.0.1:55432/ai_chat_proxy` in `.env.local`, then migrate and run Next.js as above. The Compose password is for local development only.

To run both services in containers, copy `.env.example` to `.env` (Compose reads `.env`, not `.env.local`), set a random `APP_SECRET`, and run:

```sh
docker compose --profile app up --build
```

The app container migrates before starting. PostgreSQL uses a persistent named volume. `docker compose down -v` erases that volume; an ordinary `down` preserves it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact public origin, including any port. Used for metadata, share links, and same-origin POST validation. During development, Portless's injected `PORTLESS_URL` takes precedence. |
| `DATABASE_URL` | PostgreSQL connection; use provider-supported TLS when hosted. |
| `APP_SECRET` | Stable random secret, at least 32 characters, for signed draft tokens and hashed client budgets. Required in production. |
| `TRUST_PROXY` | `none` by default; `vercel` or `single` only with the matching proxy configuration below. |
| `AI_PROVIDER`, `AI_MODEL` | `openai` and `gpt-5.4-nano` by default. The model can be changed in configuration. |
| `OPENAI_API_KEY` | Required for new preview generation; never exposed to the browser. |
| `PASSAGE_URL` | CLI service origin; can also be set with `--base-url`. |
| `PG_BIN` | Optional PostgreSQL executable directory for the native helper. |
| `TEST_DATABASE_URL` | Enables integration tests against a migrated, disposable database. |

Generate an app secret with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep it in the environment, never in Git. Changing it expires prepared drafts; published links remain valid.

### Preview generation

Preview generation uses OpenAI [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano) with reasoning disabled. It sends a bounded source title and conversation text to the OpenAI API. There is no excerpt fallback: missing credentials, invalid output, or a failed request produces a retryable error.

Model input is capped at 20,000 encoded characters. Short conversations are kept whole. Longer ones prioritize the first nonempty user message and the last nonempty assistant message, then add context from the edges in original order. If those two messages alone are too large, their budgets are shared and their middles are cut. Omitted content is marked; the saved reader always retains the full transcript.

The call has no tools or retries, a 15-second timeout, a 700-token output limit, and response storage disabled. The server validates and caches the generated title/highlights. Rendering, reviewing, and publishing a saved preview require no further model calls.

The model's JSON Schema and server validation both limit titles to 60 Unicode characters and each highlight to 100. Generation failures produce a structured `preview_generation_failed` log with an allowlisted category, elapsed time, and available safe HTTP status, request ID, and finish reason. Diagnostics exclude error messages, source URLs, transcript text, model output, request/response bodies, and credentials.

## CLI and agent skill

The CLI uses the same service API as the web app. It requires Node.js 24+ and a running Passage service; it has no npm dependencies. Set `PASSAGE_URL` to the service's exact origin. Its local default is `http://ai-chat-proxy.localhost:1355`.

```sh
pnpm share prepare 'https://chatgpt.com/s/cx_<id>' --out work/draft.json
pnpm share publish work/draft.json
```

For one interactive command, use `pnpm share '<public-url>'`; it displays the preview before asking to publish. Noninteractive use prepares only unless `--yes` is supplied. `--json` provides structured output for agents:

```sh
pnpm share '<public-url>' --yes --json --base-url https://your-passage.example
```

`prepare` never publishes. `publish` uses the token and service origin saved in the draft file, and rejects altered preview text. Keep draft files local: their tokens can publish that preview until they expire. Publishing the same draft again returns the same link. Run `pnpm share --help` for all options.

The portable [passage-share skill](.agents/skills/passage-share/SKILL.md) includes the CLI. It is available to agents that discover this repository's `.agents/skills` directory. To use it elsewhere, copy the entire `passage-share` folder into the agent's skill directory (for example, `~/.codex/skills` or `~/.claude/skills`) and set `PASSAGE_URL`. The skill prepares a public provider URL, presents the returned preview, and publishes the saved draft when authorized. It does not create the provider's public share URL or post links to other services.

## Saved conversations and removal

- A **snapshot** is immutable conversation content with a cached generated preview. A **publication** saves that preview's title, highlights, and selected card appearance. The draft token is bound to the reviewed text; card and publish requests accept the token and an allowlisted template choice. They reject edited title/highlight fields and arbitrary style or asset inputs.
- Identical submissions with the same template and retried publishes reuse the same publication. A different template produces a separate publication without re-extracting the source or generating another summary. Changed content can produce a new snapshot without changing existing publications. Older publications without a template, including excerpt links, retain their original readers and plain cards.
- Preparations reuse captured content for seven days. Only a complete content fetch advances capture freshness; availability checks do not. Identical re-fetched content reuses its snapshot and cached preview.
- Reader visits check availability in the background when the last definitive check is at least seven days old. All publications of a source share one database lease.
- “Check original availability” has a source-wide one-hour cooldown and a five-attempt/hour client budget. Timeouts, challenges, 429s, 5xx responses, and parsing changes are inconclusive and back off for at least one hour.
- Confirmed removal disables **all** publications of the source and their image/metadata endpoints. Saved titles, highlights, excerpts, and transcript text are replaced by a generic unavailable page/card. Old links stay disabled if the source later returns; a new verified creation gets a new link.
- Reader, metadata, and image responses use `no-store`, so no owned persistent publication cache needs purging. Other platforms can retain previews they fetched earlier; disabling the provider share cannot immediately erase those copies.
- There is no account, directory, sitemap, private deletion link, or post-publication editor. Remove public access at the original provider to initiate removal here.

Draft capabilities expire after 24 hours. Successful preparations opportunistically run cleanup at most hourly, removing unpublished snapshots older than seven days in bounded batches, empty old sources, and expired rate-limit records. Published snapshots are retained. Disabled content remains stored but is not served.

## Supported content and limits

The reader preserves extracted text, ordering, Markdown, code, tables, and safe links. Unsupported images, attachments, tool activity, and interactive artifacts appear as explicit omission markers. Provider HTML is never executed and remote media is never loaded.

| Limit | Default |
| --- | --- |
| Title / highlight | 60 / 100 Unicode code points; 1–3 highlights |
| Provider fetch | 15 seconds total, at most 2 redirects, 5 MiB decompressed body |
| Normalized conversation | 1 MiB; reject larger conversations instead of silently truncating |
| Mutation JSON body | 16 KiB |
| Preparation / manual check | 10 / 5 attempts per client per hour |
| Publish / card preview | 60 / 120 attempts per client per hour |
| Draft lifetime / lease | 24 hours / 60 seconds |
| Manual check / transient retry cooldown | At least one hour |
| Summary generation retry | 30 seconds |

Public `/share/` links and ChatGPT `/s/cx_` Codex shares are supported on the exact HTTPS provider hosts. Copied query parameters and fragments are ignored when building the canonical source and upstream URL. Codex downloads can use different paths, signature formats, and redirect chains within OpenAI's content-download domain. A valid JSON conversation is accepted even when labeled as plain text or a generic download. Private routes, credentials, unusual ports, and redirects outside supported provider domains remain blocked; every upstream connection resolves and pins a public IP.

Cards use Satori/Resvg to render 1200 × 630 PNGs with the same typography and fitting logic for generated examples, selected private previews, and publications. Rendering makes no provider, model, font-CDN, emoji-CDN, or remote artwork requests. Glyph coverage and complex-script typography are bounded by the bundled fonts; unsupported glyphs do not alter saved reader text.

See [extraction evidence](docs/EXTRACTION.md) for verified payloads, public samples, and provider limitations. These undocumented first-party endpoints can change. Browser challenges are inconclusive failures, never a reason to bypass provider protections.

## Social-card templates and personal defaults

Five repository-owned presets are available during review: **Margin notes**, **Electric risograph**, **Maker’s workbench**, **Midnight observatory**, and **Friendly lab**. Margin notes is the initial default. Choosing another template refreshes the real card preview and remembers the choice automatically; the generated title and highlights stay the same.

Picker thumbnails use lightweight browser-rendered HTML with sample text, sharing the templates' optimized JPEG assets, typography, colors, and layout definitions. They do not request generated PNGs. The selected preview and published image remain full-fidelity server-rendered PNGs containing the reviewed title and highlights.

The browser saves only versioned appearance preferences in `localStorage` under `passage:card-preferences:v1`. It does not save the conversation, draft token, source URL, or generated summary there. Preferences apply to later creations in the same browser and origin, and update across open tabs. Invalid or outdated preferences fall back to Margin notes. If browser storage is unavailable, the selected template still works for the current visit. CLI/API requests without an appearance use Margin notes independently of browser preferences.

Publishing stores the selected template with the publication. Later preference changes do not restyle existing links. Migration `drizzle/0002_social_card_appearance.sql` adds a nullable `publications.appearance` column; apply it with `pnpm db:migrate` before running the updated app. Existing rows remain null and retain the legacy plain card. Unavailable conversations always use the generic disabled card.

Template definitions live in [`lib/social-templates.ts`](lib/social-templates.ts): each includes its background path, layout and text bounds, title/body font families and weights, colors, and version. Backgrounds are optimized JPEG files in `public/social-templates/<template-id>/background.jpg`. Edit these checked-in definitions and assets to maintain designs; the public API only accepts known template IDs.

Inter, DM Sans, and Newsreader provide the template typography. `pnpm fonts:prepare` copies licensed WOFF subsets from the installed Fontsource packages into `assets/fonts`, together with a Unicode manifest and license files; it runs before development, builds, and unit tests. Noto Sans, Noto Sans SC, and Noto Emoji provide local fallback coverage. The renderer embeds the selected font bytes and JPEG bytes directly and shrinks text to fit its reserved area without dropping highlights.

[`next.config.ts`](next.config.ts) explicitly includes `assets/fonts/**/*`, `public/social-templates/*/background.jpg`, and Satori's HarfBuzz WASM in Node.js output traces. This keeps dynamically selected artwork and fonts available in production bundles and Vercel functions. Keep these tracing entries when adding or reorganizing templates, and regenerate fonts before building. A standalone deployment must also serve the app's public/static files as described in the installed Next.js output guide.

## Reverse proxies and hosting

With `TRUST_PROXY=none`, all clients share a conservative budget. This is intentional for local testing: arbitrary forwarded headers cannot create new client identities.

- On Vercel, use `TRUST_PROXY=vercel`. The app also requires `VERCEL=1` and uses the platform-overwritten `x-vercel-forwarded-for` header. [Vercel header documentation](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
- Behind one self-hosted reverse proxy, use `TRUST_PROXY=single` only if it **overwrites** `X-Real-IP` with the connecting client address. For Nginx: `proxy_set_header X-Real-IP $remote_addr;`. Prevent direct public access to the app port and do not append untrusted incoming headers.
- Serve the hosted app over HTTPS and set `APP_URL` to its exact origin. Keep reader/image routes publicly fetchable by social crawlers. Avoid authentication or challenges in front of those routes.

For Vercel, import this single Next.js project, retain `pnpm build`, configure PostgreSQL and environment variables, and apply `pnpm db:migrate` once before serving traffic. Provider fetching, PostgreSQL, and card rendering use Node.js routes. The connection pool is limited to five connections per instance; prepared statements are disabled for pooler compatibility. Choose database and function regions together. This local setup provisions no hosted database.

For self-hosting, `pnpm build && pnpm start` runs the same app. The Dockerfile includes the migration CLI for single-instance startup. Multi-instance deployments should run migrations as a separate release step.

## Verification

```sh
pnpm fix:format
pnpm fix:lint
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/ai_chat_proxy pnpm test
pnpm build
```

Tests cover provider fixtures, URL/redirect/DNS safety, decompression limits, summary validation, legacy quote integrity, offline rendering and Unicode fitting across five templates, browser preference persistence, same-origin requests, preview-bound signed drafts, rejected text/style edits, template-aware publishing, CLI behavior, database constraints, concurrent limits, preparation reuse, idempotency, lease expiry, backoff, removal, recreation, and cleanup. PostgreSQL tests skip without `TEST_DATABASE_URL`. CI provisions PostgreSQL, migrates, runs the checks, and builds.

**Unit tests never make paid API calls, locally or in CI.** Vitest disables `.env` loading, clears inherited model credentials, and blocks external fetch/HTTP(S) connections. Generator tests replay the checked-in summary fixture through a mock model. Local PostgreSQL and CLI fixture servers remain available.

Fixture regeneration is a separate, explicit paid operation:

```sh
pnpm fixtures:summary --regenerate
```

This makes one OpenAI request using the small authored conversation in `tests/fixtures/summary.json` and saves the result for subsequent offline runs. It refuses to run without the flag or in CI/test environments. A missing fixture is never regenerated automatically.

With a production build running (`pnpm build`, then `pnpm start`), use real shares for the HTTP smoke test. Next.js development mode uses different cache headers, so this test deliberately targets production behavior:

```sh
pnpm smoke 'https://chatgpt.com/share/<uuid>' 'https://claude.ai/share/<uuid>'
```

This manual live check prepares each source twice, rejects attempted preview edits, verifies idempotent publishing, checks initial-response metadata and provider routing, and compares preview/public PNG bytes and dimensions. It also compares the full reader against the saved local snapshot, so it must run with the matching local database configuration. Only check results, local publication URLs, and PNGs are saved to ignored `work/smoke`. It creates local publications and consumes four preparation attempts. Uncached real sources can incur a model charge; cached summaries are reused. This command is outside the unit suite and CI.

Run `pnpm smoke:removal` against the same local app/database to verify disabled HTML, RSC responses, metadata, and direct images. It creates and cleans up uniquely identified synthetic publications, simulates removal only for those records, and never alters the real sample sources. Provider-checker behavior is tested separately in the lifecycle integration suite.

See [verification notes](docs/VERIFICATION.md). Hosted extraction and actual social-platform unfurls are separate checks; local HTTP metadata validation does not establish platform cache behavior.

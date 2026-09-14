# Contributing to Passage

Passage is one Next.js app, PostgreSQL, and Drizzle. This guide covers local setup, configuration, CLI and agent workflows, card maintenance, and verification.

Read the [project conventions](AGENTS.md) before making changes. Product scope and remaining work live in the [MVP plan](docs/MVP_PLAN.md); terminology lives in the [glossary](docs/CONTEXT.md). Customer-facing changes follow the accepted [brand identity](docs/brand-identity.md).

## Run locally

Requires Node.js 24+ and pnpm; the pinned version is in [package.json](package.json).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:local start
pnpm db:migrate
pnpm dev
```

Set `OPENAI_API_KEY` in `.env.local` before preparing a new conversation. Preview generation sends bounded public conversation text to OpenAI; missing credentials or generation failures return a retryable error. The default model is `gpt-5.4-nano`; `AI_MODEL` changes it and `AI_PROVIDER` currently supports `openai`.

`pnpm dev` uses [Portless](https://portless.sh/). Open the exact URL printed in the terminal, normally `https://share-ai-passage.localhost`; proxy settings can change its scheme or port. Worktrees get their own app subdomain. To run directly at [localhost:3000](http://localhost:3000), use `PORTLESS=0 pnpm dev` (`PORT` overrides 3000).

Paste a public `https://chatgpt.com/share/<uuid>`, `https://chatgpt.com/s/cx_<id>`, or `https://claude.ai/share/<uuid>` URL. Choose **Create a passage**, review or edit the generated title and add or remove optional highlights, choose a card style, then **Publish passage**. Text and style changes update the preview directly in the page without a `/api/card` request. Publishing becomes available when the text is valid and artwork, fonts, and text fitting are ready. The browser remembers your last style choice.

### Local database

`db:local` uses installed PostgreSQL binaries (Postgres.app, Homebrew, or `PG_BIN`). It stores persistent data in ignored `work/postgres-data` and listens at `127.0.0.1:55432`. It refuses an occupied port or an unrecognized data directory. Use `pnpm db:local status` to inspect it and `pnpm db:local stop` to stop it without erasing data.

The native connection is `postgresql://postgres@127.0.0.1:55432/ai_chat_proxy`. Set `DATABASE_URL` for another PostgreSQL instance. After schema changes, run `pnpm db:generate` and commit the migration; apply checked-in migrations with `pnpm db:migrate`.

### Production data

The explicit `pnpm dev:prod`, `pnpm build:prod`, and `pnpm start:prod` commands use **real production Neon data** from ignored `.env.prod.local`. See the [production guide](docs/PRODUCTION.md) for setup, migrations, hosting, and proxy configuration.

### Docker alternative

Stop the native helper if it occupies port 55432, then run:

```sh
docker compose up -d db
```

Set `DATABASE_URL=postgresql://postgres:passage-local@127.0.0.1:55432/ai_chat_proxy` in `.env.local`, then migrate and run Next.js as above. The Compose password is for local development only.

To run both services, copy `.env.example` to `.env` (Compose reads `.env`, not `.env.local`), set a random `APP_SECRET`, and run `docker compose --profile app up --build`. The app migrates before starting. An ordinary `docker compose down` preserves database data; `down -v` erases it. Container execution remains unverified.

## Configuration

Start with [.env.example](.env.example). `APP_SECRET` must be stable and at least 32 characters in production; changing it expires drafts but leaves published links valid. Keep secrets outside Git.

The app derives its public origin from Portless in development, Vercel system variables when hosted there, or localhost and `PORT` elsewhere. The [production guide](docs/PRODUCTION.md) explains the exact origin and proxy behavior. Set `PASSAGE_URL` to the actual service origin when using the CLI or smoke scripts.

The public `/llms.txt` is served from `public/llms.txt`. Keep its product summary, supported link formats, and documentation links aligned with current behavior.

## Accounts development

Apply pending migrations before running the accounts app. Better Auth uses the existing database with `BETTER_AUTH_SECRET` (or the stable `APP_SECRET` fallback) and an optional explicit `BETTER_AUTH_URL` matching the local or hosted origin. Google/GitHub require their client IDs and secrets; email signup, verification and recovery require `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`. See [.env.example](.env.example) and the [service setup checklist](docs/THIRD_PARTY_SETUP.md). The earlier `EMAIL_FROM`/`EMAIL_REPLY_TO` names remain accepted as aliases. Missing providers are visibly unavailable; guest creation still works with local PostgreSQL and no email credentials.

Use `/account` for account settings and `/passages` for saved work. The browser starts its guest session only on creation. Authenticated draft endpoints live under `/api/drafts`; mutations require the same origin and JSON. `GET /api/account/usage` returns `allowance`, `used`, `reserved`, `remaining` and `resetAt`. New summaries consume the guest/Free calendar-month allowance; cached work and publishing remain available at exhaustion. Generation limit errors include `code` (`SUMMARY_LIMIT` or `FREE_BUDGET_LIMIT`) and `resetAt`.

The anonymous CLI remains supported; authenticated CLI credentials and account-default custom templates belong to the paid phase after feedback. New metered model calls require the supported `gpt-5.4-nano` task bounds. Changing a model or prompt/input limit requires updating its conservative cost policy before exposing it through the app.

### Google sign-in with local HTTPS

Google rejects `.localhost` subdomains. Follow the [Portless Google OAuth guide](https://github.com/vercel-labs/portless/tree/main/examples/google-oauth) using a hostname under the owned domain. The isolated accounts setup below preserves the normal development proxy and routes HTTPS port 8443 to the accounts backend on `127.0.0.1:3107`.

The exact Vercel DNS record `share-ai-passage-accounts-afc0.local` under `share-ai-passage.com` is an **A** record pointing to `127.0.0.1`, TTL **60**. DNS resolution and trusted HTTPS serving have been verified. Current client provisioning and completed sign-in checks are recorded in the [production guide](docs/PRODUCTION.md#google-development-with-portless).

Run from the accounts checkout:

```sh
(
  export PORTLESS_STATE_DIR="$HOME/.portless-passage-accounts-https"
  export PORTLESS_PORT=8443 PORTLESS_HTTPS=1 PORTLESS_LAN=0 PORTLESS_SYNC_HOSTS=0
  pnpm exec portless proxy start --port 8443 --https --tld local.share-ai-passage.com
  pnpm exec portless alias share-ai-passage-accounts-afc0 3107
)
```

Portless generates a local CA and attempts to trust it; approve the macOS authorization dialog if requested. Keep hosts sync disabled: separate proxies otherwise replace the same managed `/etc/hosts` block. DNS supplies the mapping here. Do not stop the shared proxy or run global hosts sync/cleanup for this setup.

The static alias does not configure the backend's origin. Set both values in this checkout's ignored `.env.local`, alongside its isolated development database and separate **development** OAuth credentials:

```dotenv
PORTLESS_URL=https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443
BETTER_AUTH_URL=https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443
```

Restart only that backend with these settings. To start it after preparing the bundled fonts, use `pnpm exec next dev --hostname 127.0.0.1 --port 3107`. Keep the main checkout on its existing `pnpm dev` workflow.

Register the HTTPS origin above as the development Google client's authorized JavaScript origin. Its exact redirect URI is that origin plus `/api/auth/callback/google`; add `/api/auth/callback/github` to the development GitHub app when enabling GitHub on this origin too. Keep the scheme, hostname and port identical to the backend settings, and verify each complete sign-in roundtrip. Use [service setup notes](docs/PRODUCTION.md) for current provisioning status; production credentials stay in production.

## CLI and agent skill

Install the portable [passage-share skill](.agents/skills/passage-share/SKILL.md) with the [skills CLI](https://skills.sh):

```sh
npx skills add transitive-bullshit/share-ai-passage --skill passage-share
```

Choose your agent in the installer, then ask it to use `passage-share` with a public conversation URL. The skill includes a dependency-free CLI, requires Node.js 24+, and defaults to `https://www.share-ai-passage.com`. No repository checkout or local service is needed. It consumes an existing public provider URL; it does not create that URL or post links to other services.

### Skill distribution

The public GitHub repository is the distribution source. The skills CLI discovers `.agents/skills/passage-share/` and installs the whole folder, including `scripts/passage.mjs`. Keep the `--skill passage-share` selector so repository maintenance skills are not installed alongside it.

Publish skill updates to the repository's default branch, then verify the public install command from a temporary project. [skills.sh lists skills automatically through CLI installation telemetry](https://skills.sh/docs/faq#how-do-i-get-my-skill-listed-on-the-leaderboard); no npm package or separate registry upload is required. Users can run `npx skills update` to get updates.

### Local CLI development

From this checkout, run the bundled CLI directly. Set `PASSAGE_URL` or `--base-url` to the actual local server origin when testing against a local service:

```sh
node .agents/skills/passage-share/scripts/passage.mjs prepare 'https://chatgpt.com/s/cx_<id>' --base-url http://share-ai-passage.localhost:1355 --out work/draft.json
node .agents/skills/passage-share/scripts/passage.mjs publish work/draft.json
```

`prepare` never publishes. The standalone CLI's `publish` uses the original saved draft and its server, rejects changes to that local draft's preview, and reuses the link when retried. Browser draft editing is separate from this CLI flow. Keep draft files private: their tokens authorize publication until they expire.

API clients can send an optional `preview: { title, highlights }` with the existing draft token to `POST /api/publish` or `POST /api/card`. Omitting it uses the cached generated preview. The server normalizes Unicode and whitespace and applies the same [summary limits](docs/MVP_PLAN.md#implementation-and-limits), including distinct nonblank highlights. Blank slots are filtered out, and a title-only passage is valid. Recommendations do not block publishing; hard caps are 600 Unicode characters for a title and 1,000 per highlight (at most three). Apply migration `0006_short_vertigo.sql` before deploying this behavior so database constraints accept the new limits. Publishing stores the reviewed text in the publication; it does not replace the snapshot's cached generation.

`node .agents/skills/passage-share/scripts/passage.mjs share '<public-url>'` displays the preview and asks before publishing in a terminal. Noninteractive use prepares only unless `--yes` is supplied. Use `--json` for structured output and `node .agents/skills/passage-share/scripts/passage.mjs --help` for options.

## Fork an existing passage

Paste a Passage reader URL into the same creation form or pass it to the CLI's `prepare` command. The server reads the existing publication from its database and prepares a fork with the saved title and highlights. Owned revisions and legacy anonymous CLI forks preserve the saved card style; browser forks of someone else’s passage use the new sharer’s defaults. It reuses that publication's exact snapshot, even if a newer source capture exists, and preserves the original provider link. No provider or AI request runs.

Edit and publish normally. Even an unchanged fork receives a distinct URL from its parent; repeated publication of the same fork is idempotent. Missing or disabled passages cannot be forked, and source removal affects forks too. Production www/apex links and the configured application origin are accepted; the referenced publication must exist in the current deployment's database.

For API consumers, preparation returns an optional `appearance` for a fork. Omitting appearance on `/api/card` or `/api/publish` preserves the parent style; omitting preview preserves its reviewed text. Ordinary provider drafts retain the existing generated-preview and default-style behavior.

## Saved conversations

- Passages retain their saved conversation, reviewed title/highlights, and chosen style. Draft edits leave the cached generated preview unchanged. Published wording is fixed; identical presentations reuse a link, while different wording or style creates a separate presentation.
- The reader preserves extracted text and Markdown, folds reasoning/activity by default, highlights and copies fenced code, and supports wide desktop tables with contained mobile scrolling. Links use local favicon glyphs. Unsupported media, tools, and artifacts retain explicit omission markers. Provider HTML is not executed and saved conversation media is not loaded. Published chat links have optional hover previews with remote artwork; see the [message model](docs/MESSAGE_MODEL.md#reader-link-previews).
- Removing public access at the provider initiates removal here. Availability checks run lazily after seven days or through the rate-limited manual check. Confirmed removal disables all existing passages and cards from that source; temporary failures leave them available.
- External platforms may retain previews they already fetched. Disabled content remains stored but is not served. Old links stay disabled if the source returns.
- Accounts provide saved drafts, My passages, curated preference sync and owner deletion. Published passages remain immutable; revise them into a new URL. Public discovery and private deletion links are not part of this release.
- Available production passages and their public cards may appear in search results. Preview/staging/local builds, drafts, and unavailable content stay `noindex`. Page canonicals, social metadata, and safely serialized JSON-LD describe the same saved presentation. See [hosting configuration](docs/PRODUCTION.md#hosting-configuration) for the environment policy.

See [product behavior and limits](docs/MVP_PLAN.md), [supported extraction](docs/EXTRACTION.md), and the [message model](docs/MESSAGE_MODEL.md).

## Maintaining cards

Templates and layout definitions live in [social-templates.ts](lib/social-templates.ts), with optimized backgrounds and [asset provenance](public/social-templates/README.md) under `public/social-templates/`. The public interface accepts known styles only. The in-page preview renders [SocialCard](lib/social-card.tsx) locally, sharing template JSX and styles, artwork, font packages, and the fitting policy with exported images. Browser and Takumi text measurements can produce different fitted sizes and pixels.

`pnpm fonts:prepare` builds the local font bundle before development, builds, and unit tests. Keep the artwork, font, and native renderer tracing entries in [next.config.ts](next.config.ts) when changing rendering assets. The renderer fits text without dropping highlights; glyph coverage is limited by the bundled fonts. Takumi exports 1200 × 630 WebP cards at quality 90. The draft `/api/card` endpoint returns WebP by default and accepts an explicit HTML format for agent and HTTP consumers.

## Visual share card review

The project [visual-share-card-migration skill](.agents/skills/visual-share-card-migration/SKILL.md) applies before changing card visuals or the structured summary task. Eight authored conversations cover short advice, debugging, travel, tradeoffs, uncertainty, German, dense text, and long-input truncation. Each review renders eight representative cards, one per conversation spread across the five styles, through the real WebP and HTML renderers. It needs no database or running app.

```sh
# Start before editing: eight chats, eight cards, eight paid requests.
pnpm cards:review start summary-review --generate

# After a visual change, keep the same sources/styles and latest candidate text.
pnpm cards:review update summary-review

# After a summary-task change, regenerate on those same sources and styles.
pnpm cards:review update summary-review --generate
pnpm cards:review serve
```

Open [the review](http://127.0.0.1:4399/summary-review.html) or choose a run at [the local review index](http://127.0.0.1:4399). Keep using `update summary-review` for each tweak: the before stays frozen, while a successful full capture refreshes the latest after and the same report URL. Updates keep the baseline's source chats and style pairings. Without `--generate`, they retain the latest after's summaries and provenance, or the before's on the first update. A failed update preserves the previous before, after, and report. Each gallery supports chat/template filters, changed-only comparisons, word counts, expandable source text, native-size exports, and saved HTML previews.

`start <run>` captures the current output; omit `--generate` for an offline layout baseline using clearly labeled authored summaries. `start <run> --from <saved>` copies an existing frozen snapshot and assets as the before without rerendering, preserving its original summary provenance. Add `--generate` to make a fresh before from the saved source chats using the current AI task. Live generation loads ordinary local configuration, bypasses cached app previews, and refuses CI/test environments. The lower-level `capture` and `compare` commands remain available for importing or comparing historical snapshots.

Inspect the final saved HTML samples after fonts and artwork load alongside their exported WebP images. When a change affects the app preview, inspect the live `SocialCardPreview` after its fonts and artwork load too. Verify requested ellipsis and fit in those actual outputs; synthetic stress cases and height assertions alone are insufficient. Word counts and image changes support human review and do not establish plain-language compliance or semantic quality. Reports, source JSON, model/task provenance, and rendered assets remain under ignored `work/share-card-review/`. They include complete conversation text. No passage is published.

## Marketing examples

The homepage and two [README previews](readme.md#example-passages) feature **Give your public AI chats a facelift**, with approved highlights and no trailing periods. [lib/marketing-examples.ts](lib/marketing-examples.ts) records the real public Codex source, reviewed wording, and production publication URLs for Margin notes and Midnight observatory. Both cards link directly to database-backed production readers. The legacy example reader URLs redirect to those publications; local example image routes render the same wording and styles without database access. Keep the provider source public so the publications remain available. Changes to published wording require new publications and updated URLs.

The landing-page X comparison uses the committed `public/images/landing-passage-card.webp`, generated from `featuredExample`. It loads eagerly with high fetch priority through a static image import, bypassing both the dynamic Takumi route and runtime image optimization. After changing the featured example or card design, regenerate it with `pnpm fonts:prepare && pnpm exec tsx scripts/build-landing-card.ts` and visually review the output. Sharp is used only during asset generation.

After updating the reviewed example, fetch these card routes from the normal local development origin:

| Route | README image |
| --- | --- |
| `/examples/share-your-ai-chats/image` | `docs/readme-assets/example-passage-01.webp` |
| `/examples/share-your-ai-chats-after-dark/image` | `docs/readme-assets/example-passage-02.webp` |

## Verification

Run `pnpm test` for repository checks and `pnpm build` for a production build. PostgreSQL tests require `TEST_DATABASE_URL` pointing to a migrated, disposable database; without it, those suites skip. Tests use mocked or fixture-backed provider/model responses and block external requests.

See [testing guidelines](docs/testing.md) for focused checks, database prerequisites, and separate HTTP/browser/live checks. The [remaining work](docs/MVP_PLAN.md#remaining-work) distinguishes local verification from hosted extraction, recovery, and actual social unfurls.

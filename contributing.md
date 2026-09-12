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

`pnpm dev` uses [Portless](https://portless.sh/). Open the exact URL printed in the terminal, normally `https://ai-chat-proxy.localhost`; proxy settings can change its scheme or port. Worktrees get their own app subdomain. To run directly at [localhost:3000](http://localhost:3000), use `PORTLESS=0 pnpm dev` (`PORT` overrides 3000).

Paste a public `https://chatgpt.com/share/<uuid>`, `https://chatgpt.com/s/cx_<id>`, or `https://claude.ai/share/<uuid>` URL. Choose **Create a passage**, review the generated title and highlights, choose a card style, then **Publish passage**. Text is read-only; style changes update the preview directly in the page without a `/api/card` request. Publishing becomes available after artwork, fonts, and text fitting are ready. The browser remembers your last style choice.

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

## CLI and agent skill

The standalone CLI requires Node.js 24+ and a running Passage service. It uses the same service operations as the web app and has no npm dependencies. Its default origin is `http://ai-chat-proxy.localhost:1355`; set `PASSAGE_URL` or `--base-url` to match your server.

```sh
pnpm share prepare 'https://chatgpt.com/s/cx_<id>' --out work/draft.json
pnpm share publish work/draft.json
```

`prepare` never publishes. `publish` uses the saved draft and its original server, rejects altered preview text, and reuses the link when retried. Keep draft files private: their tokens can publish the preview until they expire.

`pnpm share '<public-url>'` displays the preview and asks before publishing in a terminal. Noninteractive use prepares only unless `--yes` is supplied. Use `--json` for structured output and `pnpm share --help` for options.

The portable [passage-share skill](.agents/skills/passage-share/SKILL.md) includes the CLI. To use it elsewhere, copy the whole skill folder into your agent's skill directory and set `PASSAGE_URL`. It consumes an existing public provider URL; it does not create that URL or post links to other services.

## Saved conversations

- Passages retain their saved conversation, generated title/highlights, and chosen style. Identical presentations reuse a link; changed source content can produce a new snapshot.
- The reader preserves extracted text, Markdown, code, tables, and safe links. Unsupported media, tools, and artifacts have explicit omission markers. Provider HTML is not executed and remote media is not loaded.
- Removing public access at the provider initiates removal here. Availability checks run lazily after seven days or through the rate-limited manual check. Confirmed removal disables all existing passages and cards from that source; temporary failures leave them available.
- External platforms may retain previews they already fetched. Disabled content remains stored but is not served. Old links stay disabled if the source returns.
- There are no accounts, passage editors, private deletion links, or public discovery directory.

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

The two [README previews](readme.md#example-passages) share one authored question-and-answer conversation. [lib/marketing-examples.ts](lib/marketing-examples.ts) is the single source for their text and styles: Margin notes and Midnight observatory. These clearly labeled illustrative passages ship with the app when deployed; they need no production database or provider share URLs. After changing the fixture, fetch these card routes from the normal local development origin:

| Route | README image |
| --- | --- |
| `/examples/share-your-ai-chats/image` | `docs/readme-assets/example-passage-01.webp` |
| `/examples/share-your-ai-chats-after-dark/image` | `docs/readme-assets/example-passage-02.webp` |

## Verification

Run `pnpm test` for repository checks and `pnpm build` for a production build. PostgreSQL tests require `TEST_DATABASE_URL` pointing to a migrated, disposable database; without it, those suites skip. Tests use mocked or fixture-backed provider/model responses and block external requests.

See [testing guidelines](docs/testing.md) for focused checks, database prerequisites, and separate HTTP/browser/live checks. The [remaining work](docs/MVP_PLAN.md#remaining-work) distinguishes local verification from hosted extraction, recovery, and actual social unfurls.

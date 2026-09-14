# Production and self-hosting

Neon is configured and Vercel serves production at [www.share-ai-passage.com](https://www.share-ai-passage.com). See the [MVP plan](MVP_PLAN.md#remaining-work) for remaining launch checks; this setup record does not establish hosted extraction or social-platform validation.

## Production domain

The production address is [https://www.share-ai-passage.com](https://www.share-ai-passage.com); the apex domain redirects there. On September 13, 2026, anonymous HTTPS checks passed for the homepage, the existing 37-message reader, and its WebP image. GitHub records a successful production deployment and CI run for `468d17c`. These reads establish public serving, not fresh hosted extraction, model generation, or actual social-platform unfurls.

Pre-deployment validation of the September 13 marketing, indexing, and JSON-LD update passed all 493 tests, formatting/lint/type checks, and separate preview and production builds. Local HTTP checks covered 13 page/image routes plus robots.txt in each environment, including canonical/social metadata, script escaping, and unavailable-content isolation; the removal smoke test passed for two synthetic publications in an isolated database. Desktop/mobile review, both updated marketing examples, and eight before/after card pairs passed visual checks. Repeat hosted metadata checks and actual platform unfurls after deployment.

When changing domains, configure the existing Vercel project’s Production domains and the DNS records supplied by its Domains settings, following [Vercel’s domain setup guide](https://vercel.com/docs/domains/working-with-domains/add-a-domain). Verify HTTPS, then redeploy. Confirm that `VERCEL_PROJECT_PRODUCTION_URL` names the intended host and that generated passage links, canonicals, social images, and JSON-LD use it. Keep the automatic origin resolution below; set `PASSAGE_URL` to the verified service origin for CLI use.

## Account email setup

Resend verified `accounts.share-ai-passage.com` on September 14, 2026 in `us-east-1` (North Virginia). Vercel manages DNS. The exact Resend DKIM TXT at `resend._domainkey.accounts`, SPF TXT at `send.accounts`, and return-path MX at `send.accounts` resolve publicly; existing DNS records were preserved. Receiving is disabled and no click/open tracking is configured. Keep tracking disabled for authentication emails.

Separate `Passage development` and `Passage production` API keys have Sending access restricted to this domain. The following values are saved privately in the Vercel project's Development and Production environments and in the main checkout's ignored, owner-only `.env.local` and `.env.prod.local`, respectively. Preview is not configured for email.

| Variable            | Value                                           |
| ------------------- | ----------------------------------------------- |
| `RESEND_API_KEY`    | Separate private key for each environment       |
| `RESEND_FROM_EMAIL` | `Passage <hello@accounts.share-ai-passage.com>` |
| `RESEND_REPLY_TO`   | `passage@transitivebullsh.it`                   |

The sender is a sending identity, not a receiving mailbox. The owner reports creating a Google Workspace group alias for Reply-To that forwards to `travis@transitivebullsh.it`; external delivery has not been tested. Authentication-email integration is still pending: the app does not yet consume these variables or send verification/password-reset emails. Vercel environment changes apply to subsequent deployments.

## Recorded database configuration

| Setting | Value |
| --- | --- |
| Project | [passage / wild-moon-12089892](https://console.neon.tech/app/projects/wild-moon-12089892) |
| Plan / branch | Free / `production` (default) |
| Database / role | `neondb` / `neondb_owner` |
| Region / PostgreSQL | AWS `us-east-2` (Ohio) / 18 |
| Compute / idle behavior | Fixed 0.25 CU; suspends after five idle minutes |
| Recovery history | Six hours, subject to the plan's limits |

Migration state verified September 13, 2026: local development and production are both through `0006_short_vertigo`. This run applied `0006` locally and pending `0005`–`0006` on production. Migration hashes, the source snapshot index, and publication constraints (1–600 title characters, 0–3 highlights) were verified. Saved conversations were not changed; this did not deploy the application. Runtime uses a pooled `DATABASE_URL`; migrations prefer `DIRECT_DATABASE_URL` or `DATABASE_URL_UNPOOLED` when configured. The app's pool is limited to five connections per instance and disables prepared statements for pooler compatibility. Apply subsequent migrations before serving the changed application.

Credentials live in ignored `.env.prod.local` with owner-only file permissions. It contains a separate stable production `APP_SECRET` and the model configuration. Ordinary development and tests do not need this file.

## Local access to production

| Command | Effect |
| --- | --- |
| `pnpm dev:prod` | Development server at `http://localhost:3001` using **real production data** |
| `pnpm build:prod` | Builds into `.next-prod` using production configuration |
| `pnpm start:prod` | Serves that build at `http://localhost:3001` using **real production data** |
| `pnpm db:check:prod` | Checks the pooled connection and table presence without reading conversations |
| `pnpm db:migrate:prod` | Applies pending migrations through the production direct connection |

For a local production build:

```sh
pnpm db:check:prod
pnpm build:prod
pnpm start:prod
```

Stop the server before starting another on port 3001. For another port, pass `--port 3101` to the app commands, using the same port for build and start. Ordinary `pnpm dev` retains the local development database.

The wrapper prints a production-data notice and database host. Creating, publishing, or checking a conversation through this local server changes production data. URLs use localhost here and the hosted origin when the same records are served from Vercel; publications store IDs and content, not a permanent hostname.

The wrapper clears hosted-origin inputs, disables forwarded-header trust, and separates `.next-prod` from ordinary build output. Explicit production values take precedence even if Next lists `.env.local` in its startup banner. `.env.prod.local` is not automatically loaded by Next.

On another machine, copy [.env.prod.example](../.env.prod.example) to `.env.prod.local`, use matching pooled/direct URLs, and preserve the production `APP_SECRET`. Values are literal; shell-style variable references are not expanded. Keep the file private and out of Git. Production URLs never belong in `TEST_DATABASE_URL`; the production wrapper refuses CI/test environments.

## Hosting configuration

Use Node 24, a frozen-lockfile pnpm installation, `pnpm build`, and the [example environment](../.env.example). New preview generation requires `OPENAI_API_KEY`; `AI_PROVIDER` currently supports `openai`, with `AI_MODEL` selecting the model. `APP_SECRET` must be stable and at least 32 characters; rotating it expires prepared drafts, while published links remain valid.

Keep database and function regions together. Use separate data for preview deployments unless deliberately testing production. Reader and image routes must be anonymously accessible over HTTPS for social crawlers.

[Origin resolution](../lib/config.ts) is automatic:

- Development prefers `PORTLESS_URL`.
- Outside development, `VERCEL=1` selects an HTTPS hostname. Production prefers `VERCEL_PROJECT_PRODUCTION_URL`; Preview/custom environments prefer `VERCEL_BRANCH_URL`. Both fall back to `VERCEL_URL`. `VERCEL_TARGET_ENV` takes precedence over `VERCEL_ENV`.
- Other runs use `http://localhost:${PORT || 3000}`. `APP_URL` is not read.

Keep Vercel's system environment variables enabled. Redeploy after changing the production domain. Mutation origin validation compares the submitted origin to the actual request host, so alternate deployment URLs can accept their own same-origin requests.

Indexing is enabled only when `NODE_ENV=production`, `VERCEL=1`, and the selected Vercel target is exactly `production`. `VERCEL_TARGET_ENV` overrides `VERCEL_ENV`; preview, custom/staging, missing/unknown, and local environments default to `noindex`. Available public pages and social images may index on production. Draft/API, missing, and disabled content remain `noindex`; images and saved readers retain `no-store` for removal behavior. The global response header blocks indexing on nonproduction builds, while page metadata handles unavailable readers on production. Keep robots.txt crawl access open so crawlers can see these directives.

[Client-address trust](../lib/http.ts) depends on the actual proxy:

- An unset `TRUST_PROXY` uses Vercel's overwritten `x-vercel-forwarded-for` header when `VERCEL=1`; elsewhere it shares a conservative client budget.
- `none` explicitly uses that shared budget on any host. `vercel` requires `VERCEL=1` and the Vercel header.
- `single` trusts `X-Real-IP` only behind a proxy that overwrites it with the connecting address. For Nginx, use `proxy_set_header X-Real-IP $remote_addr;` and prevent direct public access to the app port.

Self-hosting runs the same app with `pnpm build` and `pnpm start`, or the [Docker setup](../contributing.md#docker-alternative). Public proxy hostnames are not inferred from forwarded headers; the current non-Vercel production fallback remains localhost. Arbitrary self-hosted public-origin configuration is a known limitation.

The Dockerfile migrates before single-instance startup. Multi-instance deployments should migrate in a separate release step. Card rendering uses Takumi's native Node.js backend for WebP output at quality 90. [next.config.ts](../next.config.ts) externalizes `@takumi-rs/core` and traces the bundled fonts and artwork. Standalone packaging must include those assets, public/static files, and Takumi's native binary for the deployment platform. Verify a card request from the production build after changing renderer dependencies.

## Recovery

An independent backup and verified restore remain launch work. Logical dumps of this PostgreSQL 18 server require `pg_dump` 18 or newer. The last setup record did not establish a scheduled backup or off-site restore; verify actual recovery settings before relying on them.

The [September 11 hosting comparison](research/POSTGRES_HOSTING.md) records the rationale for Neon Free. Recheck provider limits and pricing when making a hosting decision; that comparison is historical research.

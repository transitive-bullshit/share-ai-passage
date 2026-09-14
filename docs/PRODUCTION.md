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

The sender is a sending identity, not a receiving mailbox. The owner reports creating a Google Workspace group alias for Reply-To that forwards to `travis@transitivebullsh.it`; external delivery has not been tested. The accounts implementation consumes these variables for verification/password-reset emails. Development configuration is integrated in the isolated accounts review; actual delivery and the verification/reset roundtrip remain to be checked. Accounts are not yet deployed. Vercel environment changes apply to subsequent deployments.

## GitHub sign-in setup

On September 14, 2026, two OAuth apps were registered under `transitive-bullshit`:

| Environment | OAuth app | Homepage | Exact callback |
| --- | --- | --- | --- |
| Production | [Passage](https://github.com/settings/applications/3857651) | `https://www.share-ai-passage.com` | `https://www.share-ai-passage.com/api/auth/callback/github` |
| Development | [Passage Development](https://github.com/settings/applications/3857667) | `http://share-ai-passage.localhost:1355` | `http://share-ai-passage.localhost:1355/api/auth/callback/github` |

Each app has a separate client ID and secret, saved as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the main checkout's ignored, owner-only `.env.prod.local` and `.env.local`, respectively. These credentials have not been added to Vercel. Both apps disable wildcard callback matching and device flow. Logo upload remains pending.

Development keeps Portless enabled with `pnpm dev`. On September 14, the actual startup output reported `http://share-ai-passage.localhost:1355`; GitHub accepted this exact origin and callback, replacing the initial direct-localhost registration. Portless keeps this public hostname stable while assigning an ephemeral backend port. Worktrees receive separate hostnames. If the proxy scheme/port changes or a worktree needs sign-in, register its exact callback in the development OAuth app. Do not infer the origin from Portless defaults. Google's client form rejects this `.localhost` subdomain for both JavaScript origins and redirect URIs because it requires a public top-level/private domain. GitHub accepts it. The accounts review now uses the compatible owned-domain HTTPS origin documented below; the main checkout keeps its existing Portless route.

The accounts implementation includes Better Auth, account persistence, sign-in UI, and `/api/auth/callback/github`. The isolated review reaches GitHub consent with read-only profile/email access and its exact registered callback; the completed consent/callback/session roundtrip still awaits user authorization. Keep requests limited to basic identity and `user:email`, with no repository scopes, and match Better Auth's base URL to the selected origin. See [Better Auth's GitHub setup](https://better-auth.com/docs/authentication/github). OAuth app registration itself does not enforce the scopes requested by the application.

## Google sign-in setup

On September 14, 2026, [Passage / share-ai-passage-production](https://console.cloud.google.com/auth/overview?authuser=1&project=share-ai-passage-production) was created under the `transitivebullsh.it` organization using `travis@transitivebullsh.it`. The earlier empty `share-ai-passage-prod` project under the Gmail account is unused. `Agentic Test` was not modified.

The production project has an External audience, Passage name and PNG logo, `passage@transitivebullsh.it` as support and developer contact, authorized domain `share-ai-passage.com`, and homepage `https://www.share-ai-passage.com`. Only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile` are configured; no sensitive or restricted scopes were added.

The Web application client `Passage production` has JavaScript origin `https://www.share-ai-passage.com` and exact redirect URI `https://www.share-ai-passage.com/api/auth/callback/google`. Its client ID and secret are saved as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the main checkout's ignored, owner-only `.env.prod.local`. Both were also saved and verified as Production-only Secret environment variables in [Vercel's saasify/share-ai-passage project](https://vercel.com/saasify/share-ai-passage/settings/environment-variables) on September 14, 2026. They are not configured for Preview or Development. Vercel applies them to the next production deployment; this configuration change did not redeploy the app. Production credentials must not be reused for development; the separate development client is recorded below.

The project remains in Testing with no test users added. Google currently disables Publish app until branding configuration is complete. Public launch still needs an accurate public privacy policy and applicable terms, production publishing/branding verification and domain-ownership checks. These pages are not implemented yet. Better Auth integration is implemented in the accounts branch; production sign-in and public-launch readiness remain unverified. The API Services User Data Policy agreement was accepted with the owner's explicit approval.

### Google development with Portless

The separate [Passage Development / share-ai-passage-development](https://console.cloud.google.com/auth/overview?authuser=1&project=share-ai-passage-development) project now contains the Web application client `Passage development`. It has an External audience in Testing and uses `passage@transitivebullsh.it` for support/contact. The API Services User Data Policy was accepted with explicit approval for this development project.

Google accepted JavaScript origin `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443` and exact callback `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443/api/auth/callback/google`. The development client ID/secret are stored privately in the main checkout's owner-only `.env.local` and the isolated review configuration; no production credentials were reused. These development credentials have not been added to Vercel. The review app recognizes Google, and the real flow reaches consent for name, profile picture and email. On September 15, `travis@transitivebullsh.it` was added with explicit approval and verified in the test-user list. The development project remains in Testing. The owner completed Google consent, and the full development callback/session roundtrip passed: My passages loaded, Account showed the expected verified email and Google connected, and the session survived refresh. A read-only local database check confirmed the nonanonymous account, Google link and active session.

The exact Vercel A record `share-ai-passage-accounts-afc0.local` points to `127.0.0.1` with TTL 60. A separate Portless HTTPS proxy on 8443 routes to backend 3107 with normal certificate verification passing. Next.js allows only its configured Portless hostname for development resources; unrelated origins remain blocked. See the [local HTTPS setup](../contributing.md#google-sign-in-with-local-https) for restart instructions. Google's `.localhost` restriction is addressed by this owned-domain setup; it applies equally to Better Auth and Auth.js.

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

The wrapper clears hosted-origin inputs, disables forwarded-header trust, and separates `.next-prod` from ordinary build output. Database, model, Better Auth, OAuth and email settings come only from the explicit production file; missing optional account settings are blanked so Next cannot fill them from development files. This includes the legacy `EMAIL_FROM`/`EMAIL_REPLY_TO` aliases. Explicit production values take precedence even if Next lists `.env.local` in its startup banner. `.env.prod.local` is not automatically loaded by Next. The auth origin remains `http://localhost:<selected port>` for these commands. Omit `BETTER_AUTH_URL` or set that same origin; a conflicting hosted/development origin is rejected. A local OAuth roundtrip still requires its exact local callback to be registered. Use the isolated accounts review for ordinary authentication development.

On another machine, copy [.env.prod.example](../.env.prod.example) to `.env.prod.local`, use matching pooled/direct URLs, and preserve the production `APP_SECRET`. Write complete credential values directly; do not use shell-style variable references. Keep the file private and out of Git. Production URLs never belong in `TEST_DATABASE_URL`; the production wrapper refuses CI/test environments.

## Hosting configuration

Use Node 24, a frozen-lockfile pnpm installation, `pnpm build`, and the [example environment](../.env.example). New preview generation requires `OPENAI_API_KEY`; `AI_PROVIDER` currently supports `openai`, with metered calls restricted to the supported default `gpt-5.4-nano` cost bound. `APP_SECRET` must be stable and at least 32 characters; rotating it expires prepared drafts, while published links remain valid.

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

## Accounts release readiness

The accounts changes are local and not yet deployed. Apply the complete pending migration batch to an isolated preview database, verify auth callbacks and email delivery there, and complete the [accounts feedback gate](ACCOUNTS_PAID_FEATURES_PLAN.md#gate-a--stop-for-accounts-feedback) before any paid implementation. Configure standard Better Auth, Google/GitHub and Resend values from the [setup checklist](THIRD_PARTY_SETUP.md). Account pages and APIs remain private/no-store or noindex as applicable; public readers and cards remain anonymously accessible.

Local accounts review uses `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443`, with exact `/api/auth/callback/google` and `/api/auth/callback/github` URLs registered in the separate development apps. The main checkout retains `http://share-ai-passage.localhost:1355` and its existing GitHub callback; the earlier HTTP worktree callback also remains registered. All three GitHub callbacks have wildcard matching disabled. The HTTPS worktree route maps to isolated backend 3107; use its configured hostname for auth rather than the backend address. The live Google development callback/session check passes. GitHub consent/session and hosted preview checks remain open.

Use a stable auth secret and exact callback origin. Keep preview and production identities, databases and email configuration separate. OAuth and email configuration checks report presence, not proof of successful delivery or valid provider credentials. Do not enable paid services as part of the accounts deployment.

Summary operations persist before dispatch and settle their original usage periods. Monitor `generation_operations` for old `reserved`, `running` or `uncertain` rows and unknown costs. Never reset a reservation or resubmit a provider request merely because its HTTP response was lost. Recover completed saved results through the owned draft APIs; unresolved provider outcomes require authoritative usage/outcome evidence before settlement. Use `DATABASE_URL=<explicit target> pnpm reconcile:summary list-stale` or `status <operation UUID>` to inspect safe status/cost projections. Repair commands are `succeed`, `fail`, or `cost` followed by the operation UUID, `--evidence /private/evidence.json`, and `--apply`. Evidence binds `action`, `operationId`, an `evidence` note and `actualCostMicros`; success also needs a validated `preview`, while failure permits unknown/null cost. Keep evidence private. The command loads no environment files and never makes a provider call; an elapsed timeout is not outcome evidence. The underlying quota operations settle only the original period and are idempotent. Logs omit private content and retain bounded provider diagnostics and operation identity.

## Recovery

An independent backup and verified restore remain launch work. Logical dumps of this PostgreSQL 18 server require `pg_dump` 18 or newer. The last setup record did not establish a scheduled backup or off-site restore; verify actual recovery settings before relying on them.

The [September 11 hosting comparison](research/POSTGRES_HOSTING.md) records the rationale for Neon Free. Recheck provider limits and pricing when making a hosting decision; that comparison is historical research.

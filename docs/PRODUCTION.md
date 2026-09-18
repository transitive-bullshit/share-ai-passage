# Production and self-hosting

Neon is configured and Vercel serves production at [www.share-ai-passage.com](https://www.share-ai-passage.com). See the [MVP plan](MVP_PLAN.md#remaining-work) for remaining launch checks; this setup record does not establish hosted extraction or social-platform validation.

## Accounts production preparation — September 17

The owner authorized production preparation before merging the accounts PR. Reuse existing Vercel, Neon, Resend, R2, Google/GitHub and Stripe accounts; Better Auth and Vercel Workflow need no additional hosted vendor or account. Keep the existing `APP_SECRET` and automatic production origin. Local production configuration is the main checkout's ignored, owner-only `.env.prod.local`; do not create an unignored `.env.production`. Vercel Production settings take effect on the next deployment.

Completed preparation:

- Added Production `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `CRON_SECRET`, `SUMMARY_AI_MONTHLY_BUDGET_USD=25` and `STRIPE_LIVE_CHECKOUT_ENABLED=false`. Existing Google, Resend, database, OpenAI and R2 settings remain configured. Preview keeps its separate database, sandbox Stripe, $1 summary budget and Vercel authentication. Existing environment records, secrets and protection were preserved.
- Created live `Passage Plus` and `Passage Pro` products in the existing Agentic account with four USD prices: $10/$25 monthly and $96/$240 annually. Their four ordinary price-ID variables are saved in Vercel Production and the private main `.env.prod.local`; existing environment records and other products are preserved. No subscription or live payment was created. Evidence: `work/production-launch/live-catalog-evidence.json`.
- Made a consistent PostgreSQL 18 production logical backup, verified an independent local restore including schema/data/migration hashes, and rehearsed all pending migrations against the restored copy. Applied ten migrations, `0007` through `0016`, to production `neondb`; all 17 ledger hashes match the repository, and existing public-table data and the legacy publication conflict key are unchanged. The disposable restore was removed and its server stopped. Owner-only evidence and the verified backup remain under ignored `work/production-launch/`; this is not scheduled/off-site recovery.
- Production Resend accepted a synthetic message to its official delivery test sink; replay returned the same receipt. No real user email was sent. Existing production homepage, reader and WebP still return 200 after migration. Both R2 buckets are accessible and private-bucket upload CORS includes the exact production origin. The production delivery domain remains `https://passage.cultural-alignment.com`.
- Added a static public `/privacy` page and homepage/footer link in the PR for review before deployment. It describes current processing, providers, publication and deletion behavior. [Google requires a homepage privacy link; terms are optional](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance#host-a-home-page-for-production-apps).

September 18 follow-up: after explicit approval and the owner's Stripe identity verification, created the standard full-access `Passage Production` live key. API reads verified the existing account can accept charges and payouts, with no currently due onboarding requirements, and all four catalog prices match. Completed the separate checked-upgrade Portal and prepared disabled live webhook `we_1UGs2sFRpaq9IkEXYCIdyRYF`. Saved `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID` privately in Vercel Production and the main `.env.prod.local`; Preview configuration, other webhooks and Agentic's default Portal are preserved. No live subscription/payment was created. Evidence: `work/production-launch/live-stripe-runtime-evidence.json`.

Google console access is restored: saved the production `/privacy` policy URL and published the External audience to **In production**. Its automated branding checks identified domain ownership and policy-content issues. Added Google's exact root TXT to Vercel without editing existing DNS records; Search Console confirmed domain ownership for `travis@transitivebullsh.it`. Google confirms that data-access verification is unnecessary for the existing identity-only scopes. Re-run branding checks after the policy page and its homepage link become publicly available with the accounts deployment.

The accounts application has not been merged or deployed to production. After Gate B and merge, verify production sign-in, signup email, preparation Workflow and published reader/card access. Once the webhook handler is deployed, enable the prepared live endpoint and verify signed delivery before explicitly enabling live Checkout. Keep other Agentic products and account-wide branding/Portal settings intact. Native Vercel cron schedules activate on the production application deployment; the configured secret authorizes daily asset cleanup and hourly subscription-email retries.

## Production domain

The production address is [https://www.share-ai-passage.com](https://www.share-ai-passage.com); the apex domain redirects there. On September 13, 2026, anonymous HTTPS checks passed for the homepage, the existing 37-message reader, and its WebP image. GitHub records a successful production deployment and CI run for `468d17c`. These reads establish public serving, not fresh hosted extraction, model generation, or actual social-platform unfurls.

Pre-deployment validation of the September 13 marketing, indexing, and JSON-LD update passed all 493 tests, formatting/lint/type checks, and separate preview and production builds. Local HTTP checks covered 13 page/image routes plus robots.txt in each environment, including canonical/social metadata, script escaping, and unavailable-content isolation; the removal smoke test passed for two synthetic publications in an isolated database. Desktop/mobile review, both updated marketing examples, and eight before/after card pairs passed visual checks. Repeat hosted metadata checks and actual platform unfurls after deployment.

When changing domains, configure the existing Vercel project’s Production domains and the DNS records supplied by its Domains settings, following [Vercel’s domain setup guide](https://vercel.com/docs/domains/working-with-domains/add-a-domain). Verify HTTPS, then redeploy. Confirm that `VERCEL_PROJECT_PRODUCTION_URL` names the intended host and that generated passage links, canonicals, social images, and JSON-LD use it. Keep the automatic origin resolution below; set `PASSAGE_URL` to the verified service origin for CLI use.

## Account email setup

Resend verified `accounts.share-ai-passage.com` on September 14, 2026 in `us-east-1` (North Virginia). Vercel manages DNS. The exact Resend DKIM TXT at `resend._domainkey.accounts`, SPF TXT at `send.accounts`, and return-path MX at `send.accounts` resolve publicly; existing DNS records were preserved. Receiving is disabled and no click/open tracking is configured. Keep tracking disabled for authentication emails.

Separate `Passage development` and `Passage production` API keys have Sending access restricted to this domain. Development and shared Vercel Preview reuse the development key; Production retains its separate key. Values are saved privately in Vercel and the main checkout’s owner-only `.env.local` / `.env.prod.local`. Preview configuration and existing-account password email delivery are verified. September 17 production-key acceptance passed using Resend's official delivery test sink; fresh production-user signup delivery awaits application deployment.

| Variable            | Value                                            |
| ------------------- | ------------------------------------------------ |
| `RESEND_API_KEY`    | Development/Preview key; separate production key |
| `RESEND_FROM_EMAIL` | `Passage <hello@accounts.share-ai-passage.com>`  |
| `RESEND_REPLY_TO`   | `passage@transitivebullsh.it`                    |

The sender is a sending identity, not a receiving mailbox. The owner reports creating a Google Workspace group alias for Reply-To that forwards to `travis@transitivebullsh.it`; external delivery has not been tested. The accounts implementation consumes these variables for verification/password-reset emails. Development configuration is integrated in the isolated accounts review. On September 15, the owner completed a delivered password reset, and subsequent email/password sign-in returned to the same account with Google and GitHub still linked. Fresh signup verification delivery remains untested live; fixture tests cover that flow. Accounts are deployed to shared Preview. The owner also completed hosted password setup and signed in with the updated password; a subsequent browser reload showed all three methods connected. Fresh signup verification and external Reply-To delivery remain untested live. Vercel environment changes apply to subsequent deployments.

### Subscription emails

Passage also uses the existing Resend sender for subscription activation, effective plan/billing-cycle changes, scheduled cancellation/downgrade and their removal, payment failure/recovery, and return to Free. Notifications include catalog pricing and link to the environment's `/account/billing`; Stripe invoices establish taxes and prorated totals. Signed Stripe reconciliation and manual billing refresh share the same payment-confirmed notification state, so a refresh before webhook delivery cannot lose or duplicate the confirmation. Unpaid price changes and routine renewals do not announce new paid access. Existing unchanged subscriptions are not retroactively emailed.

Migration `0016_subscription_emails.sql` adds the private `billing_emails` outbox and billing notification snapshot. Queue insertion and billing state commit together. Delivery is awaited after commit with a 10-second provider timeout; failures leave paid access intact and retain the same email payload, sender and Resend idempotency key. Overlapping workers use row leases and keep changes ordered per account. Account closure deletes the outbox; changed/unverified recipients are suppressed before delivery.

`GET /api/cron/billing-emails` retries one bounded batch hourly using the existing exact Bearer `CRON_SECRET`. Responses contain private/no-store aggregate counts only; delivery failures and notifications needing review return 503. Vercel activates cron only in Production, so invoke the protected route explicitly during Preview QA. With explicit target `DATABASE_URL`, `pnpm reconcile:billing pending-emails` lists pending/review IDs without message content, and `pnpm reconcile:billing retry-emails --apply` retries up to ten due notifications using the existing Resend variables. No environment files are loaded by these commands.

[Resend idempotency keys expire after 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Uncertain deliveries stop automatic retries after 23 hours and remain `needs_review`; check the provider receipt before deciding whether to mark the row sent or start a new send. Do not blindly reset its first-attempt time, which could duplicate an already accepted email. No new credentials or Stripe email settings are required. Stripe's invoice/receipt and recovery emails remain separately configurable in Stripe; Passage sends subscription-state confirmations rather than payment receipts.

## GitHub sign-in setup

On September 14, 2026, two OAuth apps were registered under `transitive-bullshit`:

| Environment | OAuth app | Homepage | Exact callback |
| --- | --- | --- | --- |
| Production | [Passage](https://github.com/settings/applications/3857651) | `https://www.share-ai-passage.com` | `https://www.share-ai-passage.com/api/auth/callback/github` |
| Development | [Passage Development](https://github.com/settings/applications/3857667) | `http://share-ai-passage.localhost:1355` | `http://share-ai-passage.localhost:1355/api/auth/callback/github` |

Each app has a separate client ID and secret, saved as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the main checkout's ignored, owner-only `.env.prod.local` and `.env.local`, respectively. The development pair is now also saved in shared Vercel Preview. Its exact stable callback is `https://share-ai-passage-git-codex-accounts-first-launch-saasify.vercel.app/api/auth/callback/github`; hosted sign-in is verified in the account review. Both apps disable wildcard callback matching and device flow. Logo upload remains pending.

The September 15 check found only Preview GitHub entries. On September 17, the saved production GitHub credential pair was added to Vercel Production while preserving Preview and the separate production/development apps. Both Google variables already have separate Production and Preview entries. Credential values were not exposed; hosted production callbacks await the accounts deployment.

Development keeps Portless enabled with `pnpm dev`. On September 14, the actual startup output reported `http://share-ai-passage.localhost:1355`; GitHub accepted this exact origin and callback, replacing the initial direct-localhost registration. Portless keeps this public hostname stable while assigning an ephemeral backend port. Worktrees receive separate hostnames. If the proxy scheme/port changes or a worktree needs sign-in, register its exact callback in the development OAuth app. Do not infer the origin from Portless defaults. Google's client form rejects this `.localhost` subdomain for both JavaScript origins and redirect URIs because it requires a public top-level/private domain. GitHub accepts it. The accounts review now uses the compatible owned-domain HTTPS origin documented below; the main checkout keeps its existing Portless route.

The accounts implementation includes Better Auth, account persistence, sign-in UI, and `/api/auth/callback/github`. On September 15, the owner completed GitHub consent with read-only profile/email access on the isolated HTTPS review. Google and GitHub are linked to the same verified account; a subsequent sign-out and GitHub sign-in completed successfully. Keep requests limited to basic identity and `user:email`, with no repository scopes, and match Better Auth's base URL to the selected origin. See [Better Auth's GitHub setup](https://better-auth.com/docs/authentication/github). OAuth app registration itself does not enforce the scopes requested by the application.

## Google sign-in setup

On September 14, 2026, [Passage / share-ai-passage-production](https://console.cloud.google.com/auth/overview?authuser=1&project=share-ai-passage-production) was created under the `transitivebullsh.it` organization using `travis@transitivebullsh.it`. The earlier empty `share-ai-passage-prod` project under the Gmail account is unused. `Agentic Test` was not modified.

The production project has an External audience, Passage name and PNG logo, `passage@transitivebullsh.it` as support and developer contact, authorized domain `share-ai-passage.com`, and homepage `https://www.share-ai-passage.com`. Only `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/userinfo.profile` are configured; no sensitive or restricted scopes were added.

The Web application client `Passage production` has JavaScript origin `https://www.share-ai-passage.com` and exact redirect URI `https://www.share-ai-passage.com/api/auth/callback/google`. Its client ID and secret are saved as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the main checkout's ignored, owner-only `.env.prod.local`. Both were also saved and verified as Production-only Secret environment variables in [Vercel's saasify/share-ai-passage project](https://vercel.com/saasify/share-ai-passage/settings/environment-variables) on September 14, 2026. They are not configured for Preview or Development. Vercel applies them to the next production deployment; this configuration change did not redeploy the app. Production credentials must not be reused for development; the separate development client is recorded below.

On September 18, after the owner completed passkey sign-in, the production console accepted and saved privacy URL `https://www.share-ai-passage.com/privacy`; the existing name, logo, support/contact, homepage and authorized domain were preserved. Published the External audience and verified **In production** on Audience. Verification Center confirms that data-access verification is not required because no sensitive or restricted scopes are requested. Automated branding checks reported unregistered homepage ownership and insufficient policy content. The exact Google ownership TXT was added to the root in Vercel, preserving existing DNS settings, and Search Console confirmed ownership of `share-ai-passage.com` for `travis@transitivebullsh.it`. Keep that verification TXT. The PR implements `/privacy` and its homepage/footer link, but these are not publicly deployed yet; re-run branding verification after merge. The name/logo remain unverified. Open the [production client list](https://console.cloud.google.com/auth/clients?authuser=1&project=share-ai-passage-production) in the organization account. Production callback behavior remains unverified until application deployment. The API Services User Data Policy agreement was already accepted with the owner's explicit approval.

### Google development with Portless

The separate [Passage Development / share-ai-passage-development](https://console.cloud.google.com/auth/overview?authuser=1&project=share-ai-passage-development) project now contains the Web application client `Passage development`. It has an External audience in Testing and uses `passage@transitivebullsh.it` for support/contact. The API Services User Data Policy was accepted with explicit approval for this development project.

Google accepted JavaScript origin `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443` and exact callback `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443/api/auth/callback/google`. The development client ID/secret are stored privately in the main checkout's owner-only `.env.local` and the isolated review configuration; no production credentials were reused. Shared Vercel Preview now reuses these development credentials. After the owner completed Google Cloud passkey authentication, its stable Preview origin and exact `/api/auth/callback/google` URI were saved while preserving the local HTTPS entries. The hosted connection flow linked Google to the existing Preview account; a fresh sign-out/Google sign-in and full-page reload then passed with Google and GitHub both connected. This OAuth check used the owner’s existing Vercel session. Subsequent public Preview access and existing-account password setup/sign-in checks are recorded below. Evidence: `work/phase2/hosted-readiness/google-oauth-evidence.json`. The review app recognizes Google, and the real flow reaches consent for name, profile picture and email. On September 15, `travis@transitivebullsh.it` was added with explicit approval and verified in the test-user list. The development project remains in Testing. The owner completed Google consent, and the full development callback/session roundtrip passed: My passages loaded, Account showed the expected verified email and Google connected, and the session survived refresh. A read-only local database check confirmed the nonanonymous account, Google link and active session.

The exact Vercel A record `share-ai-passage-accounts-afc0.local` points to `127.0.0.1` with TTL 60. A separate Portless HTTPS proxy on 8443 routes to backend 3107 with normal certificate verification passing. Next.js allows only its configured Portless hostname for development resources; unrelated origins remain blocked. See the [local HTTPS setup](../contributing.md#google-sign-in-with-local-https) for restart instructions. Google's `.localhost` restriction is addressed by this owned-domain setup; it applies equally to Better Auth and Auth.js.

### Development AI access

On September 15, the owner explicitly approved using the existing normal `OPENAI_API_KEY` for development. It is configured privately in the main checkout's `.env.local` and the isolated accounts review; other production database/auth/provider credentials remain separate. A live uncached summary succeeded with one settled generation and a recorded cost of $0.000452. The draft survived reload and remained private in My passages. This approval applies to the OpenAI key only. The separately accepted $20 image benchmark began after Gate A; its completed selected-model qualification, accepted spending policy and remaining hosted cost evidence are recorded in the [economics report](research/PHASE2_MEASURED_ECONOMICS.md).

## Recorded database configuration

| Setting | Value |
| --- | --- |
| Project | [passage / wild-moon-12089892](https://console.neon.tech/app/projects/wild-moon-12089892) |
| Plan / branch | Free / `production` (default) |
| Database / role | `neondb` / `neondb_owner` |
| Region / PostgreSQL | AWS `us-east-2` (Ohio) / 18 |
| Compute / idle behavior | Fixed 0.25 CU; suspends after five idle minutes |
| Recovery history | Six hours, subject to the plan's limits |

September 13 local development and production were through `0006_short_vertigo`. On September 17, production advanced through `0016_subscription_emails` after the verified backup/restore and rehearsal recorded above. All 17 migration hashes, source snapshot index and legacy publication conflict key were verified; saved conversations and existing publications were unchanged. Titles now have advisory length recommendations, with 0–3 highlights; historical title length constraints were removed. This did not deploy the accounts application. Runtime uses a pooled `DATABASE_URL`; migrations prefer `DIRECT_DATABASE_URL` or `DATABASE_URL_UNPOOLED` when configured. The app's pool is limited to five connections per instance and disables prepared statements for pooler compatibility. Apply subsequent migrations before serving the changed application.

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

The wrapper clears hosted-origin inputs, disables forwarded-header trust, and separates `.next-prod` from ordinary build output. Database, model, Better Auth, OAuth, email, Stripe and R2 settings come only from the explicit production file; missing optional account settings are blanked so Next cannot fill them from development files. Storage variables in either naming scheme also come only from the explicit production file; missing values stay empty to prevent development credential or alias fallback. This includes the legacy `EMAIL_FROM`/`EMAIL_REPLY_TO` aliases. Explicit production values take precedence even if Next lists `.env.local` in its startup banner. `.env.prod.local` is not automatically loaded by Next. The auth origin remains `http://localhost:<selected port>` for these commands. Omit `BETTER_AUTH_URL` or set that same origin; a conflicting hosted/development origin is rejected. A local OAuth roundtrip still requires its exact local callback to be registered. Use the isolated accounts review for ordinary authentication development.

On another machine, copy [.env.prod.example](../.env.prod.example) to `.env.prod.local`, use matching pooled/direct URLs, and preserve the production `APP_SECRET`. Write complete credential values directly; do not use shell-style variable references. Keep the file private and out of Git. Production URLs never belong in `TEST_DATABASE_URL`; the production wrapper refuses CI/test environments.

## Hosting configuration

### Conversation image storage

Imported conversation images use the R2 module shared with the account-assets implementation. Configure `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_API_ENDPOINT`, `S3_BUCKET_NAME`, `S3_PRIVATE_BUCKET_NAME` and `S3_PUBLIC_URL` per environment. The equivalent `R2_*` variables take precedence; the account ID is inferred from the R2 endpoint unless explicitly supplied. Use separate public/private buckets and credentials scoped to both. Keep public access disabled on the private bucket. Imported images live under `assets/conversations/` in that bucket and are served through publication-bound media routes; account ownership/paid access is not required for conversation capture.

Text-only imports work without R2. A readable image that cannot be stored causes preparation to fail for retry. Ensure storage is configured before deploying image capture. Captured images remain part of the immutable snapshot and are not subject to account upload cleanup.

On September 17, 2026, the public `passage` bucket's custom delivery origin was verified as `https://passage.cultural-alignment.com`. Next.js allows this exact HTTPS host for remote images, with no custom port or query string. The existing `passage-private` bucket holds imported conversation images. This bucket pair is shared with Development/Preview; no new buckets were created.

The following settings are saved as Production-only sensitive variables in [Vercel's saasify/share-ai-passage project](https://vercel.com/saasify/share-ai-passage/settings/environment-variables) and the ignored, owner-only `.env.prod.local`. The owner explicitly approved copying the existing R2 credential pair into both destinations. Existing Preview entries and other settings were preserved.

| Variable | Production value |
| --- | --- |
| `S3_ACCESS_KEY_ID` | Existing approved R2 access key, stored privately |
| `S3_SECRET_ACCESS_KEY` | Existing approved R2 secret, stored privately |
| `S3_API_ENDPOINT` | Existing Cloudflare account's US-jurisdiction R2 endpoint |
| `S3_BUCKET_NAME` | `passage` |
| `S3_PRIVATE_BUCKET_NAME` | `passage-private` |
| `S3_PUBLIC_URL` | `https://passage.cultural-alignment.com` |

Real R2 checks passed signed writes/readback in both buckets, byte-for-byte custom-domain delivery, public GET CORS, and private upload preflight from `https://www.share-ai-passage.com`. Anonymous S3 API access was rejected with HTTP 400 `InvalidArgument`. Both buckets have only the default incomplete-multipart abort lifecycle rule; imported images have no expiration rule. All temporary fixture objects were deleted.

A separate application check used the production command wrapper's environment and the configured production credentials. The R2 module passed immutable public/private writes and bounded readback, and its generated public URL served identical bytes through the custom domain. The exact reported Codex source captured its one 1,254 × 1,254 generated image; its 2,247,776 normalized WebP bytes were read back and verified by SHA-256. No production database records were read or changed. Local reader rendering and publication-bound media serving were verified separately against a disposable database during implementation.

Configuration is ready for the next deployment. No deployment was triggered; [Vercel environment changes apply to subsequent deployments](https://vercel.com/docs/environment-variables). After deployment, verify a fresh hosted image import and reimport older text-only snapshots when images are wanted; existing publications retain their immutable saved snapshots.

### Application runtime

Use Node 24, a frozen-lockfile pnpm installation, `pnpm build`, and the [example environment](../.env.example). New preview generation requires `OPENAI_API_KEY`; `AI_PROVIDER` currently supports `openai`, with metered calls restricted to the supported default `gpt-5.4-nano` cost bound. `APP_SECRET` must be stable and at least 32 characters; rotating it expires prepared drafts, while published links remain valid.

Keep database and function regions together. Use separate data for preview deployments unless deliberately testing production. Reader and image routes must be anonymously accessible over HTTPS for social crawlers.

[Origin resolution](../lib/config.ts) is automatic:

- Development prefers `PORTLESS_URL`.
- Outside development, `VERCEL=1` selects an HTTPS hostname. Production prefers `VERCEL_PROJECT_PRODUCTION_URL`; Preview/custom environments prefer `VERCEL_BRANCH_URL`. Both fall back to `VERCEL_URL`. `VERCEL_TARGET_ENV` takes precedence over `VERCEL_ENV`.
- Other runs use `http://localhost:${PORT || 3000}`. `APP_URL` is not read.

Keep Vercel's system environment variables enabled. Redeploy after changing the production domain. Mutation origin validation compares the submitted origin to the actual request host, so alternate deployment URLs can accept their own same-origin requests.

Indexing is enabled only when `NODE_ENV=production`, `VERCEL=1`, and the selected Vercel target is exactly `production`. `VERCEL_TARGET_ENV` overrides `VERCEL_ENV`; preview, custom/staging, missing/unknown, and local environments default to `noindex`. Available public pages and social images may index on production. Published readers and cards are generated on demand with seven-day reader and 30-day card ISR lifetimes, and regenerated lazily; cache hits avoid the database and renderer. Public card responses make browsers revalidate, allow downstream CDNs to cache for one day with seven days of stale-while-revalidate, and allow Vercel to cache publication cards for 30 days. Deployment-owned marketing example cards use a one-year Vercel TTL because deployments purge that cache. Draft/API and missing responses remain `no-store`; disabled content remains `noindex` but its generic card is cacheable. Confirmed removal updates storage immediately but may remain visible in an existing public or external-platform cache until revalidation. The global response header blocks indexing on nonproduction builds, while page metadata handles unavailable readers on production. Keep robots.txt crawl access open so crawlers can see these directives.

See [ADR 0001](./adr/0001-cache-publications-with-tiered-image-delivery.md) for the decision and accepted consistency tradeoff.

[Client-address trust](../lib/http.ts) depends on the actual proxy:

- An unset `TRUST_PROXY` uses Vercel's overwritten `x-vercel-forwarded-for` header when `VERCEL=1`; elsewhere it shares a conservative client budget.
- `none` explicitly uses that shared budget on any host. `vercel` requires `VERCEL=1` and the Vercel header.
- `single` trusts `X-Real-IP` only behind a proxy that overwrites it with the connecting address. For Nginx, use `proxy_set_header X-Real-IP $remote_addr;` and prevent direct public access to the app port.

Self-hosting runs the same app with `pnpm build` and `pnpm start`, or the [Docker setup](../contributing.md#docker-alternative). Public proxy hostnames are not inferred from forwarded headers; the current non-Vercel production fallback remains localhost. Arbitrary self-hosted public-origin configuration is a known limitation.

The Dockerfile migrates before single-instance startup. Multi-instance deployments should migrate in a separate release step. Card rendering uses Takumi's native Node.js backend for WebP output at quality 90. [next.config.ts](../next.config.ts) externalizes `@takumi-rs/core` and traces the bundled fonts and artwork. Standalone packaging must include those assets, public/static files, and Takumi's native binary for the deployment platform. Verify a card request from the production build after changing renderer dependencies.

## Accounts release readiness

The owner approved Gate A on September 15 and authorized Phase 2. The accounts/paid expansion is deployed to shared Preview with a separate migrated database. Hosted Google/GitHub returns and existing-account email/password setup/sign-in pass within the recorded scope. Fresh signup verification delivery and hosted account deletion remain to be verified; the independent production backup/restore passed September 17. Account pages and APIs remain private/no-store or noindex as applicable; public readers and cards must be anonymously accessible before launch.

Local accounts review uses `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443`, with exact `/api/auth/callback/google` and `/api/auth/callback/github` URLs registered in the separate development apps. The main checkout retains `http://share-ai-passage.localhost:1355` and its existing GitHub callback; the earlier HTTP worktree callback also remains registered. The three local GitHub callbacks have wildcard matching disabled. The exact hosted Preview callback was also saved with wildcard matching disabled. The HTTPS worktree route maps to isolated backend 3107; use its configured hostname for auth rather than the backend address. The live Google development callback/session check passes. GitHub development linking and returning sign-in also pass. Hosted OAuth results and the remaining account checks are recorded below.

The owner chose an ordinary shared Vercel **Preview** environment with the existing variable names and credentials where practical. Reuse the broader Neon `neondb_owner` role; no `passage_preview_owner` or per-Git-branch environment overrides are needed. Keep the preview database target separate from production.

On September 15, the schema-only Neon branch was renamed `preview` (`br-wild-union-ayj1kszx`) and its expiration removed for shared use. The fresh `passage_accounts_preview` database uses the existing `neondb_owner` credential; no new password was created. Its direct endpoint is `ep-billowing-term-ayfpmwji.c-5.us-east-2.aws.neon.tech`. All 13 migrations through `0012` were applied and their hashes verified; all 23 public application tables were empty afterward. That Preview setup did not connect to production. Evidence: `work/phase2/hosted-readiness/preview-migration-evidence.json`. Subsequent production preparation and migration on September 17 are recorded above; the accounts application has not been deployed to production.

The fresh database avoids replay conflicts: schema-only copying retains tables but empties the Drizzle migration ledger, so the copied source database cannot simply replay this repository's migrations. Pin `DATABASE_URL`, `DIRECT_DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the verified preview target in the migration process to prevent local fallback. In Vercel, use the normal `DATABASE_URL` pooled connection and `DIRECT_DATABASE_URL` direct connection for Preview. The original database records now target Production only; their IDs and metadata were preserved through target-only updates without submitting replacement values. New ordinary Preview records hold the migrated database connections. No per-branch overrides were created.

The existing `APP_SECRET` and automatic platform origin serve Better Auth; no new auth-secret names or account credential framework were added. Shared Preview reuses development Google/GitHub/Resend, sandbox Stripe catalog/key and existing R2 values. Live checkout remains disabled. The protected Preview retains a $1/month summary operational budget; image generation is removed.

**Current Preview access policy, September 16:** Vercel authentication is required for Preview URLs. The exact public stable-alias exception approved on September 15 was revoked. Vercel Standard Protection (`prod_deployment_urls_and_all_previews`) protects every Preview URL, including custom domains, and generated production deployment URLs; the production domain remains public. Stripe's existing sandbox webhook receives a private automation bypass in its configured URL and retains the same signing secret and event set. Never include that bypass in public links, documentation, screenshots or logs. OAuth/email/Checkout browser returns use the tester's Vercel session. To test Passage anonymously, authenticate with Vercel in that browser first, then leave Passage signed out. External social crawlers cannot unfurl protected Preview URLs; verify actual unfurls on production. The earlier anonymous-access evidence below is historical. Configuration and HTTP evidence: `work/phase2/hosted-readiness/protected-preview-spending-evidence.json`; private bypass material stays in its ignored owner-only companion file. [Vercel Authentication scopes](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).

The stable origin is `https://share-ai-passage-git-codex-accounts-first-launch-saasify.vercel.app`; Vercel authentication is required, including on this alias. Development Google/GitHub callbacks and password sign-in have been verified. The sandbox webhook uses an endpoint-specific signing secret and the existing private automation bypass; no public protection exception remains. See the [current review](PAID_REVIEW.md) and [historical hosted evidence](archive/PAID_REVIEW_2026_09_17.md#hosted-preview).

Summary operations persist before dispatch and settle their original usage periods. Monitor `generation_operations` for old `reserved`, `running` or `uncertain` rows and unknown costs. Never reset a reservation or resubmit a provider request merely because its HTTP response was lost. Recover completed saved results through the owned draft APIs; unresolved provider outcomes require authoritative usage/outcome evidence before settlement. Use `DATABASE_URL=<explicit target> pnpm reconcile:summary list-stale` or `status <operation UUID>` to inspect safe status/cost projections. Repair commands are `succeed`, `fail`, or `cost` followed by the operation UUID, `--evidence /private/evidence.json`, and `--apply`. Evidence binds `action`, `operationId`, an `evidence` note and `actualCostMicros`; success also needs a validated `preview`, while failure permits unknown/null cost. Keep evidence private. The command loads no environment files and never makes a provider call; an elapsed timeout is not outcome evidence. The underlying quota operations settle only the original period and are idempotent. Logs omit private content and retain bounded provider diagnostics and operation identity.

## Paid services and launch gate

Phase 2 is implemented and deployed to shared Preview. Preview, local review/test and production databases are through `0016_subscription_emails`, including durable preparation, uploads-only design normalization, removal of the title length ceiling and subscription emails. Production migration followed an independently verified backup/restore and rehearsal on September 17; existing public data and legacy publishing compatibility were preserved. The accounts application remains undeployed to production. Do not remove the Phase 1 operations or reset their counters.

Configure the variables in [.env.example](../.env.example) separately for each environment. `STRIPE_LIVE_CHECKOUT_ENABLED=false` is the launch default. Test Checkout becomes available with complete sandbox configuration; live Checkout additionally requires its explicit flag.

### Stripe

**Live configuration prepared September 18:** Agentic account `acct_1Qz2IuFRpaq9IkEX` has the following saved live prices. Dashboard and API reads confirmed their USD amounts, intervals, licensed usage and active/live status. The separately approved standard key `Passage Production` is saved privately in Vercel Production and the main `.env.prod.local`. The account reports charges/payouts enabled with no currently due requirements. Live Checkout remains explicitly disabled; no live subscription or payment was created.

| Plan/cadence | Product | Live USD price | Production variable | Price ID |
| --- | --- | --- | --- | --- |
| Plus monthly | `prod_VHHIVDggzpvpKC` | $10/month | `STRIPE_PLUS_MONTHLY_PRICE_ID` | `price_1UGikDFRpaq9IkEXtJp0yKb9` |
| Plus annual | `prod_VHHIVDggzpvpKC` | $96/year | `STRIPE_PLUS_ANNUAL_PRICE_ID` | `price_1UGikDFRpaq9IkEXZalPBCcm` |
| Pro monthly | `prod_VHHJOlcw3zBmoF` | $25/month | `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1UGil2FRpaq9IkEX8I3RRKJk` |
| Pro annual | `prod_VHHJOlcw3zBmoF` | $240/year | `STRIPE_PRO_ANNUAL_PRICE_ID` | `price_1UGil2FRpaq9IkEXSRPM2CHV` |

Lookup keys are `passage_{plus,pro}_{month,year}_usd_v1`. Preserve other Agentic products and the account-wide Portal/branding defaults when configuring Passage-specific live billing.

The existing default management Portal, `bpc_1Rf0mTFRpaq9IkEXDW292xIE`, retains invoice/payment management, period-end cancellation and disabled plan/quantity switching. Completed the separate active, nondefault `Passage checked upgrades` configuration `bpc_1UGirdFRpaq9IkEXnnUZ7jxV` through the API: only the two Passage products/four prices, price-only updates, `always_invoice`, unchanged billing anchor and inactive no-code login. Its headline is `Confirm your Passage upgrade`, return URL is `https://www.share-ai-passage.com/account/billing`, and privacy URL is the production `/privacy` route. API verification requested `expand: ['features.subscription_update.products']` to read the otherwise omitted product list. Saved its ID as `STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID` in both private production configuration locations. Readback verified the original Default unchanged; no new general-Portal environment variable is needed. Evidence: `work/production-launch/live-stripe-runtime-evidence.json`.

Live endpoint `we_1UGs2sFRpaq9IkEXYCIdyRYF` targets `https://www.share-ai-passage.com/api/auth/stripe/webhook`, pins API `2026-08-26.dahlia` matching Stripe SDK 22.6.2, and has exactly the 20 native reconciliation events listed below. Its separate signing secret is saved as `STRIPE_WEBHOOK_SECRET` in Vercel Production and the private main `.env.prod.local`. It is **disabled** because the accounts handler is not deployed yet. Enable after deploying the handler, verify signed delivery, then explicitly enable live Checkout following Gate B. Other Agentic webhook destinations were verified unchanged.

Create USD sandbox prices matching the server catalog: Plus $10/month and $96/year, Pro $25/month and $240/year. Set the four subscription price IDs; use the matching sandbox `STRIPE_SECRET_KEY`. Register the signed Better Auth endpoint `/api/auth/stripe/webhook` and set its separate `STRIPE_WEBHOOK_SECRET`. Keep sandbox/live products, keys and webhook secrets separate. Use Stripe's signed event redelivery for webhook replay; retained `billing_events` records expose failed reconciliation without storing raw customer payloads. With explicit target DB/Stripe credentials, `pnpm reconcile:billing status <account-id>` and `failed-events` inspect safe state; `refresh <account-id> --apply` retrieves authoritative state, and `cancel-closing <account-id> --apply` retries cancellation only for an already closing account. The command cannot assert a paid plan or create an invoice.

The pinned Better Auth Stripe 1.7.4 package has a [one-line pnpm patch](../patches/@better-auth__stripe@1.7.4.patch) that sets the next scheduled phase’s `billing_cycle_anchor` to `phase_start`. Without it, a sandbox monthly-to-annual transition changed the price without collecting the annual payment. The corrected schedule collected $96 at the transition; Passage retained the original monthly allowance anchor. Keep this patch when installing from the frozen lockfile. On a plugin upgrade, remove it only after the native-auth schedule regression and a sandbox annual-transition check pass. See [Stripe’s billing-anchor guidance](https://docs.stripe.com/billing/subscriptions/subscription-schedules#reset-the-billing-cycle-anchor).

**Development setup verified September 15:** the **Passage Development** sandbox under Agentic is `acct_1UFoiGFCzsOIkvWC`, with CLI profile `passage-development`. Its test credential expires **December 14, 2026**; renew the development credential before that date. All five catalog prices and the two Portal configurations below were created. Non-secret IDs and original settings are recorded in `work/phase2/stripe/catalog-evidence.json`. Credentials and price settings are saved in the main ignored `.env.local`, isolated accounts review configuration and ordinary shared Vercel Preview; production configuration remains unchanged.

Sandbox branding was saved through Stripe's Dashboard: the existing 512×512 Passage mark (7,452-byte PNG) is icon `file_1UFpUvFCzsOIkvWCPSsO4Rcg`. SDK readback confirmed white `#ffffff` primary and charcoal `#171717` secondary colors. Explicit Checkout styling was saved with a white background, charcoal buttons, Inter and the default rounded shape; the Portal preview showed the black mark on white with charcoal buttons. The sandbox display name remains **Passage Development** because Business details offered live onboarding. No live business setup was performed. See `work/phase2/stripe/branding-evidence.json` and `BRANDING.md`.

The isolated HTTPS review hostname uses the local Stripe listener at backend 3107. The shared Preview also now has sandbox endpoint `we_1UFrmhFCzsOIkvWCJdcVsOEU` at its stable origin plus `/api/auth/stripe/webhook`, with its own signing secret saved and redeployed. API readback verified all 20 events below; the stable Preview is now publicly accessible after explicit approval; exact signed-delivery verification is tracked in the paid review. Evidence: `work/phase2/hosted-readiness/stripe-webhook-evidence.json`. The local listener at `work/phase2/stripe/listen.mjs` forwards the same event set:

| Family | Event types |
| --- | --- |
| Checkout | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` |
| Subscription | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` |
| Schedule | `subscription_schedule.created`, `subscription_schedule.updated`, `subscription_schedule.released`, `subscription_schedule.canceled`, `subscription_schedule.completed`, `subscription_schedule.aborted` |
| Invoice | `invoice.paid`, `invoice.payment_failed` |
| Charge | `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` |
| Refund | `refund.updated`, `refund.failed` |

To restart forwarding with the saved profile:

```sh
stripe listen --project-name passage-development --forward-to http://127.0.0.1:3107/api/auth/stripe/webhook
```

Keep the listener running during sandbox billing tests. Store its signing secret privately as the development `STRIPE_WEBHOOK_SECRET`, and restart the review backend if the secret changes. Register an Internet-reachable endpoint and its own signing secret for hosted environments; the local listener does not configure one.

Use **two Portal configurations** in each Stripe environment:

- **Default management:** invoice history and payment-method updates enabled, cancellation at period end, and subscription updates disabled. General Manage billing sessions use this default; Passage owns deferred downgrades and cadence changes.
- **Upgrade confirmation:** a separate, non-default configuration with `subscription_update.enabled=true`, `default_allowed_updates=["price"]`, only the approved Plus/Pro subscription products and four prices, `proration_behavior=always_invoice`, and an unchanged billing anchor. Set its ID in the server-only `STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID`; never make it the general Portal default.

The separate configuration must be paired with Passage's backend guard: it authenticates the verified account, rechecks the authoritative Stripe subscription/customer and catalog price terms, and allows only a higher paid plan with the same cadence through `subscription_update_confirm`. It ignores caller configuration IDs and fails closed if the server setting is missing. Scheduled changes require **Keep current plan** first; pending subscription payments require resolution in **Manage billing**. Neither state is silently replaced. Native Checkout, cancellation, restore and deferred-change paths remain separate. Passage grants allowances from confirmed payment state, never the return redirect or native subscription mirror.

**Completed sandbox checks:** Plus Checkout, upgrades, cancellation/restoration, annual scheduling, failure/recovery and signed delivery passed within the scopes recorded in the [historical review](archive/PAID_REVIEW_2026_09_17.md). The current scope excludes image packs.

A Stripe test-clock subscription automatically paid its second $10 Plus invoice; direct application reconciliation and duplicate replay preserved one renewed allowance. The authorized full refund of the review account's $10 pack revoked 50 credits, leaving purchased balance zero while retaining Pro access. Synthetic clock/customer/subscription and database fixtures were cleaned up; the actual review account and refunded grant remain. See `work/phase2/stripe/lifecycle-smoke/evidence.json` and `README.md`. Separately, the local listener confirmed signed `invoice.paid`, `charge.refunded` and `refund.updated` deliveries returned 200. Direct reconciliation and the listener ran concurrently; the harness alone is not proof of endpoint delivery.

The Plus annual downgrade/cadence change was confirmed in Stripe and the database for October 15 and displayed after Refresh billing; its initial return was stale. Keep current plan released it. The final browser state is monthly Pro with 300 summaries, 25 included images, zero purchased credits and no pending/cancellation notice. A metadata-only schedule update and the restoration's schedule release/subscription update/schedule update each reached the signed endpoint with 200 responses. Schedule lifecycle events now reconcile independently, using the six event types above.

The [sandbox lifecycle checkpoint](archive/PAID_REVIEW_2026_09_17.md#real-service-development-checks) passed 806 tests in 66 files and the production build; the 842-test source/deployment checkpoint is recorded above. Sandbox checks cover the corrected annual transition and payment recovery, failed renewal, annual monthly grants, previously unseen out-of-order events, partial refunds, won/lost disputes and interrupted deletion. Dispute reconciliation reads authoritative outcomes because Stripe keeps `charge.disputed` true after a win; missing/active/lost outcomes remain blocking and lookup failures remain retryable. Each report distinguishes actual service events, seeded usage, future evaluation dates and exact fixture cleanup. No hosted or live-payment readiness is implied by completed sandbox checks.

### R2

Use separate public-card and private-asset buckets. Development and shared Preview reuse the configured bucket pair. The examples use these S3 names; existing R2 configurations remain supported. A nonempty R2 value takes precedence over its S3 alias for each setting.

| S3 name | Existing R2 name | Purpose |
| --- | --- | --- |
| `S3_ACCESS_KEY_ID` | `R2_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | `R2_SECRET_ACCESS_KEY` | S3 secret |
| `S3_API_ENDPOINT` | `R2_ENDPOINT` | Account and jurisdiction API endpoint |
| `S3_BUCKET_NAME` | `R2_PUBLIC_BUCKET` | Immutable composed public cards |
| `S3_PRIVATE_BUCKET_NAME` | `R2_PRIVATE_BUCKET` | Private uploaded backgrounds and logos artwork |
| `S3_PUBLIC_URL` | `R2_PUBLIC_URL` | Public bucket's HTTPS delivery origin |

The private bucket is required and must differ from the public bucket; there is no shared-bucket fallback. `R2_ACCOUNT_ID` may be omitted when the selected endpoint contains the account's 32-character hexadecimal ID. If provided, it must match. Without an explicit endpoint, existing R2 configuration uses that account's default endpoint. These aliases still configure Cloudflare R2, not an arbitrary S3 provider.

For buckets in the US jurisdiction, use `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com`. Both buckets must be accessible through the configured endpoint and jurisdiction. Default-jurisdiction buckets use `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; `.eu` and `.fedramp` are also supported. The SDK region remains `auto`; changing a bucket's endpoint does not move it between jurisdictions. [Cloudflare jurisdiction documentation](https://developers.cloudflare.com/r2/reference/data-location/)

Provisioning can use S3 `CreateBucket`, `PutBucketCors` and `GetBucketCors` with the same jurisdiction endpoint and S3 credentials. R2 supports these operations; its S3 ACL and bucket-policy APIs cannot enable public access. [S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) Bucket creation and configuration require **Admin Read & Write** permissions. After setup, use **Object Read & Write** credentials scoped to both application buckets at runtime; ordinary object credentials do not grant bucket administration. The Cloudflare REST API uses a bearer API token, not the S3 key pair. [R2 authentication and permissions](https://developers.cloudflare.com/r2/api/tokens/)

Development/shared Preview use the **Public Development URL** only on the public-card bucket, with its assigned `https://pub-<id>.r2.dev` origin in `S3_PUBLIC_URL`. This makes the entire bucket's objects public, not just a prefix. Keep every public access method disabled on the private bucket; its objects use short signed URLs. `r2.dev` is rate limited and intended for development. Production now uses `https://passage.cultural-alignment.com`, configured on `main` and retained in this branch. Verify new paid composed-card delivery during hosted launch QA. Do not CNAME a domain to `r2.dev`. [Public bucket access](https://developers.cloudflare.com/r2/buckets/public-buckets/)

Configure private-bucket CORS for exact application origins, GET/HEAD/PUT, and the upload headers `Content-Type`, `Content-Length`, and `If-None-Match`; expose `ETag` if the client needs it. Browser requests to valid presigned URLs still require CORS. With the S3 API, send a `CORSConfiguration.CORSRules` policy through `PutBucketCors`, then read it back with `GetBucketCors`. [CORS guidance](https://developers.cloudflare.com/r2/buckets/cors/)

Verify a real browser upload and its signed size/conditional-write behavior against R2. The application validates normalized content, rejects files above 10 MB and reserves the 1 GB active upload-library limit atomically; fixture tests do not establish actual R2 ingress enforcement. Use short staging expiry and a staging-prefix lifecycle rule as a backstop. Do not add lifecycle deletion to immutable public cards or private generated results awaiting reconciliation.

Account deletion queues private-asset cleanup; unfinished image results are protected until their outcome settles. Public assets intentionally remain. Passage reader/card routes still enforce source and publication availability; direct public object URLs are intentionally not revocable.

Run `pnpm cleanup:assets --apply --limit 50` with explicit target `DATABASE_URL` and either storage variable naming scheme; it loads no env files and reports only examined/cleaned/skipped/failed counts. Protected rows are excluded before the batch limit; eligible rows run oldest-attempt first and failed attempts move behind unattempted work. A transaction advisory lock makes overlapping calls return zero counts without touching storage. Accepted private inputs and public objects remain protected.

The owner explicitly approved recurring cleanup for development/testing and subsequent production preparation. `vercel.json` declares `GET /api/cron/cleanup-assets` daily at 04:00 UTC, with a 60-second Node runtime and one 100-asset batch. The route checks an exact nonblank Bearer `CRON_SECRET` before importing cleanup. It returns safe counts with no-store/noindex headers, 401 for invalid authorization, and 503 for partial or thrown failures. The normal secret is saved privately in the main `.env.local` / `.env.prod.local` and Vercel Development/Preview/Production settings. Vercel activates schedules only on production application deployments, so Preview requires explicit test invocation; verify production activation after merge/deployment. See [cleanup instructions](GENERATION_RECONCILIATION.md#daily-private-asset-cleanup). Hosted paid upload/publication remains a Gate B check; existing production reader/card serving and read-only R2/CORS checks passed September 17.

**Development storage verified September 15:** the existing public `passage` bucket uses its `r2.dev` delivery origin, and the new `passage-private` bucket was created through the supplied US-jurisdiction S3 endpoint with public access disabled. The existing public GET/HEAD CORS rule was preserved. Private CORS was applied and read back for `http://share-ai-passage.localhost:1355`, `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443`, and `https://www.share-ai-passage.com`. The exact stable Preview origin was then appended, preserving those three origins and all other rules. No objects or public-bucket settings changed; see `work/phase2/hosted-readiness/r2-cors-evidence.json`. This does not establish hosted browser upload or production delivery.

Fifteen synthetic-object checks passed against real R2, covering public write/read/hash and development delivery, private preflight/signed upload/read, disallowed-origin and wrong-content-length rejection, and immutable overwrite rejection. A separate real-R2/disposable-Postgres application check passed upload reservation/finalization replay, metadata-free normalization, owner isolation, durable generated-result recovery without another provider request or credit debit, and deletion/queued cleanup. Its fixture objects and database records were removed. Cleanup advanced only fixture expiry; natural signed-URL expiry was not measured. Evidence is under `work/phase2/r2/` (`inspection.json`, `provisioning.json`, `smoke.json`, `app-smoke.json`, and `README.md`).

The synthetic publication check also passed: the application composed one 1200×630 public WebP, served matching bytes through its image handler and `r2.dev`, and replayed publication with the same asset/hash/ETag and zero additional writes. Owner deletion and source unavailability independently hid the reader/metadata/card through the app without reading the original object; direct public delivery retained its original bytes. The harness then removed only its three objects and exact database fixtures. This was direct handler execution, with no model/Stripe/hosted Workflow calls; see `work/phase2/r2/publication-smoke.json`.

Actual browser upload, template save and reload passed on the isolated review app. The **R2 browser smoke** template remains there for review and was not made the account default. The preview's missing `.live-card` container was repaired and the live fonts/artwork were confirmed loaded. The [review record](archive/PAID_REVIEW_2026_09_17.md#real-service-development-checks) distinguishes these browser checks from unchanged exports and the blocked saved HTML gallery. The production delivery domain is configured; the complete hosted paid upload/publication journey and actual social unfurls remain open.

### Workflow and operations

`withWorkflow()` retains the durable source-fetch and summary-preparation workflow. `POST /api/drafts` saves the passage identity in Neon before dispatching; `/create?passage=<id>` polls its persisted state. Queue retries reuse preparation identity; private content does not enter workflow arguments/results. Resume uses the existing saved identity, including quota/cost protections.

Image generation, model settings, packs and background-generation workflows were removed September 17. Uploaded backgrounds/logos and immutable composed share cards continue using R2. Apply migrations through `0016_subscription_emails.sql` before deploying the current scope; preceding migrations preserve completed artwork and published bytes. Historical image tables remain audit-only, with no new image provider submissions or purchase endpoints.

Keep Vercel authentication on Preview, sandbox Stripe, live checkout disabled and `SUMMARY_AI_MONTHLY_BUDGET_USD=1`. Preserve summary service/account spending protection and the operations digest/cleanup guidance in [reconciliation](GENERATION_RECONCILIATION.md). Production migrations, live Stripe configuration and the initial $25/month service-wide summary admission ceiling are prepared. Gate B, application deployment, signed live webhook verification, Google branding review and explicit Checkout activation remain.

## Recovery

An independent production logical backup and verified local PostgreSQL 18 restore passed September 17 before applying accounts migrations; existing production data was preserved. See the production-preparation record above. The owner explicitly waived a separate Preview backup/restore rehearsal on September 15; it is not a remaining Preview gate and no Preview export was performed. Logical dumps of this PostgreSQL 18 server require `pg_dump` 18 or newer. No scheduled backup or off-site restore was established; verify actual recovery settings before relying on them.

The [September 11 hosting comparison](research/POSTGRES_HOSTING.md) records the rationale for Neon Free. Recheck provider limits and pricing when making a hosting decision; that comparison is historical research.

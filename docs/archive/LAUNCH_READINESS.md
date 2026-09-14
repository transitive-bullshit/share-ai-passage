# Soft-launch readiness audit

> Historical audit from September 11, 2026. Findings and launch gates below describe that audit. Current scope and remaining gates live in [MVP_PLAN.md](../MVP_PLAN.md); operational setup lives in [PRODUCTION.md](../PRODUCTION.md).

Audited September 11, 2026 against the initial plan at `5a46c91`, the revised [MVP plan](../MVP_PLAN.md), the application at `9976991`, and current local/remote evidence.

## Verdict

**Deployed to Vercel; final validation remains open. A public soft launch still needs proof from Vercel and real social platforms.** The core product is implemented and looks coherent on desktop and mobile. The remaining release work is mostly production verification, with no need for another feature sprint or additional infrastructure beyond Postgres.

The original plan's central promise remains intact: paste a public AI conversation, review an attractive preview, publish one stable link, and let someone read the saved conversation with its source. Read-only AI highlights, public Codex support, the CLI, and five curated card styles were subsequent approved changes. They are assessed as the current product, rather than treating the original excerpt editor, fallback summary, or single template as missing features.

Production setup update: Neon Free is configured in Ohio on PostgreSQL 18, with the checked-in migrations applied, a fixed 0.25-CU production compute, and five-minute idle suspension. Explicit local production commands are available; see [production setup](../PRODUCTION.md). The Vercel project is deployed at [www.share-ai-passage.com](https://www.share-ai-passage.com). The current production domain is documented in the production guide. Deployment checks should cover production and preview metadata, share links, and request-host validation.

## The main user journeys

| Journey | Readiness | Evidence and practical limit |
| --- | --- | --- |
| Paste a public ChatGPT, Codex, or Claude link | Locally proven; hosted gate open | Real anonymous extraction passed locally. Canonical URLs, redirects, provider schemas, failures, and resource limits have regression coverage. Provider endpoints are undocumented and may behave differently from Vercel egress. |
| Generate and review a title/highlights | Implemented | Saved real summaries, offline AI SDK replays, Unicode validation, bounded generation, and useful retry behavior. Generation is mandatory by current scope; no fallback or automatic paid retry. |
| Choose a visual style and publish exactly that preview | Ready locally | Five lightweight picker thumbnails; the large preview uses the actual PNG. Publish waits for that PNG. Database transactions bind the saved text and appearance; duplicate/retried publication reuses the same link. |
| Copy/open a share link | Ready locally | Browser-verified creation and publication, clipboard fallback, absolute URLs, stable readers, and original-source links. Production requires the correct public origin. |
| Read the shared conversation | Polished enough for a soft launch | Desktop/390-pixel mobile checks; responsive typography, complete saved message ordering, Markdown/code/tables, safe links, explicit omitted media, and a shortcut to the last reply for long conversations. |
| Look good in a social feed | Rendering ready; platform gate open | Five readable 1200 × 630 designs, initial HTML OG/large-image metadata, absolute image URLs, no authentication in application routes, and bundled local rendering assets. Actual external platform unfurls remain untested. |
| Keep published links useful over time | Implemented locally; operations open | Durable Postgres snapshots, immutable publications, bounded availability checks, inconclusive-failure preservation, confirmed-removal handling, and no-store responses. Production backup/restore and hosted DB behavior still need verification. |

The initial plan explicitly required hosted extraction and real social unfurls. Successful local tests do not close either gate. See [extraction evidence](../EXTRACTION.md) and [prior verification](VERIFICATION.md).

## High-priority fixes completed during the audit

- **Application origin:** the current configuration derives the origin from Portless in development, Vercel's system environment variables when hosted there, or localhost and `PORT` elsewhere. Production Vercel deployments prefer the project's production hostname; Preview and custom environments prefer the branch hostname, with the deployment hostname as fallback. This replaces the manual origin setting and keeps previews on their own hostname.
- **Vercel client budgets:** an unset `TRUST_PROXY` automatically uses Vercel's own overwritten header when `VERCEL=1`. Self-hosting keeps the shared default unless a trusted proxy is configured. This avoids accidentally sharing ten preparation attempts per hour across all Vercel users.
- **Preparation recovery:** an inconclusive extraction allows a new creation attempt after 60 seconds. Existing availability checks retain their one-hour backoff; confirmed removals are unchanged.
- **Friendly request failures:** preparation, card loading, publishing, and availability checks handle network failures and HTML gateway responses without exposing raw browser/parser errors. Preparation honors `Retry-After`, shows a countdown, and prevents premature resubmission. A source-specific cooldown does not block trying another source; a client-wide 429 does.
- **Reader navigation:** long conversations offer “Jump to last reply”; document fragments stay in the current page.
- **Summary direction:** the prompt now asks for standalone takeaways, trade-offs, and proposed next steps led by the topic itself. Existing saved previews remain unchanged; the production quality check must assess newly generated summaries.
- **Deployment consistency:** CI targets Node 24, which matches Vercel's current default. Migrations accept a separate direct database URL. Docker's model default now matches the app.

Verification for the earlier audit revision: **381 tests across 20 files passed on Node 24.5.0**, including real local PostgreSQL integration tests; formatting, lint, generated route types, TypeScript, and the production build passed. Browser checks covered cached creation/publication, the mobile reader, the jump target, a synthetic retry countdown, and changing to another source during a source cooldown. The synthetic cooldown record was removed. No model or upstream provider request was made by those browser checks.

The [GitHub Actions run for `9976991`](https://github.com/transitive-bullshit/share-ai-passage/actions/runs/34578105827) also passed on Ubuntu with Node 24 and PostgreSQL 17, including the frozen-lockfile install, font preparation, migrations, complete test command, and production build. The earlier account billing failure did not recur; CI is no longer an open gate for this code revision.

## Remaining launch gates, in order

1. **Verify production recovery.** Neon production and migrations are configured. Validate recovery within Free’s six-hour history limit and retain an independent backup. The current local `pg_dump` is 17.4; this server needs an 18+ dump client. Compare quotas and paid alternatives before upgrading. [Production setup](../PRODUCTION.md), [hosting comparison](../research/POSTGRES_HOSTING.md).
2. **Verify the deployed Vercel configuration and automatic public origin.** The project already exists. Confirm Node 24, frozen-lockfile installation, and `pnpm build`; Production needs `DATABASE_URL`, a stable random `APP_SECRET` of at least 32 characters, `OPENAI_API_KEY`, `AI_PROVIDER=openai`, and `AI_MODEL=gpt-5.4-nano`. Keep Vercel's system environment variables enabled and verify metadata and published links use the deployed origin after redeployment. Confirm POST requests validate against the actual request host, including when using an alternate deployment URL. Environment selection uses `VERCEL_TARGET_ENV` before `VERCEL_ENV`; production resolves `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL`, while Preview/custom resolves `VERCEL_BRANCH_URL` or `VERCEL_URL`. `TRUST_PROXY=vercel` is an explicit supported setting; an unset value selects it automatically on Vercel. Give Preview its own database if used. Keep functions near the database. [Vercel runtime](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
3. **Ensure anonymous access to the actual share domain.** Readers and `/image` routes must work without Vercel login, a bypass token, a password, or a bot challenge. Verify the automatically selected origin resolves to a publicly accessible domain. Vercel can now protect production domains on every plan, so verify the actual project setting. [Deployment protection](https://vercel.com/docs/deployment-protection), [September 2026 change](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan).
4. **Run one real end-to-end creation per source format from production.** Use an ordinary ChatGPT share, a public Codex share, and a Claude share. Confirm extraction, generated title/highlights, loaded card, publication, copy/open, faithful transcript, original-source link, and the same style after reload. Repeat publication once to confirm idempotency. This deliberately exercises live model calls and is separate from free tests.
5. **Check real unfurls on two target sharing surfaces.** Paste a published production link into unsent composers/preview tools for X and at least one other intended platform. Confirm title, readable artwork/text at feed size, image crop, and a useful click-through reader. Check an idle/cold image request as well as a warm one. HTTP crawler-user-agent checks are useful diagnostics, but do not prove a platform fetched and displayed the card. No external posts are needed.

If these checks pass, invite a small audience. Watch preparation failures, publication failures, card-render failures, and actual Vercel/Neon/model spending during the first few days. The new summary diagnostics preserve categories and safe request metadata without logging transcripts.

## Sensible deferrals

Accounts, custom themes, transcript editing, more provider formats, background workers, Redis, persistent image storage, a discovery feed, and a large analytics system are unnecessary for this launch. Keep the current database-backed limits and deterministic on-demand renderer until production measurements identify a real bottleneck. Do not promise rich attachments or interactive artifacts: the current reader explicitly represents supported omissions.

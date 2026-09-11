# Soft-launch readiness audit

Audited September 11, 2026 against the initial plan at `5a46c91`, the revised [MVP plan](MVP_PLAN.md), the application at `8292dcd` plus the fixes below, and current local/remote evidence.

## Verdict

**Ready for a controlled production deployment and final validation. A public soft launch still needs proof from Vercel and real social platforms.** The core product is implemented and looks coherent on desktop and mobile. The remaining release work is mostly production setup and verification, with no need for another feature sprint or additional infrastructure beyond Postgres.

The original plan's central promise remains intact: paste a public AI conversation, review an attractive preview, publish one stable link, and let someone read the saved conversation with its source. Read-only AI highlights, public Codex support, the CLI, and five curated card styles were subsequent approved changes. They are assessed as the current product, rather than treating the original excerpt editor, fallback summary, or single template as missing features.

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

The initial plan explicitly required hosted extraction and real social unfurls. Successful local tests do not close either gate. See [extraction evidence](EXTRACTION.md) and [prior verification](VERIFICATION.md).

## High-priority fixes completed during the audit

- **Production origin:** missing `APP_URL` now fails clearly during a production build instead of creating localhost share/image URLs. The Docker build accepts the origin as a build argument.
- **Vercel client budgets:** an unset `TRUST_PROXY` automatically uses Vercel's own overwritten header when `VERCEL=1`. Self-hosting keeps the shared default unless a trusted proxy is configured. This avoids accidentally sharing ten preparation attempts per hour across all Vercel users.
- **Preparation recovery:** an inconclusive extraction allows a new creation attempt after 60 seconds. Existing availability checks retain their one-hour backoff; confirmed removals are unchanged.
- **Friendly request failures:** preparation, card loading, publishing, and availability checks handle network failures and HTML gateway responses without exposing raw browser/parser errors. Preparation honors `Retry-After`, shows a countdown, and prevents premature resubmission. A source-specific cooldown does not block trying another source; a client-wide 429 does.
- **Reader navigation:** long conversations offer “Jump to last reply”; document fragments stay in the current page.
- **Summary direction:** the prompt now asks for standalone takeaways, trade-offs, and proposed next steps led by the topic itself. Existing saved previews remain unchanged; the production quality check must assess newly generated summaries.
- **Deployment consistency:** CI targets Node 24, which matches Vercel's current default. Migrations accept a separate direct database URL. Docker's model default now matches the app.

Verification after these changes: **381 tests across 20 files passed on Node 24.5.0**, including real local PostgreSQL integration tests; formatting, lint, generated route types, TypeScript, and the production build passed. Browser checks covered cached creation/publication, the mobile reader, the jump target, a synthetic retry countdown, and changing to another source during a source cooldown. The synthetic cooldown record was removed. No model or upstream provider request was made by those browser checks.

## Remaining launch gates, in order

1. **Create production Postgres and apply migrations.** Recommended: Neon Launch, one small database in the Vercel function region, pooled runtime URL, direct migration URL, and seven-day restore history. Validate an isolated restore. [Hosting recommendation](POSTGRES_HOSTING.md).
2. **Configure the Vercel project and stable public origin.** Use Node 24, install with the frozen pnpm lockfile, and build with `pnpm build`. Set Production `APP_URL`, `DATABASE_URL`, a stable random `APP_SECRET` of at least 32 characters, `OPENAI_API_KEY`, `AI_PROVIDER=openai`, and `AI_MODEL=gpt-5.4-nano`. `TRUST_PROXY=vercel` is an explicit supported setting; an unset value now selects it automatically on Vercel. Give Preview its own origin/database if used. A database region near the functions matters more than adding another service. [Vercel runtime](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
3. **Ensure anonymous access to the actual share domain.** Readers and `/image` routes must work without Vercel login, a bypass token, a password, or a bot challenge. Do not use an authentication-protected deployment URL for `APP_URL`. Vercel can now protect production domains on every plan, so verify the actual project setting. [Deployment protection](https://vercel.com/docs/deployment-protection), [September 2026 change](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan).
4. **Run one real end-to-end creation per source format from production.** Use an ordinary ChatGPT share, a public Codex share, and a Claude share. Confirm extraction, generated title/highlights, loaded card, publication, copy/open, faithful transcript, original-source link, and the same style after reload. Repeat publication once to confirm idempotency. This deliberately exercises live model calls and is separate from free tests.
5. **Check real unfurls on two target sharing surfaces.** Paste a published production link into unsent composers/preview tools for X and at least one other intended platform. Confirm title, readable artwork/text at feed size, image crop, and a useful click-through reader. Check an idle/cold image request as well as a warm one. HTTP crawler-user-agent checks are useful diagnostics, but do not prove a platform fetched and displayed the card. No external posts are needed.
6. **Restore a usable CI signal.** The current [GitHub Actions run](https://github.com/transitive-bullshit/ai-chat-proxy/actions/runs/34571402018) failed before starting any steps because GitHub reported failed recent account payments or an insufficient spending limit. Resolve the account billing/spending setting, then run the workflow on the final launch commit. This is distinct from the passing local checks.

If these checks pass, invite a small audience. Watch preparation failures, publication failures, card-render failures, and actual Vercel/Neon/model spending during the first few days. The new summary diagnostics preserve categories and safe request metadata without logging transcripts.

## Sensible deferrals

Accounts, custom themes, transcript editing, more provider formats, background workers, Redis, persistent image storage, a discovery feed, and a large analytics system are unnecessary for this launch. Keep the current database-backed limits and deterministic on-demand renderer until production measurements identify a real bottleneck. Do not promise rich attachments or interactive artifacts: the current reader explicitly represents supported omissions.

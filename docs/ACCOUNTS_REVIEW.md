# Accounts implementation review

Status: Phase 1 implemented and validated locally; live development Google, GitHub, password recovery/sign-in and summary generation checks pass. The owner approved the accounts feedback gate on September 15, 2026 and directed Phase 2 to proceed after committing this work. Hosted environment checks remain open; accounts are not deployed.

Implementation branch: `codex/accounts-first-launch`, rebased onto `main` at `70aeefb` to incorporate the committed OAuth/Resend setup and logo asset. Development uses a dedicated local PostgreSQL instance on port 55437, database `passage_accounts_afc0`; tests use the separate disposable `passage_accounts_afc0_test`. The review app is `https://share-ai-passage-accounts-afc0.local.share-ai-passage.com:8443`, routed to the isolated backend on port 3107. Use that origin for authentication; the main checkout retains its separate development route. The review instance uses separate development Google, GitHub and Resend configuration. With explicit owner approval, OpenAI development uses the existing normal API key; fresh summary generation has passed a live check. Automated validation used fixtures and disabled external credentials.

## Implemented

- Better Auth email/password, Google and GitHub configuration; verification/recovery; connected methods; sign-out and deletion.
- Guest creation, one-time guest work/usage import, account preferences and branded account screens.
- Durable saved drafts, serial autosave, revision conflicts, rerolls with recoverable results, My passages, independent deletion and exact owned revisions.
- Atomic 5/25 monthly guest/Free summary allowances and a $25 shared AI budget, original-period settlement, no duplicate dispatch, deletion-safe completion, observed nano token costs and unknown-cost liability.
- Existing anonymous CLI/token/readers/cards retained; account capabilities require the owner’s session and saved revision.
- Explicit local production commands isolate OAuth/email/auth settings from development files and preserve their selected local auth origin.

## Evidence

Regression tests also cover account-default loading before new creation, preservation of recovered choices, and quota-reset/signup guidance after reloading saved drafts without polling indefinitely. Already-reserved operations and cached results remain recoverable at exhaustion.

Focused tests cover actual-library authentication, a real PostgreSQL session roundtrip, owner isolation, guest import collisions and usage carryover, stale edits/tokens, generation/deletion races, cached reuse and source lifecycle. Browser checks cover desktop and 375px/320px library layouts, local cached creation, saved edits/style reload, concurrent-tab conflicts, revision into a new URL, independent deletion and publication.

Final validation on September 14, 2026, after integration with the OAuth/Resend setup on `main`:

- `pnpm fix:format` and `pnpm fix:lint` pass.
- `pnpm test` with the migrated disposable database passes all **642 tests across 45 files**, including formatting, lint, type generation and TypeScript checks.
- `pnpm build` passes with isolated production configuration and `.next-prod` output.
- Production-build HTTP smoke passes 14 checks, including session-gated drafts, cached creation at zero usage, stale-edit rejection, idempotent publication, reader/WebP output and independent draft deletion.
- The unchanged anonymous CLI passes prepare, publish and repeated publish against cached synthetic content. Private draft tokens are suppressed and kept only in ignored local files.
- `pnpm smoke:removal` passes for two synthetic publications, then removes its fixture source.
- Synthetic local backup and restore passes; source, snapshot, publication, saved-draft, auth-user and migration counts match in a separate restore database. This does not establish production recovery.
- The final eight offline WebP card exports are byte-identical to their baseline; font-ready browser/HTML review found no card regression.

Local HTTP, CLI and backup/restore reports are under `work/accounts-review/`. The repair CLI has focused tests and a disposable-database smoke covering repeated cost settlement without extra provider calls. Card review artifacts use the offline authored baseline under `work/share-card-review/accounts-drafts-20260914/`; no paid model calls are part of these checks. Synthetic local review fixture identities are recorded in `work/library-review/fixture.json`.

The Google development follow-up also verified DNS to loopback, trusted TLS and the configured HTTPS callback. Next.js now allows its configured Portless hostname in development: the real font-resource request changed from 403 to 200, while an unrelated origin still receives 403. Scoped formatting, lint and TypeScript checks pass. On September 15, the real Google consent/callback roundtrip completed for the approved tester. The browser reached My passages with 25/25 Free summary generations, Account showed Google connected and the expected verified email, and the session survived a full refresh. A read-only check of the isolated development database confirmed the nonanonymous account, verified email, Google link and active session. The compact result is recorded in `work/accounts-review/google-oauth-smoke.json`.

On September 15, GitHub consent/linking completed, and a subsequent sign-out and GitHub sign-in returned to the authenticated application. The isolated database confirms Google and GitHub are linked to the same verified account. All three exact development GitHub callbacks remain registered with wildcard matching disabled.

The owner explicitly approved using the existing normal OpenAI key for development. A previously uncached public Claude conversation completed one live summary generation, produced a saved draft with three highlights, survived reload and appeared in My passages. The Free ledger settled exactly one operation: 1 used, 24 remaining and 0 reserved. Recorded provider cost was 452 µUSD ($0.000452). The operation persisted its successful result and provider response reference. Individual token counts and response-model metadata are not stored; the metered dispatch code enforces OpenAI `gpt-5.4-nano`. The result is recorded in `work/accounts-review/live-summary-smoke.json`. These checks use the isolated development database, not production data.

The owner completed the delivered password-reset flow on September 15. Subsequent email/password sign-in returned to the same account, with Email and password, Google and GitHub all connected. My passages retained the existing private draft and 24/25 summary allowance after refresh. No test password or reset token is stored in the review evidence. This proves development reset delivery and recovery/sign-in; fresh signup verification is covered by fixture tests but has not been separately exercised with live email.

The requested password policy is now 4–128 characters, shared by Better Auth, signup/reset forms, account password changes and error copy. Follow-up validation passes all **26 focused auth route/UI tests**, scoped formatting, repository lint and TypeScript checks. Actual Better Auth fixture routes accept both boundaries and reject shorter/longer values while preserving email verification, reset-token handling and session revocation. The live Account form displays the four-character minimum. The subsequent integrated Gate A run on `be76c55` passes `pnpm test`: **651 tests across 45 files**, with the migrated disposable PostgreSQL database and no skipped database suites. Formatting, lint and type checks pass, as does `pnpm build` with isolated `.next-prod` output and external credentials disabled. The command results and source hashes are recorded in `work/accounts-review/gate-a-validation.json` and `gate-a-tested-files.json`; the earlier `tested-files.json` remains historical evidence for `7084ffb`. The HTTPS review endpoint remained available with both OAuth providers and email authentication enabled.

A follow-up browser review at a 375px viewport inspected Account settings and the sign-in callback-error screen. Labels, connected methods, password guidance and the error message remained readable without horizontal overflow. Tab navigation reached the new-password field from current password and the sign-in password field through the recovery link; visible focus was retained. The viewport was restored afterward. This was a layout/focus check, not another provider rejection or password mutation. Same-browser sign-out/sign-in and refresh recovery pass; a separate browser profile or physical second-device UI walkthrough remains a manual review item.

## Migration and rollback

Production remains at `0006`; nothing has been applied there. Apply the full pending `0007`–`0008` batch using the repository Drizzle migration command. The installed PostgreSQL migrator wraps all pending migrations in one transaction. Do not deploy only the intermediate `0007` schema.

The final schema retains the original global publication uniqueness constraint. Existing anonymous fingerprints remain unchanged; new owned fingerprints include their immutable namespace. Deletion records both current and older-reader disablement fields and uses a deterministic tombstone fingerprint. Rolling application code back therefore retains legacy writes and does not expose deleted publications. Older request-driven cleanup may log a foreign-key-protected failure for saved-draft-only content; protected snapshots remain intact until accounts code is restored. Preserve the new tables and columns during an application rollback; do not drop owned data or run a destructive down migration.

Tested local migration does not establish a production backup or restore. Obtain and verify a recoverable Neon backup before any production migration, then validate the actual preview callback and email configuration before deployment.

## Outstanding external checks and feedback gate

- Fresh signup verification delivery and the external Reply-To mailbox remain untested live; development password-reset delivery and subsequent email sign-in pass.
- Use isolated hosted preview data and verify the target origin, callbacks, session cookies and account removal there. Confirm production backup/recovery before deployment.
- Gate A is approved: the owner explicitly directed “commit first and then proceed with phase 2” after reviewing the committed accounts work.

Live development checks now establish Google/GitHub sign-in, password recovery/sign-in and model generation. They do not establish hosted preview or production readiness. Review the local accounts experience at Gate A; hosted checks and backup/recovery remain required before deployment, and the owner has now explicitly authorized Phase 2 after feedback.

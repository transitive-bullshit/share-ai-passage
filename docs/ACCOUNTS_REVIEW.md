# Accounts implementation review

Status: Phase 1 implemented and validated locally; live service checks and accounts feedback remain open. This is not a production deployment or a passed accounts feedback gate. Phase 2 has not started.

Implementation branch: `codex/accounts-first-launch`, rebased onto `main` at `70aeefb` to incorporate the committed OAuth/Resend setup and logo asset. Development uses a dedicated local PostgreSQL instance on port 55437, database `passage_accounts_afc0`; tests use the separate disposable `passage_accounts_afc0_test`. The review app is `http://share-ai-passage-accounts-afc0.localhost:1355`, routed to the isolated backend on port 3107. Use that origin for authentication; the main checkout retains its separate development route. The review instance uses the provisioned development Resend and GitHub configuration. Google and fresh OpenAI generation await development credentials. Automated validation used fixtures and disabled external credentials.

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

## Migration and rollback

Production remains at `0006`; nothing has been applied there. Apply the full pending `0007`–`0008` batch using the repository Drizzle migration command. The installed PostgreSQL migrator wraps all pending migrations in one transaction. Do not deploy only the intermediate `0007` schema.

The final schema retains the original global publication uniqueness constraint. Existing anonymous fingerprints remain unchanged; new owned fingerprints include their immutable namespace. Deletion records both current and older-reader disablement fields and uses a deterministic tombstone fingerprint. Rolling application code back therefore retains legacy writes and does not expose deleted publications. Older request-driven cleanup may log a foreign-key-protected failure for saved-draft-only content; protected snapshots remain intact until accounts code is restored. Preserve the new tables and columns during an application rollback; do not drop owned data or run a destructive down migration.

Tested local migration does not establish a production backup or restore. Obtain and verify a recoverable Neon backup before any production migration, then validate the actual preview callback and email configuration before deployment.

## Outstanding external checks and feedback gate

- GitHub development credentials are integrated. The real GitHub authorization page recognizes the exact worktree callback and requests read-only profile/email access; completing consent and the callback/session roundtrip awaits user authorization. The main development callback remains registered, with wildcard matching disabled on both callbacks.
- Google production credentials are provisioned in Vercel and the private production environment. Development remains unconfigured: Google rejects the Portless `.localhost` callback, and the setup task is awaiting a compatible development-hostname choice before creating a separate client. Production credentials must not be reused for local review.
- Development Resend credentials, sender and Reply-To are integrated and recognized by the review app. Verify actual delivery and the email/reset roundtrip; no live email was sent by automated validation.
- Supply a development `OPENAI_API_KEY` for fresh-summary end-to-end checks. Cached creation and generation bookkeeping have passed fixture-backed tests.
- Use isolated hosted preview data and verify the target origin, callbacks, session cookies and account removal there. Confirm production backup/recovery before deployment.
- Review the working accounts experience and explicitly direct continuation before any billing, R2, custom templates, generated artwork or paid CLI implementation.

Configuration-presence checks and fixture-backed authentication tests do not prove real OAuth credentials or email delivery. The accounts feedback gate remains open until those external checks and user feedback are complete.

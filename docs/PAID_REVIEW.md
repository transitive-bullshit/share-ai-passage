# Phase 2 implementation review

September 15, 2026. **Implementation commit: `e5f43dd`**, on `codex/accounts-first-launch`. Accounts were committed and Gate A approval recorded in `15755bc` before paid work began. This is a local implementation checkpoint; **Gate B has not passed**. No accounts/paid production migration, deployment or live checkout occurred.

## Implemented

- Better Auth/Stripe subscriptions and Portal integration, authoritative payment entitlements, monthly allowances for annual plans, and the $10/50 image pack. Original prices and quotas remain unchanged.
- Saved templates, private R2 uploads/references/artwork, custom branding and typography, frozen public cards, and exact-design owned revisions.
- Durable image operations through Workflow, one provider-submission claim, credit/spend accounting, uncertain-result recovery, deletion races and explicit result application after edits.
- Revocable account API keys, authenticated CLI/skill defaults and durable recovery files, preserving anonymous use.
- Explicit operator commands for summary/image/billing reconciliation and private-asset cleanup. These do not configure scheduling or alerts.

## Verification

The final implementation sources passed `pnpm test`: **752 tests in 63 files**, with all PostgreSQL suites enabled against the migrated disposable local database. Formatting, oxlint and Next route generation/TypeScript passed. A separate production build passed with six Workflow steps and one workflow. External service credentials were cleared for these checks; provider responses in tests were fixtures.

Production HTTP smoke used the build at `127.0.0.1:3109`, the isolated test database and an explicit fixture auth secret. Homepage/billing/templates/keys returned 200; unauthenticated billing/templates/key APIs returned 401 with private/no-store responses. The native example-card route returned a valid 1200×630 WebP. The temporary server was stopped afterward. Saved evidence: `work/phase2/production-http-smoke.json`.

An actual local Workflow run completed through the generated flow/step routes using a pre-cancelled synthetic operation. It made no model request. Its temporary database records were removed. Saved evidence: `work/phase2/workflow-smoke.json`. This establishes local queue/routing behavior, not hosted execution or paid provider recovery.

Browser review on the isolated HTTPS accounts app covered monthly/annual prices, unavailable-service messaging, a temporary Plus draft, watermark removal, typography changes, template saving/listing, and persistence after reload. The live card's fonts and artwork were loaded, Modern typography survived reload, and the 390px mobile breakpoint had no horizontal overflow. Generated mode blocked publishing while artwork was missing; disabled generation returned a clear error and created zero image/summary operations. The temporary Plus entitlement, draft and template were removed, restoring the original Free account.

Eight legacy WebP exports remained byte-identical to their frozen baseline. Five paid export fixtures were visually checked; the v2 image sample was also rendered in all five layouts. The resumed paid-draft regression changes repository geometry and confirms the saved frozen descriptor survives unchanged. The local saved HTML comparison at port 4399 was blocked by the browser client and was not claimed as reviewed; live preview and exported-image checks are recorded separately.

## Outstanding gates

1. Configure actual Stripe sandbox keys/prices/Portal/webhooks and R2 buckets/credentials/CORS. Exercise real checkout, renewal, proration, cancellation, pack refund/dispute, browser upload and durable object recovery. Fixture tests do not prove those services are configured.
2. Complete the frozen 25-call image qualification batch and remaining supported-input/economics checks. The benchmark currently has 14 completed calls costing $0.172288. Automatic approval review rejected the next exact batch despite the earlier $20 budget approval; the specific confirmation question remains pending. No rejected call ran.
3. Verify hosted Workflow identity/replay/duration and measured charges, provider-spend reconciliation, private cleanup scheduling and operational alerts, backup/restore, hosted account email/OAuth and production migration/deployment readiness.

Keep `STRIPE_LIVE_CHECKOUT_ENABLED=false` and `IMAGE_GENERATION_ENABLED=0` until the applicable gates pass. Sample image costs are promising but are not a validated worst-case margin or lifetime-serving guarantee. The [measured economics report](research/PHASE2_MEASURED_ECONOMICS.md), [implementation handoff](ACCOUNTS_PAID_FEATURES_PLAN.md), [production guide](PRODUCTION.md#paid-services-and-launch-gate) and [reconciliation guide](GENERATION_RECONCILIATION.md) contain the supporting contracts and next steps.

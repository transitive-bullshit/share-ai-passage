# Paid features review

Updated September 17, 2026. Gate A is approved; the protected Preview and draft PR contain accounts, Stripe subscriptions and uploaded-image customization. Gate B still precedes production launch. [Historical verification](archive/PAID_REVIEW_2026_09_17.md) preserves detailed earlier evidence; AI image generation, style references and image packs have been removed from the current scope.

## Current implementation

Free, Plus and Pro retain $0/$10/$25 monthly prices, $96/$240 annual prices and 25/100/300 monthly summary allowances. Paid customization uses uploaded backgrounds/logos and saved templates with consistent colors, fonts, position and branding. There are no image model calls, image-generation routes/workflows, image credits or pack purchases. Existing completed artwork becomes an ordinary background selection; published card assets stay fixed.

Creation persists an owned passage ID, then runs source reading and summary preparation in Vercel Workflow. `/create?passage=<id>` follows persisted state and shows the published result after publishing, including reopening from browser history. Stale published edits/regenerations are rejected; Revise creates separate work. My passages shows published work before drafts.

## Verification and remaining gates

The uploads-only sources pass **833 tests in 67 files**, including disposable PostgreSQL suites, formatting, lint and TypeScript. The production build passes with six preparation steps and one workflow. Eight saved card exports remain byte-identical; the saved HTML comparison is running and was reviewed in Chrome.

Earlier protected Preview checks passed Google/GitHub sign-in and sessions, existing-account email/password, pricing/session state, private APIs, signed Stripe webhook delivery, Workflow routing and controlled recovery. Subscription lifecycle, refunds/disputes, upload ownership, template/card persistence and caching have automated/local real-service coverage. The earlier image qualification and cost report are historical evidence, not launch gates.

For the simplified scope, verify the hosted paid upload/template/publication journey and published Back/refresh behavior. The owner still reviews fresh email signup/verification and a card on desktop/phone. Production OAuth/Stripe wiring, migrations, initial spending limits and rollout remain separate. The owner explicitly declined a Preview backup/restore exercise.

[Preview](https://share-ai-passage-git-codex-accounts-first-launch-saasify.vercel.app) requires Vercel authentication. Sandbox Stripe and `SUMMARY_AI_MONTHLY_BUDGET_USD=1` keep test exposure tight. Live checkout is disabled. Public reader/image cache rules are retained; no production deployment or migration has run for this work.

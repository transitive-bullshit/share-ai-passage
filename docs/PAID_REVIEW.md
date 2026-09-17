# Paid features review

Updated September 17, 2026. Gate A is approved; the protected Preview and draft PR contain accounts, Stripe subscriptions and uploaded-image customization. Gate B still precedes production launch. [Historical verification](archive/PAID_REVIEW_2026_09_17.md) preserves detailed earlier evidence; AI image generation, style references and image packs have been removed from the current scope.

## Current implementation

Free, Plus and Pro retain $0/$10/$25 monthly prices, $96/$240 annual prices and 25/100/300 monthly summary allowances. Paid customization uses uploaded backgrounds/logos and saved templates with consistent colors, fonts, position and branding. There are no image model calls, image-generation routes/workflows, image credits or pack purchases. Existing completed artwork becomes an ordinary background selection; published card assets stay fixed.

Creation persists an owned passage ID, then runs source reading and summary preparation in Vercel Workflow. `/create?passage=<id>` follows persisted state and shows the published result after publishing, including reopening from browser history. Stale published edits/regenerations are rejected; Revise creates separate work. My passages shows published work before drafts.

## Verification and remaining gates

The uploads-only sources pass **828 tests in 67 files**, including disposable PostgreSQL suites, formatting, lint and TypeScript. The production build passes with six preparation steps and one workflow. Editor regression checks retain fitted canvases and decoded artwork across title/highlight edits, reject stale font readiness, and refit genuine wrapping changes before publication becomes available. Title/highlight length recommendations never reject editing, autosave or publication. Cards clip titles to two lines and highlights to three lines with ellipses, preserving complete saved/reader text. Native renderer regressions verify clipping and painted ellipses for all five styles; oversized text also saves and publishes through disposable PostgreSQL. Eight saved card exports remain byte-identical; their HTML comparison and eight fresh `gpt-5.4-nano` summary pairs were reviewed in Chrome. The isolated Preview has migration `0015_soft_summary_recommendations`; existing publication text and frozen card assets remained unchanged.

Earlier protected Preview checks passed Google/GitHub sign-in and sessions, existing-account email/password, pricing/session state, private APIs, signed Stripe webhook delivery, Workflow routing and controlled recovery. Subscription lifecycle, refunds/disputes, upload ownership, template/card persistence and caching have automated/local real-service coverage. The earlier image qualification and cost report are historical evidence, not launch gates.

On September 17, the protected Preview showed the persisted published result when reopening `/create?passage=<id>`, navigating to its reader and pressing Back, refreshing, and following a legacy `?draft=` link. The template editor offers only curated/uploaded artwork and labels its controls “Background position,” “Horizontal position” and “Vertical position.” The library regression suite also excludes published identities from drafts.

For the simplified scope, the complete hosted paid upload/template/publication journey remains a separate launch check. The owner still reviews fresh email signup/verification and a card on desktop/phone. Production OAuth/Stripe wiring, migrations, initial spending limits and rollout remain separate. The owner explicitly declined a Preview backup/restore exercise.

[Preview](https://share-ai-passage-git-codex-accounts-first-launch-saasify.vercel.app) requires Vercel authentication. Sandbox Stripe and `SUMMARY_AI_MONTHLY_BUDGET_USD=1` keep test exposure tight. Live checkout is disabled. Public reader/image cache rules are retained; no production deployment or migration has run for this work.

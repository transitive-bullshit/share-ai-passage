# Accounts and paid features implementation plan

Updated September 18, 2026. This is the current implementation and launch contract. The [earlier plan](archive/ACCOUNTS_PAID_FEATURES_PLAN_2026_09_17.md) and [historical paid review](archive/PAID_REVIEW_2026_09_17.md) preserve prior decisions; removed image-generation features are no longer launch requirements.

## Sequence and gates

1. Accounts and related Free features first: Better Auth email/password, Google/GitHub, verification/reset, profile/preferences, guest import, saved work, CLI keys, usage and owner deletion. **Gate A approved.**
2. Stripe billing and paid customization immediately afterward: individual subscriptions, backgrounds/logos uploaded to R2, reusable templates, branding and immutable composed share cards. **Implemented and deployed; remaining hosted paid QA is recorded below.**
3. Production OAuth/Stripe configuration, migrations, conservative summary spending limits and deployment are complete. The owner explicitly authorized live Checkout activation on September 18; production initialization passed without a payment. Preview remains protected with sandbox Stripe and a tighter summary budget. See [activation evidence](PRODUCTION.md#live-billing-activation--september-18).

## Product contract

|  | Guest | Free | Plus | Pro |
| --- | --: | --: | --: | --: |
| Monthly USD | $0 | $0 | $10 | $25 |
| Annual USD, upfront | — | — | $96 | $240 |
| Summary generations/month | 5/browser | 25 | 100 | 300 |
| Saved work and synced preferences | Session | Yes | Yes | Yes |
| Uploaded backgrounds/logos, reusable templates, custom card branding | — | — | Yes | Yes |

Annual plans are 20% off, with monthly allowance refills and no rollover. Both paid tiers offer the same customization; Pro adds summary capacity. Generations count new summaries and rerolls even if unpublished. Cached reuse, manual edits, uploads, rendering and publication do not consume units. Confirmed technical failure restores reserved units once; unknown outcomes remain reserved. No image generation, image credits/packs, overage billing or summary packs.

Creation never requires signup. A new account defaults to Free; `/pricing` and billing identify its confirmed active plan after the client session loads. Stripe signed events and current provider state establish paid access, never a return URL. Cancellation/downgrade takes effect at period end; same-cadence upgrades show the prorated charge before confirmation. Unpaid renewals and refunded/disputed invoice coverage cannot grant paid access. Published cards and saved work persist after access ends; new paid edits/publication require active access.

Passage sends branded Resend subscription confirmations to verified account email addresses for paid activation, effective plan/cadence changes, scheduled cancellation/downgrade and their removal, payment failure/recovery, and the return to Free. Scheduled changes include their effective date; prices come from the plan catalog and invoices remain authoritative for taxes/proration. Routine renewals, duplicate events and unpaid price changes do not create duplicate or premature plan confirmations. Notifications commit with billing state in a durable outbox; mail failures never undo paid access. Hourly private cron resumes delivery; Preview uses explicit invocation. Apply migration `0016_subscription_emails.sql` before deploying this addition.

## Passage creation and ownership

POST persists an owned saved identity before returning its ID and enqueuing durable source reading/summary preparation. `/create?passage=<id>` retrieves its current preparing, failed, editable or published state. Legacy `?draft=` URLs redirect. Safe retries reuse the existing request and generation; polling does not start work. Deleted work cannot be recreated by retries or background completion.

The editor follows publication state on initial load and browser-history restoration. A published identity shows the same published result and fixed link as successful publication; its mutation endpoints reject stale edit, regenerate and apply requests. **Revise** creates a separate editable identity and new publication URL, preserving the original. `/passages` places published work before drafts, with independent pagination.

Title/highlight length counts are soft recommendations. Editing, autosave, card previews and publication accept full text beyond those counts. Cards clip titles to two lines and each highlight to three lines with ellipses; saved text and readers stay complete. Migration `0015_soft_summary_recommendations.sql` removes the database title ceiling while preserving nonempty titles.

Guest signup or login transfers work/consumption once without merging independent publication namespaces. Session/account boundaries apply to private APIs, saved work, assets and CLI keys. Public readers/images remain independent of private session state and retain the aggressive cache behavior inherited from `main`.

## Uploaded assets and templates

Use existing Cloudflare R2 S3 credentials with distinct private upload and public card buckets. Uploaded PNG/JPEG/WebP backgrounds and logos are validated, normalized, immutable and owned; 10 MB/file and 1 GB upload-library limits remain. Do not allow arbitrary remote URLs, uploaded fonts or executable image formats. Background controls describe **position**, horizontally and vertically; internal normalized x/y fields continue driving the same renderer.

Templates save curated/uploaded background choice, colors, font pairing, background position and Passage/none/custom branding. The webapp owns customization; paid CLI and agent creation use the account's default template. No generative art-direction/style-reference UI or provider adapter remains.

New paid publication persists the resolved design and composed R2 card. Published text, design and accepted artwork are fixed; changing a template affects future work only. Asset access checks ownership; archived selections remain usable in existing work. Public R2 objects are retained under the accepted retention policy.

Migration `0014_uploads_only.sql` converts completed generated artwork into ordinary background assets, removes obsolete recipe/design fields, and changes unfinished generated-background selections to curated defaults. It preserves public card bytes/frozen descriptors and deletes no R2 objects. Historical operation/grant tables remain audit data; there is no runtime image execution, reconciliation or purchase API.

## Reliability, spending and deployment

Vercel Workflow runs source fetch/summary preparation, passing only saved IDs; Neon is the authoritative product record. Keep safe queue/recovery retries and the existing summary request/cost ledger. Keep Free/guest subsidy and service-wide summary limits plus paid per-account spending protection; do not debit rejected work or erase unknown costs. Preview requires Vercel authentication, sandbox Stripe and the tight $1/month summary operational limit. Provider cost reservations are estimates, not a provider-enforced cap.

Use the existing Next.js, Neon/Postgres, Drizzle, Vercel, Better Auth, Stripe and R2 stack. Avoid teams/collaboration, custom domains/slugs, analytics dashboards, model selectors/training and public asset garbage collection for this launch. Production activation remains explicit; reuse ordinary environment names and credentials rather than special-case credential schemes.

## Gate B review

Agent verifies hosted sandbox paid access → upload → save template → create → publish → reload, including frozen card/reader access, summary quota and browser Back/refresh state. The owner performs one fresh email signup/verification and a brief desktop/phone card review. Retain automated lifecycle, authorization, persistence, deletion-race and cache regressions; do not repeat manual cancellation/dispute checks already covered.

See [paid review](PAID_REVIEW.md), [production guide](PRODUCTION.md), [summary reconciliation](GENERATION_RECONCILIATION.md), [accounts review](ACCOUNTS_REVIEW.md) and [testing guidelines](testing.md).

# Phase 2 measured economics — September 15, 2026

**Gate B remains pending.** The saved samples support inexpensive generation and rendering; ordinary sample quality passes. New-work readability checks and owner-approved per-account spending protection are implemented locally; browser verification and hosted operational costs remain open. Prices and allowances remain **Free, Plus $10/$96 annually with 100 summaries + 10 images, Pro $25/$240 annually with 300 + 25, and the $10/50 image pack**. No offering is enabled by this report. The [handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) remains authoritative.

## Evidence collected

The earlier checkpoint contained **14 successful calls, $0.172288 total metered cost, no unresolved reservation**, against the original $20/48-call ceiling. The 12-call v1 pilot is diagnostic. At that checkpoint, the revised reference-isolation prompt had **one Flare and one Sunburst result**; each used 339 text-input, 544 reference-input and 216 output tokens, costing **$0.012527** at full uncached list rates. Flare took 12.196s; Sunburst 16.888s. These are observed token costs, not an invoice, price cap, population average or latency p95. [OpenAI pricing](https://developers.openai.com/api/docs/pricing#image-generation).

The initial Flare v2 sample removed the unrelated astronaut and depicted a single save/crossed-out retry; Sunburst was less specific. This was an unblinded preliminary observation, not configuration acceptance.

The user subsequently gave specific approval for the previously blocked **25-image qualification batch**. Exactly those frozen requests completed, sequentially with no retries: **25 succeeded, zero failed or uncertain responses, $0.316988 new metered cost**. The shared total is now **39 calls and $0.489276**, with zero outstanding liability and $19.510724 of the original budget unused. The original 14 ledger entries, frozen manifest, reference/prompt fingerprints and saved output hashes were verified unchanged. No public feature was enabled and no further calls ran. The $1 per-request reservation remained an operational liability buffer, not a provider-enforced maximum. [Final audit](../../work/phase2/image-benchmark/qualification-final-verification.json).

The tested candidate is pinned to `gpt-image-2.5-flare-2026-09-08`, prompt `passage-background-v2`, 1200×640 medium/opaque WebP, compression 85, one image, no automatic retry. The model snapshot, dimensions and $5/$8/$30 per million text-input/image-input/image-output token rates were refreshed against official documentation before dispatch. Costs use full uncached rates and are not invoices. [Flare model](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image settings](https://developers.openai.com/api/docs/guides/image-generation), [pricing](https://developers.openai.com/api/docs/pricing#image-generation).

| Flare v2 population | n | Median / maximum latency | Mean / maximum metered image cost |
| --- | --: | --: | --: |
| Six topics × three styles, including the retained v2 first result | 18 | 12.514s / 23.235s | 1.25245¢ / 1.26170¢ |
| Two topics × three styles, deliberate repeats | 6 | 11.435s / 13.893s | 1.24745¢ / 1.25270¢ |
| Boundary probes | 2 | 10.948s / 13.490s | 1.46135¢ / 1.87370¢ |
| This candidate, combined | 26 | 12.243s / 23.235s | 1.26737¢ / 1.87370¢ |

All 26 v2 outputs used 216 image-output tokens. The ordinary referenced fixtures used 544 image-input tokens. A 4096-byte prompt with a 1024×1024 reference used 813 text-input + 1024 image-input + 216 output tokens, costing **$0.018737**; the no-reference 4096-byte probe used 802+0+ 216, costing **$0.010490**. These are sample observations, not documented maximum token counts. No representative existing public-art crop approached the 1 MB reference cap (largest 284,082 bytes); the frozen batch omitted that probe rather than pad a file or substitute artificial noise.

**Independent, unblinded review passed the ordinary empirical quality threshold:** 17/18 first results acceptable (94.4%, above 90%); style consistency Margin notes 4/5, Electric risograph 5/5, Midnight observatory 4/5. All six deliberate repeats were usable. The one reject was reference-subject leakage: the accessibility-review topic in Margin notes borrowed an astronaut/planetary setting. This is a recorded failure within the sample, not a claim of perfect reference isolation. Neither the v1 pilot nor Sunburst is averaged into Flare v2 acceptance.

The independent reviewer inspected 32 full-resolution production cards across all five layouts: 30 ordinary cards were readable. The two maximum-prompt probe cards had valid but extreme 1000/1000/637-character highlights; the existing text fitter made them illegible. New previews and new publications now require at least 22px highlight text on the 1200×630 canvas; otherwise they ask the sharer to shorten the highlights or change style. The saved-text caps remain unchanged. The actual extreme probe is rejected in all five styles, while all eight ordinary authored WebP and HTML outputs are byte-identical. All eight final native exports were visually inspected; font-ready browser verification remains pending. Existing published-card rendering and publication reuse retain compatibility. This fix required no model calls. [Readability evidence](../../work/share-card-review/readable-card-floor-20260915-README.md). [Qualification report](../../work/phase2/image-benchmark/QUALIFICATION_REPORT.md), [gallery](../../work/phase2/image-benchmark/qualification.html), [metrics](../../work/phase2/image-benchmark/qualification-metrics.json).

The earlier local production-render checkpoint produced **70 distinct cards**: all 14 saved artworks across five layouts, plus 15 warm repeats. Generated assets used the production normalizer; final cards are 1200×630 WebP. On Apple M3 Pro/Node v25.9.0, first render after imports was 49.9ms wall/51.4ms process CPU. Across 70 cards, wall median/max was 36.9/100.2ms and CPU median/max 37.4/65.6ms. Fifteen initialized repeats had wall median/max 38.7/44.7ms. Imports, cold cloud startup, network, database and queue work are excluded.

Card bytes averaged **117.1 KB**, range 79.8–164.8 KB. Normalized generated backgrounds averaged **157.3 KB**, range 93.8–221.3 KB. The revised Flare export was visually inspected in all five layouts: readable text, preserved attribution and no Passage watermark. The saved HTML/font-ready browser review is separate. Local gallery/evidence: [five-layout exports](../../work/phase2/image-benchmark/cards.html), [revised contact sheet](../../work/phase2/image-benchmark/v2-five-layouts.png), [render measurements](../../work/phase2/image-benchmark/render-metrics.json). [Committed calculations](PHASE2_MEASURED_ECONOMICS_DATA.json) preserve aggregates, assumptions and evidence hashes.

The completed qualification outputs were also normalized with production code and rendered in all five fixed layouts: **130 valid 1200×630 WebPs**. Local wall time median/max was **40.65/85.05ms**, process CPU **40.23/105.20ms**; final bytes averaged **127,323**, median 118,036 / maximum 253,434. Representative dense and German cards were visually inspected across all five layout types, with readable text/attribution and the existing German title ellipsis. Dimension/hash checks across 130 files do not imply full-resolution manual inspection of every card. No model, R2, database or hosted Workflow request ran during this offline report. The earlier committed calculation file retains the 70-card checkpoint; updated raw measurements are in the qualification metrics linked above.

## Supported cost bounds

The implementation fixes one output, size/quality, no retry, a 4096-byte UTF-8 prompt and one metadata-free static WebP reference of at most 1024 px per edge and 1 MB. Reservation uses current-month known costs plus unresolved reservations under a database lock; default concurrency is 4. Actual usage is retained and priced, unknown costs retain liability, and the existing reconciliation path resolves definitive evidence. These are effective admission/accounting controls, **not proof that every provider charge is below the $1 reservation or the pack’s margin ceiling**. [Adapter](../../lib/image-model.ts), [reservation](../../lib/image-usage.ts).

The current GPT Image 2.5 guide calls its output calculator an estimate and directs applications to measure returned usage. The vision guide explicitly excludes GPT Image from its patch/tile calculator; its older GPT Image 1 rules cannot establish Flare 2.5 input costs. The Images API exposes no `max_output_tokens` or per-request spending cap. Therefore the narrow missing hard-bound evidence is **provider-confirmed maximum billable text/reference/output tokens, including overhead, for this pinned configuration**. More ordinary samples or a larger compressed reference cannot prove that contract. [Generation costs](https://developers.openai.com/api/docs/guides/image-generation), [GPT Image input accounting](https://developers.openai.com/api/docs/guides/images-vision#gpt-image-model-inputs), [Images API](https://developers.openai.com/api/reference/resources/images/methods/generate).

The owner explicitly accepted sampled economics with **per-account spending protection** on September 15. The implementation keeps every advertised allowance and pauses new paid generation when its next reservation would exceed the applicable operational ceiling. Saved work, publication and remaining credits are preserved. Existing operation rows supply the ledger; there is no new schema, environment variable or credential.

| Funding                        |                AI spending ceiling |
| ------------------------------ | ---------------------------------: |
| Plus monthly / annual          | $1.840 / $1.587 per anchored month |
| Pro monthly / annual           | $5.300 / $4.255 per anchored month |
| Each fully paid $10 image pack |      $2.210 lifetime image funding |

These ceilings come from the existing 70% contribution scenario after its stated fees and non-model reserves. They are admission limits, not exact net-revenue accounting or guaranteed margins. Missing historical billing cadence uses the lower annual ceiling. Summaries and included images share the subscription bucket; purchased images use a separate lifetime account funding pool. Included-first, oldest-pack credit debit order is unchanged.

Both buckets count known provider charges and reserved liability for unknown costs, including failed operations whose customer units were restored. Admission, response metering and settlement share the account lock. Subscription spending belongs to the operation's original acceptance window; an upgrade raises the ceiling without erasing cost, and annual subscriptions reset monthly. Guest-imported operations retain their charging-period ownership. Free/guest operations remain in the existing shared $25 subsidy.

Pack refunds proportionally reduce funding, disputes remove it, and a won dispute restores net funding without erasing costs or used-credit debt. Taxes never increase funding; discounts reduce it. Later paid packs add funding to the lifetime pool, avoiding an older nominal credit balance permanently blocking use of new funding. The pool never resets monthly.

The current $0.02 summary and $1 image reservations are unchanged. Pending jobs can temporarily occupy headroom; settlement or evidence-backed reconciliation may restore it before the next allowance window. Denial returns `AI_SPEND_LIMIT` without reserving a credit or submitting work. The existing reconciliation CLI reports ceilings and liabilities. There is no separate permanent anomaly latch or automatic retry. See [policy](../../lib/ai-spending-policy.ts), [ledger queries](../../lib/ai-spending.ts) and [reconciliation](../GENERATION_RECONCILIATION.md).

A first provider charge can still exceed its reservation, and non-model reserves still need operational validation. Subscription ceilings use the scenario's plan/cadence revenue, not a new invoice-dollar ledger for discounts or refunds. The protection therefore limits repeated high spending; it does not guarantee profit for every account or indefinite public-asset traffic.

## Current rate assumptions

All scenarios use public US domestic-card Stripe rates, not this merchant's verified contract: **2.9% + $0.30**, plus **0.7% recurring Billing volume**. Annual fees are one charge spread over 12 months; the one-off pack has no recurring Billing fee. Taxes, international cards, FX, disputes and refunds can change the result. [Payments](https://stripe.com/pricing), [Billing](https://stripe.com/billing/pricing).

R2 Standard lists **$0.015/GB-month, $4.50/million writes and $0.36/million reads, zero egress**. Calculations use marginal unit rates without awarding the shared free tier to every customer; actual invoices round billing units. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Cloud sensitivity uses Vercel iad1 **$0.128/CPU-hour, $0.0106/GB-hour at an assumed 2 GB allocation, $0.60/million invocations**; these are not measured cloud CPU/memory charges. [Function pricing](https://vercel.com/docs/functions/usage-and-pricing). On-demand delivery uses **$0.15/GB CDN transfer, $0.06/GB origin transfer and $2/million edge requests**. [Regional pricing](https://vercel.com/docs/pricing/regional-pricing/iad1). Both byte meters apply to the assumed uncached function path. [CDN metering](https://vercel.com/docs/manage-cdn-usage). Flat Rate CDN may cover eligible CDN requests/transfer as a shared tier; Passage's enablement/eligibility is unverified, so that saving is excluded. [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn).

**Workflow pricing changed from older step-based snippets:** the fetched dedicated page lists **$0.02/1,000 events, $0.50/GB written and $0.50/GB-month retained**, with Pro retention seven days. Functions and Queues add charges; a normal step emits three events. [Workflow pricing](https://vercel.com/docs/workflows/pricing). Queue API operations are separately metered in 4 KiB chunks, with multipliers for some operations. [Queue pricing](https://vercel.com/docs/queues/pricing). An explicitly assumed 20 events, 20 KB written, 20 queue units, 1s CPU/30s wall and five invocations per image totals **$0.000640/job** before DB/R2; replace these counts with live usage.

## Subscription and pack scenarios

These rows assume **$0.003 per summary**, the **1.25245¢ first-result Flare v2 mean**, and **5% extra billed image-failure spend** despite customer credit refunds. None is a proven supported maximum. Expected use means **half of AI allowances**, a scenario rather than observed behavior. Deliberate rerolls and abandoned generations already consume units; no duplicate aesthetic-retry multiplier is added. Other monthly reserves remain **$0.50 Plus/$1 Pro** for serving, storage, Workflow, database, email, retention and financial losses. Contribution excludes fixed overhead, acquisition and support.

| Billing | Revenue/month | Fees/month | Summaries/images | Half-use margin | Full-use, observed-unit scenario | Full-use, unqualified 8¢ image stress |
| --- | --: | --: | --: | --: | --: | --: |
| Plus monthly | $10.00 | $0.660 | 100 / 10 | 86.2% | 84.1% | 77.0% |
| Plus annual | $8.00 | $0.313 | 100 / 10 | 87.1% | 84.4% | 75.6% |
| Pro monthly | $25.00 | $1.200 | 300 / 25 | 88.7% | 86.3% | 79.2% |
| Pro annual | $20.00 | $0.745 | 300 / 25 | 88.2% | 85.1% | 76.3% |

Free's 25 summaries cost **$0.075 at the assumed summary rate**, plus infrastructure; percentage margin is undefined at zero revenue. The **$25 global Free/guest AI subsidy** and fixed hosting/database/email commitments must be funded separately. Neither the $0.003 summary assumption nor the per-operation budget reservation establishes a worst-case unit price.

The pack rows assume all 50 units redeemed, **$0.59 payment fees + $0.20 other reserve**, no profit from unused balances, and the same explicit 5% billed-failure scenario:

| Raw provider unit price | Model spend including failure scenario | Full-redemption contribution |
| --- | --: | --: |
| 1.25245¢ first-result mean | $0.658 | 85.5% |
| 1.87370¢ observed maximum | $0.984 | 82.3% |
| 2.42¢ | $1.270 | 79.4% |
| 4.42¢ | $2.321 | 68.9% |
| 8¢ | $4.200 | 50.1% |

The accepted 80%/70% pack ceilings of **2.42¢/4.42¢** apply to total model spend per redeemed credit. With the illustrative 5% billed-failure surcharge, the underlying successful-call ceilings become **2.305¢/4.210¢**. Both the measured mean and observed maximum fit these scenarios, but neither establishes a supported maximum; failure incidence and non-model reserves remain assumptions.

## Publication, serving and retention workloads

The following workload projections preserve the earlier 70-card baseline and its committed calculation file. The new 130-card sample is larger on average (127.3 KB versus 117.1 KB); it does not establish cloud billing. At the new mean, one million retained final cards alone occupy 127.3 GB, or about $1.91/month at the stated R2 rate.

A generation can support several publications; publishing/manual revisions are not generation-metered. **Per 1,000 distinct final cards**, measured local render times mapped mechanically onto the assumed cloud rates give **$0.0022 compute**, versus **$0.0420** if cloud rendering takes 1s CPU and 1s wall each. One write/two reads per card add **$0.0052** at marginal object rates. The resulting 0.117 GB costs **$0.0018/month** retained. DB/normalization/network work and billing-unit rounding are additional; these operation counts are scenarios, not R2 observations.

Assume each reader response is 50 KB, each image uses the measured mean card bytes, 2 KB request/response overhead per request, no CDN cache hit, and 10ms CPU/100ms wall at 2 GB per request. **100,000 reader + 100,000 image requests** transfer 17.11 GB and cost **$4.34** in modeled Vercel/R2 usage, plus unmeasured database/source checks. A viral **1 million of each** is **$43.39**, not covered by a small single-pack reserve. Eligible enabled Flat Rate CDN would replace its covered shared costs; origin/compute/database still remain. No cloud serving load was run.

The next table checks the existing non-AI reserves against modest, explicit workloads. It includes those serving assumptions, local-time render projections, the assumed Workflow job, and **60 months of storage reserved upfront for each month's new cards/backgrounds**. Plus/Pro also include one month of the full 1 GB active upload library. The leftover is still needed for database/email, payment refunds/disputes, normalization and measurement error.

| Package | New final cards | New backgrounds | Reader/image requests | Modeled non-AI subtotal | Remaining existing reserve |
| --- | --: | --: | --: | --: | --: |
| Plus | 100 | 10 | 1,000 each | $0.078 | $0.422 |
| Pro | 300 | 25 | 3,000 each | $0.199 | $0.801 |
| Pack | 100 | 50 | 1,000 each | $0.094 | $0.106 |

The pack reserve is plausible only under this workload, not arbitrary lifetime traffic. One million retained final cards occupy **117.1 GB** at the earlier sample's mean, costing **$1.76/month**, or **$105.41 over five years**; additional backgrounds, references, old revisions and future growth add bytes. Permanent retention has no finite lifetime cost guarantee. These workloads are cost scenarios, not new user quotas.

## Remaining launch evidence

The approved Flare v2 calls and two frozen probes are complete; ordinary empirical quality passed. The extreme-highlight safeguard and approved spending controls are implemented; complete the font-ready browser check and deploy/verify this revision in Preview. Measure actual hosted Workflow/queue/compute, database, delivery, email and merchant-specific payment costs against the stated reserves. Real Stripe and R2 functional checks are recorded separately in [implementation review](../PAID_REVIEW.md); they do not measure all hosted costs. Keep Gate B and the affected paid offering disabled until the applicable quality, integration and economic gates pass. No additional random-image batch is required merely to claim a hard bound that the provider does not document, and allowances/prices must not change silently.

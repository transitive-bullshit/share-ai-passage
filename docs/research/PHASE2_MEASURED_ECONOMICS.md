# Phase 2 measured economics — September 15, 2026

**Gate B remains pending.** The saved samples support inexpensive generation and rendering; they do not yet qualify the model's broader quality, maximum supported input cost, or live billing/storage/Workflow operation. Prices and allowances remain **Free, Plus $10/$96 annually with 100 summaries + 10 images, Pro $25/$240 annually with 300 + 25, and the $10/50 image pack**. No offering is enabled by this report. The [handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) remains authoritative.

## Evidence collected

The shared ledger contains **14 successful calls, $0.172288 total metered cost, no unresolved reservation**, against the original $20/48-call ceiling. The 12-call v1 pilot is diagnostic. The revised reference-isolation prompt has just **one Flare and one Sunburst result**; each used 339 text-input, 544 reference-input and 216 output tokens, costing **$0.012527** at full uncached list rates. Flare took 12.196s; Sunburst 16.888s. These are observed token costs, not an invoice, price cap, population average or latency p95. [OpenAI pricing](https://developers.openai.com/api/docs/pricing#image-generation).

Flare v2 removes the unrelated astronaut and depicts a single save/crossed-out retry; Sunburst remains less specific. This unblinded preliminary judgment cannot establish the 90% first-result pass rate or cross-topic 4/5 consistency gate. The separately frozen 25-call qualification manifest is awaiting the explicit approval requested after automatic approval review rejected that batch. No blocked batch call ran. A 4096-byte prompt and 1024×1024 reference probe are prepared; no representative public-art sample approached the 1 MB cap (largest 284,082 bytes), so the near-byte-cap probe remains unqualified.

The local production renderer produced **70 distinct cards**: all 14 saved artworks across five layouts, plus 15 warm repeats. Generated assets used the production normalizer; final cards are 1200×630 WebP. On Apple M3 Pro/Node v25.9.0, first render after imports was 49.9ms wall/51.4ms process CPU. Across 70 cards, wall median/max was 36.9/100.2ms and CPU median/max 37.4/65.6ms. Fifteen initialized repeats had wall median/max 38.7/44.7ms. Imports, cold cloud startup, network, database and queue work are excluded.

Card bytes averaged **117.1 KB**, range 79.8–164.8 KB. Normalized generated backgrounds averaged **157.3 KB**, range 93.8–221.3 KB. The revised Flare export was visually inspected in all five layouts: readable text, preserved attribution and no Passage watermark. The saved HTML/font-ready browser review is separate. Local gallery/evidence: [five-layout exports](../../work/phase2/image-benchmark/cards.html), [revised contact sheet](../../work/phase2/image-benchmark/v2-five-layouts.png), [render measurements](../../work/phase2/image-benchmark/render-metrics.json). [Committed calculations](PHASE2_MEASURED_ECONOMICS_DATA.json) preserve aggregates, assumptions and evidence hashes.

## Current rate assumptions

All scenarios use public US domestic-card Stripe rates, not this merchant's verified contract: **2.9% + $0.30**, plus **0.7% recurring Billing volume**. Annual fees are one charge spread over 12 months; the one-off pack has no recurring Billing fee. Taxes, international cards, FX, disputes and refunds can change the result. [Payments](https://stripe.com/pricing), [Billing](https://stripe.com/billing/pricing).

R2 Standard lists **$0.015/GB-month, $4.50/million writes and $0.36/million reads, zero egress**. Calculations use marginal unit rates without awarding the shared free tier to every customer; actual invoices round billing units. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Cloud sensitivity uses Vercel iad1 **$0.128/CPU-hour, $0.0106/GB-hour at an assumed 2 GB allocation, $0.60/million invocations**; these are not measured cloud CPU/memory charges. [Function pricing](https://vercel.com/docs/functions/usage-and-pricing). On-demand delivery uses **$0.15/GB CDN transfer, $0.06/GB origin transfer and $2/million edge requests**. [Regional pricing](https://vercel.com/docs/pricing/regional-pricing/iad1). Both byte meters apply to the assumed uncached function path. [CDN metering](https://vercel.com/docs/manage-cdn-usage). Flat Rate CDN may cover eligible CDN requests/transfer as a shared tier; Passage's enablement/eligibility is unverified, so that saving is excluded. [Flat Rate CDN](https://vercel.com/docs/pricing/flat-rate-cdn).

**Workflow pricing changed from older step-based snippets:** the fetched dedicated page lists **$0.02/1,000 events, $0.50/GB written and $0.50/GB-month retained**, with Pro retention seven days. Functions and Queues add charges; a normal step emits three events. [Workflow pricing](https://vercel.com/docs/workflows/pricing). Queue API operations are separately metered in 4 KiB chunks, with multipliers for some operations. [Queue pricing](https://vercel.com/docs/queues/pricing). An explicitly assumed 20 events, 20 KB written, 20 queue units, 1s CPU/30s wall and five invocations per image totals **$0.000640/job** before DB/R2; replace these counts with live usage.

## Subscription and pack scenarios

These rows assume **$0.003 per summary**, the one observed v2 Flare price, and **5% extra billed image-failure spend** despite customer credit refunds. None is a proven supported maximum. Expected use means **half of AI allowances**, a scenario rather than observed behavior. Deliberate rerolls and abandoned generations already consume units; no duplicate aesthetic-retry multiplier is added. Other monthly reserves remain **$0.50 Plus/$1 Pro** for serving, storage, Workflow, database, email, retention and financial losses. Contribution excludes fixed overhead, acquisition and support.

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
| 1.253¢ | $0.658 | 85.5% |
| 2.42¢ | $1.270 | 79.4% |
| 4.42¢ | $2.321 | 68.9% |
| 8¢ | $4.200 | 50.1% |

The accepted 80%/70% pack ceilings of **2.42¢/4.42¢** apply to total model spend per redeemed credit. With the illustrative 5% billed-failure surcharge, the underlying successful-call ceilings become **2.305¢/4.210¢**. The measured example fits, but unresolved maximum input costs, failure incidence and non-model overhead prevent a launch guarantee.

## Publication, serving and retention workloads

A generation can support several publications; publishing/manual revisions are not generation-metered. **Per 1,000 distinct final cards**, measured local render times mapped mechanically onto the assumed cloud rates give **$0.0022 compute**, versus **$0.0420** if cloud rendering takes 1s CPU and 1s wall each. One write/two reads per card add **$0.0052** at marginal object rates. The resulting 0.117 GB costs **$0.0018/month** retained. DB/normalization/network work and billing-unit rounding are additional; these operation counts are scenarios, not R2 observations.

Assume each reader response is 50 KB, each image uses the measured mean card bytes, 2 KB request/response overhead per request, no CDN cache hit, and 10ms CPU/100ms wall at 2 GB per request. **100,000 reader + 100,000 image requests** transfer 17.11 GB and cost **$4.34** in modeled Vercel/R2 usage, plus unmeasured database/source checks. A viral **1 million of each** is **$43.39**, not covered by a small single-pack reserve. Eligible enabled Flat Rate CDN would replace its covered shared costs; origin/compute/database still remain. No cloud serving load was run.

The next table checks the existing non-AI reserves against modest, explicit workloads. It includes those serving assumptions, local-time render projections, the assumed Workflow job, and **60 months of storage reserved upfront for each month's new cards/backgrounds**. Plus/Pro also include one month of the full 1 GB active upload library. The leftover is still needed for database/email, payment refunds/disputes, normalization and measurement error.

| Package | New final cards | New backgrounds | Reader/image requests | Modeled non-AI subtotal | Remaining existing reserve |
| --- | --: | --: | --: | --: | --: |
| Plus | 100 | 10 | 1,000 each | $0.078 | $0.422 |
| Pro | 300 | 25 | 3,000 each | $0.199 | $0.801 |
| Pack | 100 | 50 | 1,000 each | $0.094 | $0.106 |

The pack reserve is plausible only under this workload, not arbitrary lifetime traffic. One million retained final cards occupy **117.1 GB** at this sample's mean, costing **$1.76/month**, or **$105.41 over five years**; additional backgrounds, references, old revisions and future growth add bytes. Permanent retention has no finite lifetime cost guarantee. These workloads are cost scenarios, not new user quotas.

## Remaining launch evidence

Complete the separately scored Flare v2 topic/style/repeat set and supported-input probes; obtain independent visual scores and HTML/font-ready overlay checks. Validate maximum supported summary/image costs and billed failure recovery, then measure actual deployed Workflow events/queues/compute, Neon queries, R2 operations, compressed delivered bytes, email and merchant-specific Stripe fees. Validate annual grants, proration and full pack redemption. Keep Gate B and the affected paid offering disabled until those independent quality, integration and economic gates pass; do not silently change the accepted allowances to make a forecast fit.

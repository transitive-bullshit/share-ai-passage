# Passage: first-pass unit economics

Implementation authority: the [accounts and paid features handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) contains the accepted package and sequence: accounts first, a mandatory feedback stop, then billing and paid features. Historical recommendations below do not override it.

Research date: September 14, 2026. Interview input, not accepted pricing or implementation requirements. No production billing or usage data was inspected.

## What can be calculated today

Illustrative US domestic-card payments: Stripe Payments 2.9% + $0.30 per successful charge, plus pay-as-you-go Billing at 0.7% of recurring volume. Rates differ by merchant country, card origin and currency. This is a scenario, not a claim about Passage's actual Stripe account. [Payments](https://stripe.com/us/pricing), [Billing](https://stripe.com/billing/pricing).

Let P be monthly subscription revenue excluding collected taxes, F payment/Billing fees, S text-generation spend, I image-generation spend, H variable hosting/storage/delivery/email, and R a reserve for refunds, failures and retained assets after churn. Contribution = P - F - S - I - H - R. Contribution margin = contribution / P. Fixed overhead, support and acquisition costs must be deducted separately to estimate profit.

| Proposed plan | Revenue/month | Illustrative payment + Billing fees | Remaining variable-cost budget at 80% contribution margin | At 70% |
| --- | --: | --: | --: | --: |
| Free | $0 | $0 | No self-funding budget | No self-funding budget |
| Startup | $8.99 | $0.624 | $1.174 | $2.073 |
| Professional | $49.99 | $2.100 | $7.898 | $12.897 |

These are affordable-cost ceilings, not achieved margins. Free contribution is negative whenever servicing costs money; its percentage margin is undefined because revenue is zero. Budget it as acquisition spend, with both per-client controls and a service-wide ceiling. Paid customers must cover fixed overhead plus this subsidy before the business is profitable.

## Text generation already consumes some of that budget

[Current generation code](../../lib/suggestions.ts) defaults to gpt-5.4-nano, with zero automatic retries and up to 700 output tokens. [Summary input](../../lib/summary.ts) is capped at 20,000 encoded characters, not tokens. Current list prices are $0.20 per million input tokens and $1.25 per million output tokens. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-nano).

Illustrative request: 6,000 total input tokens (including instructions) and 300 output tokens costs $0.001575. This is neither observed average usage nor a worst-case bound. For 1,000 uncached summaries, that is $1.575. A $8.99 monthly plan then has roughly 75.5% contribution margin before hosting, storage, images or reserves. At 100 such summaries the corresponding figure is about 91.3%, again before those costs. Usage mix matters more than the headline link allowance.

At 1,000 uncached summaries/month, the Startup 70% margin scenario leaves about $0.498 for every other variable cost, including images. Its 80% target is already exceeded by summaries alone. This does not disprove 1,000 links: cached sources and forks can avoid generation. It does disprove promising a strong per-customer margin solely from a publication quota and an assumed cache hit rate.

Preparation invokes generation before publication. Abandoned drafts and manual retries can spend money without creating a link. The current call discards token usage, so this review cannot establish actual average cost. Captured source content and generated summaries are reused; public image requests render the card without another AI request. See [service](../../lib/service.ts), [prepare route](../../app/api/prepare/route.ts), and [image route](../../app/[provider]/[publicationId]/image/route.ts).

## Implications for the interview

- Separate published-passage allowances from costly preparation/image-generation budgets. Meter real provider usage and reservations before dispatch; prevent concurrency and retry duplication. An unsuccessful or timed-out provider job can still create a bill.
- Published reads and social crawler requests also have costs. R2 egress policy does not make Vercel processing, rendering or downstream delivery free. The current image route renders on every request and public responses use no-store for removal enforcement. A caching/render-once design must preserve source-removal checks.
- Treat image credits as a separate fixed allowance or prepaid add-on. Do not equate 1,000 links with 1,000 generated backgrounds. See [image research](IMAGE_GENERATION_ECONOMICS_2026-09.md).
- Literal unlimited creation and unbounded serving are incompatible with a guaranteed per-customer margin. A finite creation allowance and spend ceilings are clearer than an undisclosed fair-use cap. Operational incidents, payment disputes and permanent asset retention prevent an absolute promise of never losing money on any account.
- Annual revenue must be spread over twelve months when comparing margins. A discount reduces revenue; a single annual charge reduces the fixed payment fee. Annual billing does not require granting all generation credits upfront. Model the annual tier separately before choosing its discount.
- Shared free-tier infrastructure credits belong to the service, not every customer. Model marginal costs without multiplying those allowances per user; allocate fixed infrastructure overhead separately.

## Measurements needed before final tier commitments

Measure uncached prepare input/output tokens, failed and abandoned preparation frequency, generated-image cost per accepted background including references and retries, rendering time/memory, database usage, delivered bytes and requests, and retained asset volume over time. Compare light use, expected use, full allowance use, concurrent abuse and a viral old publication. Select an explicit free-service monthly subsidy budget and paid contribution target. These inputs remain open interview decisions or later benchmark work; no paid API calls were made here.

## Historical calculation after round two (quota basis superseded by Q15)

The user clarified that the original tier names and prices were brainstorming and asked for a KISS recommendation. They accepted a 20% annual discount, monthly replenishment, an 80% expected contribution target, a 70% full-allowance target, and a $25/month global free/anonymous AI subsidy. Recommended prices are Free, Plus $10/month or $96/year, and Pro $25/month or $240/year. The user accepted this package in round three as the implementation baseline, conditional on benchmark validation before selling it. It supersedes the original price anchors; it is not a live published price change.

Proposed monthly allowances: Free 25 published passages/no generated backgrounds; Plus 100 passages/10 generations; Pro 300 passages/25 generations. Both paid plans have the same branding/template features. Free accounts retain standard Passage cards and synced appearance. Guest access remains available with separate enforceable client/network controls.

For a conservative illustrative calculation, reserve $0.003 per uncached summary preparation and $0.08 per image generation, including reference inputs and retry headroom. These are assumed supported unit-cost budgets, not measured bounds. Include up to twice as many new summaries as publications to account for abandoned drafts: 50/200/600 preparations for Free/Plus/Pro. Count those preparations explicitly in the usage policy and accounting; a publication cap alone cannot bound them. If repeated failures or preparation abuse are possible beyond these counts, the model no longer holds.

| Annual subscription scenario, per month         |   Plus |    Pro |
| ----------------------------------------------- | -----: | -----: |
| Recognized revenue                              |  $8.00 | $20.00 |
| Payment and Billing fees                        | $0.313 | $0.745 |
| All included summary preparations used          |  $0.60 |  $1.80 |
| All image generations used                      |  $0.80 |  $2.00 |
| Other variable cost / retained-asset reserve    |  $0.50 |  $1.00 |
| Total modeled variable cost, full use           | $2.213 | $5.545 |
| Contribution margin, full allowances            |  72.3% |  72.3% |
| Contribution margin, half of AI allowances used |  81.1% |  81.8% |

Half usage is an explicit scenario, not an observed average. Monthly billing full-use margins are 74.4%/76.0%. The same caveats about merchant/card pricing, collected taxes, actual usage, fixed overhead, refunds, retained content and viral serving apply. Margins do not include allocating the global Free subsidy to paid customers. The $0.50/$1 reserves are placeholders that require validation; they do not establish a lifetime asset-hosting guarantee.

Free consumes about $0.15 in AI at the assumed full allowance of 50 uncached preparations, plus storage and serving. Its contribution percentage remains undefined. The $25 service-wide AI ceiling is shared across guests and free accounts, not a separate grant to each person.

Before launch, measure bounded summary input/output costs, allowed image reference sizes and quality, retries/failures, and non-AI costs. Verify that both allowances and supported per-operation costs fit these budgets at the discounted annual price. If they do not, adjust allowances, supported generation settings or pricing before selling the plans; do not use an undisclosed spend stop to contradict the advertised entitlement. Prepaid image-pack pricing is a separate pending calculation, including its own transaction fee.

### Rejected initial image pack proposal

Proposed separately for Q14: $10 for 10 additional generations, no automatic purchase, with included monthly allowance consumed first. At an assumed US domestic one-off Checkout payment fee of 2.9% + $0.30 (no recurring Billing fee in this scenario), $0.08 per generation and a $0.10 other-cost reserve, modeled contribution is $8.51, or 85.1%. This is a pricing illustration, not observed margin; actual payment configuration, country/card mix and future retained-credit liabilities matter. The pack is deliberately an occasional-use option: Pro remains the lower-cost subscription choice than accumulating sufficient Plus top-ups to match Pro's image allowance, and adds passage capacity. Do not infer pack acceptance from acceptance of the subscription prices.

## Current generation-based economics after Q15

Q15 explicitly replaces publication quotas and the separate preparation multiplier with generation quotas. Free/Plus/Pro include 25/100/300 fresh AI summaries monthly, and currently accepted image allowances remain 0/10/25. Guest allowance becomes five summary generations per browser/month. Regenerations and abandoned outputs count; cached reuse, manual edits, uploads and publishing do not. Generation of a summary plus an image consumes one unit from each balance.

Keeping the earlier conservative assumed costs ($0.003/summary, $0.08/image, $0.50/$1 other monthly reserve), annual Plus full-use cost becomes $0.313 + $0.30 + $0.80 + $0.50 = $1.913, or 76.1% contribution. Annual Pro becomes $0.745 + $0.90 + $2.00 + $1.00 = $4.645, or 76.8%. Free AI cost at its full summary allowance is approximately $0.075, plus storage/serving. These remain scenarios, not measured limits or profit guarantees.

The user also accepted retaining public R2 objects without MVP garbage collection. Budget retained assets over time rather than treating account deletion as storage recovery. Disabling the Passage reader or publication-image route does not revoke a direct public R2 URL. Private reference inputs remain separate.

## Revised prepaid images: a substantially better deal

The user accepted the target of $10 for **50 standard image generations**, five times the rejected allowance, conditional on the quality/cost benchmark before sale. For an illustrative US one-off payment: Stripe fees $0.59; provisional per-pack operating and retained-asset reserve $0.20. No recurring Billing percentage is applied to this one-off-payment scenario. Verify the actual merchant/card configuration before launch. [Stripe's US card rate](https://stripe.com/billing/pricing).

| Model cost per generation | 50 generations | Total cost including $0.59 fees and $0.20 reserve | Contribution at full redemption |
| --- | --: | --: | --: |
| $0.020 | $1.00 | $1.79 | 82.1% |
| $0.025 | $1.25 | $2.04 | 79.6% |
| $0.030 | $1.50 | $2.29 | 77.1% |
| $0.040 | $2.00 | $2.79 | 72.1% |
| $0.080 | $4.00 | $4.79 | 52.1% |

These rows assume every purchased generation is redeemed. No unused-credit breakage is counted as profit. Maximum supported model cost per generation is `(10 * (1 - targetMargin) - 0.59 - 0.20) / 50`: $0.0242 for 80%, $0.0442 for 70%. At 100 images/$10, those thresholds fall to $0.0121/$0.0221. Fifty is the recommended benchmark target; a larger pack needs lower verified costs or a consciously lower margin target.

Official GPT Image 2.5 token rates are $5/M text input, $8/M image input and $30/M image output. They do not establish a fixed per-image price. The model page cautions against using GPT Image 2 token consumption to price GPT Image 2.5; the image-guide calculator's model selection must be verified. Inputs and failure overhead are additional assumptions. Use actual API usage and visual quality checks before committing the pack, and do not call calculator forecasts measured costs. [Model pricing](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [image research and calculator provenance](IMAGE_GENERATION_ECONOMICS_2026-09.md).

Meter deliberate rerolls as new generations. Do not provision every credit for multiple free aesthetic retries as well. Reserve for actual provider-billed failures, normalized reference inputs, rendering and retained assets, and reconcile uncertain requests before retrying. The pack reserve does not establish an infinite-duration hosting guarantee or cover arbitrary traffic.

A possible later subscription improvement at unchanged prices is 40/100 included images for Plus/Pro. With 100/300 summaries at $0.003, images budgeted at $0.03, and the same $0.50/$1 reserves, annual full-use margins are 71.1%/71.8%; half-use scenarios are 80.5%/81.5%. This is a candidate after quality/cost validation, not an accepted replacement for 10/25. It would make the monthly bundle coherent with a much better-value top-up.

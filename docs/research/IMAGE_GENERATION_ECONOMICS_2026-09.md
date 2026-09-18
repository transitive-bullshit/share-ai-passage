# Image generation economics for paid Passage branding

Implementation authority: the [accounts and paid features handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) contains the accepted package and sequence: accounts first, a mandatory feedback stop, then billing and paid features. Historical recommendations below do not override it.

> Research checked September 14, 2026. These are proposals and dated evidence, not accepted requirements. No image generation was purchased or run. Current product scope remains in [MVP_PLAN.md](../MVP_PLAN.md).

> **Correction:** Earlier GPT Image 2.5 per-image forecasts are unvalidated and withdrawn from pricing decisions. See the correction below. Current accepted pricing and quota decisions live in [the account design](ACCOUNTS_PAID_BRANDING_DESIGN.md); the original plan scenarios below are historical research.

## First recommendation

Per accepted Q15, meter summary generations and image generations separately; publishing itself does not consume an additional allowance. Offer one image provider in the MVP, with an internal adapter that lets us replace it later. Evaluate OpenAI GPT Image 2.5 Flare first for backgrounds and Sunburst if reference adherence proves better; leave the final choice to a small visual and cost benchmark. Do not expose a model picker yet.

Generate a background when the owner creates or explicitly regenerates a passage, store the result, and render text, highlights, avatar, logo, colors, and watermark rules with existing deterministic card rendering. Public visits and social crawlers must only retrieve already-created assets. A persistent brand style should start with saved art direction, palette, composition rules, and an optional reference image, alongside exact uploaded branding assets. An AI style reference is guidance, not a guarantee of identical visual identity.

## Verified model options

| Option | Published cost signal | Relevant tradeoff |
| --- | --- | --- |
| [OpenAI GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) | $5/M text input, $8/M image input, $30/M image output tokens; cached inputs $1.25/M and $2/M respectively | Officially positioned for faster everyday generation; accepts text and images. |
| [OpenAI GPT Image 2.5 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) | Same token rates; equal rates do not establish equal request costs | Officially positioned for editing precision. Both have September 8, 2026 snapshots. Exact IDs: `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`. |
| [Google Gemini 3.1 Flash Image](https://ai.google.dev/gemini-api/docs/pricing) | Approximately $0.067 for 1K image output; $0.50/M input and $3/M text/thinking output extra | Useful alternative for interactive generation; 1K 16:9 is 1376×768, then crop to the card. |
| [Google Gemini 3.1 Flash Lite Image](https://ai.google.dev/gemini-api/docs/pricing) | $0.0336 for 1K image output; $0.25/M input and $1.50/M text/thinking output extra | Cheaper Google comparator, 1K output only. |
| [BFL FLUX.2 klein / pro](https://docs.bfl.ai/quick_start/pricing) | Klein 4B from $0.014, 9B from $0.015; pro generation from $0.03, editing from $0.045 | Published starting prices; final request cost depends on dimensions and reference/edit configuration. |

Google's guide supports up to 14 reference images across its Gemini 3 image models, with different object/character allowances. It explicitly lists up to three style references for Gemini 3 Pro Image; it does not list that dedicated style-reference allowance for Flash/Lite. Pro's 1K/2K output is approximately $0.134, plus inputs and text/thinking. Do not assume all reference-image support is equally good at brand style transfer. [Google image guide](https://ai.google.dev/gemini-api/docs/image-generation), [Google prices](https://ai.google.dev/gemini-api/docs/pricing).

FLUX.2 klein supports up to four references and pro up to eight via API. BFL describes klein inference as sub-second; that is a vendor inference claim, not measured end-to-end Passage latency. Pin a stable endpoint when reproducibility matters. [BFL model comparison](https://docs.bfl.ai/flux_2/flux2_overview).

Midjourney's guidelines say it generally offers no API except rare explicit arrangements and prohibits unauthorized automation and resale of service access. The personal website account is unsuitable as Passage's production backend. [Midjourney guidelines](https://docs.midjourney.com/hc/en-us/articles/32013696484109-Community-Guidelines).

## Correction: OpenAI per-image forecast is unvalidated

**Do not use the earlier 216-output-token / $0.00648 estimate, the derived $0.01698 request cost, or the roughly $0.019 retry-adjusted forecast as verified GPT Image 2.5 production costs.** Any image allowance justified by those forecasts remains conditional on a usage benchmark.

The freshly fetched [Flare model page](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) warns that the GPT Image 2 calculator cannot estimate GPT Image 2.5 token consumption. The current [image guide](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) also exposes a separate model selector explicitly labeled GPT Image 2.5 (Sunburst and Flare). The earlier browser observation used that labeled entry at 1200×640; it was not knowingly a GPT Image 2 selection. The warning therefore does not by itself prove a mistaken model selection. However, the observation was a calculator estimate, never measured API usage, and does not validate the total cost of Passage's reference workflow. We are withdrawing the old forecast from pricing decisions rather than treating an unresolved documentation distinction as a cost guarantee.

The verified token rates remain $5/M text input, $8/M image input, and $30/M image output. Calculate actual request cost as:

`(5 × textInputTokens + 8 × imageInputTokens + 30 × imageOutputTokens) / 1,000,000`

Adjust for actually observed cached tokens, paid failures, and operational overhead. Reference-input token consumption, output token consumption by quality, and retry rates have not been measured for Passage. The old assumption that a reference contributes 1,000 tokens is not a verified per-reference price.

### Price the allowance against a cost threshold

A proposed **$10 one-off pack of 50 generations** has $0.59 illustrative US card fees. With a provisional $0.20 operating/retained-asset reserve for the entire pack, generation cost must average **at most $0.0242 for 80% contribution margin** and remain **at most $0.0442 at supported full usage for 70% margin**. Those thresholds are arithmetic constraints, not a forecast that OpenAI meets them. This calculation assumes all credits are redeemed and includes no profit from unused credits.

| $10 pack size | Maximum average generation cost at 80% margin | Maximum cost at 70% margin |
| --- | --: | --: |
| 25 | $0.0484 | $0.0884 |
| 50 | $0.0242 | $0.0442 |
| 100 | $0.0121 | $0.0221 |

One-off fee assumptions follow [Stripe Payments](https://stripe.com/pricing). Stripe Billing fees apply separately to recurring subscription scenarios below.

### BFL alternative to evaluate

BFL's current price table lists FLUX.2 klein 4B editing from $0.014 and 9B editing from $0.015; the first megapixel has a base charge and additional megapixels add cost. Its editing guide explicitly supports reference images. These are promising comparison candidates, but the fetched pages do not establish the all-in bill for our exact output size, reference configuration, failed calls, and retries. Do not replace the unsupported OpenAI forecast with an assumed BFL minimum-price guarantee. [BFL pricing](https://docs.bfl.ai/quick_start/pricing), [reference editing](https://docs.bfl.ai/flux_2/flux2_image_editing).

Benchmark actual usage and invoices, reference adherence, latency, and operational failure overhead before selecting a provider or publishing credits. Repeated user-requested generations consume allowance; avoid adding an aesthetic-reroll surcharge internally when the reroll already consumes another credit. No paid API calls were made for this correction.

## R2 cost and durability

R2 Standard lists **$0.015/GB-month**, **$4.50/million Class A operations**, **$0.36/million Class B operations**, and free direct internet egress. Its monthly free allowance includes 10 GB storage, 1M Class A operations, and 10M Class B operations; those allowances are shared, not per Passage user. Other services connected to R2 may charge separately. [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).

For illustration, storing 1 MB total per passage means 1,000 retained passages occupy about 1 GB, costing **$0.015/month** before free allowance and billing rounding; 1M retained passages cost about **$15/month**. This includes only the assumed retained bytes. Originals, references, variants, and final cards multiply storage. Every retained cohort continues to cost money after creation and possibly after subscription cancellation.

Use Standard storage initially and immutable asset keys. Accepted Q17 leaves public R2 objects in place without MVP garbage collection. Source/account removal disables the affected Passage routes, while direct public R2 URLs can remain accessible. See the [accepted asset policy](ACCOUNTS_PAID_BRANDING_DESIGN.md). Store private brand references separately from public final images. Avoid routing every public image through an uncached Vercel function; R2's free egress does not waive other providers' charges. Public asset retention continues after cancellation or deletion; the reserve is not an infinite-duration cost guarantee.

## Historical calculations for the original price brainstorm

Exploratory assumptions: USD prices excluding tax, US domestic card processing, Stripe Billing pay-as-you-go, one monthly charge. Payments is 2.9% + $0.30 and Billing adds 0.7% of volume, giving **3.6% + $0.30** here. Country, card mix, currency conversion, tax products, and account pricing can change the result. [Stripe Payments](https://stripe.com/pricing), [Stripe Billing](https://stripe.com/billing/pricing).

Contribution margin here means `(revenue − payment/billing fees − variable service costs) / revenue`. It excludes fixed operating costs and acquisition costs. The 70–80% goals are exploratory, not an accepted business requirement.

| Monthly plan | Payment + Billing | Revenue after fees | All other variable-cost budget at 80% margin | At 70% margin |
| --- | --: | --: | --: | --: |
| Free | $0 | $0 | No positive-revenue margin; budget a subsidy | Same |
| Startup $8.99 | $0.62364 | $8.36636 | $1.17436 | $2.07336 |
| Professional $49.99 | $2.09964 | $47.89036 | $7.89836 | $12.89736 |

The following are **theoretical maximum image counts if all other service costs were zero**. They are not recommended plan allowances.

| Cost per accepted background | Startup at 80% / 70% | Professional at 80% / 70% |
| --- | --: | --: |
| $0.025 | 46 / 82 | 315 / 515 |
| $0.05 | 23 / 41 | 157 / 257 |
| $0.10 | 11 / 20 | 78 / 128 |
| $0.20 | 5 / 10 | 39 / 64 |

Actual allowance formula:

`floor(max(0, revenue × (1 − targetMargin) − fees − nonImageVariableCosts) / reservedCostPerBackground)`

The concurrent repository audit found default summary generation already incurs cost during preparation, before publication. Its **illustrative**, unmeasured 6,000-input/300-output-token example costs $0.001575. At 1,000 uncached preparations that is $1.575, leaving Startup at about **75.5% contribution before infrastructure and images**. At a 70% target, only $0.49836 remains for everything else; at 80%, the summary-only example already exceeds budget. Preparation, abandoned drafts, and regeneration need metering as well as published-link counts. See [Passage unit economics](PASSAGE_UNIT_ECONOMICS_2026-09.md) for repository evidence and text-model sources.

For Free, percentage margin is undefined because revenue is zero. Decide a dollar subsidy budget and creation/prepare limits, rather than describing Free as profitable. Anonymous creation needs abuse controls and global spend protection because there is no paid identity against which to enforce a subscription budget.

For annual plans, divide actual annual revenue by twelve and charge monthly allowances against that lower monthly revenue. Amortize the one transaction fee over twelve months. Discounts shrink service budgets. Grant credits monthly unless a deliberately costed upfront annual allowance is accepted.

## Original research questions (current decisions are in the working brief)

1. Whether Startup's 1,000 links means published links, preparations, or a cheaper shared/cached operation; what happens after either allowance is reached.
2. Whether paid image allowance buys attempts or successful generated backgrounds; how user rejection, provider failure, and automatic retry affect it.
3. Whether the initial brand style is text/palette only or includes uploaded reference images. A reference can improve consistency while increasing input cost.
4. Whether backgrounds are essential to the first paid release or a later milestone after auth, ownership, billing, uploads, and templates.
5. Which measured contribution target and free-user subsidy budget to enforce; what retention commitment survives cancellation.

An implementable minimal seam is a background-generation function with a versioned input recipe and output containing the asset, provider/model identity, actual usage, and request ID. Keep account entitlements, quota reservations, idempotency, job status, and R2 persistence outside the provider adapter. Reserve cost before starting jobs, reconcile actual use, cap simultaneous work and input sizes, and offer an explicit user-selected curated/uploaded fallback when generation is unavailable. These controls support predictable economics; they cannot make an absolute promise of never losing money on any account when refunds, disputes, persistent hosting, or provider pricing change.

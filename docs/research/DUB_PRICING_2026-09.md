# Dub pricing and packaging reference

Implementation authority: the [accounts and paid features handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) contains the accepted package and sequence: accounts first, a mandatory feedback stop, then billing and paid features. Historical recommendations below do not override it.

> Research verified September 14, 2026. These are dated competitor facts and planning hypotheses, not accepted Passage requirements. Current requirements remain in [MVP_PLAN.md](../MVP_PLAN.md).

## Current public plans

Use **Dub Links** as the comparator. The main pricing page now defaults to Dub Partners, its affiliate product. The live Links pricing page and its yearly toggle were inspected directly, including expanded FAQs. [Links pricing](https://dub.co/pricing/links), [Partners pricing](https://dub.co/pricing).

| Plan | Monthly billing | Annual equivalent/month | Annual total¹ | New links/month | Events/month | Analytics retention | Domains | Users |
| --- | --: | --: | --: | --: | --: | --- | --: | --: |
| Free | $0 | — | $0 | 25 | 1,000 | 30 days | 3 | 1 |
| Pro | $30 | $27 | $324 | 1,000 | 50,000 | 1 year | 10 | 3 |
| Business | $90 | $81 | $972 | 10,000 | 250,000 | 3 years | 100 | 10 |
| Advanced | $300 | $270 | $3,240 | 50,000 | 1,000,000 | 5 years | 250 | 20 |
| Enterprise | Custom annual | Custom | Custom | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

[Current pricing](https://dub.co/pricing/links). Prices shown in dollars. ¹Annual totals are calculated as displayed annual monthly equivalent × 12; taxes and negotiated pricing are outside this comparison.

Annual plans now receive **12 months of usage upfront**, with a **10% discount**. Pro therefore has 12,000 links and 600,000 events/year; Business 120,000/3,000,000; Advanced 600,000/12,000,000. This changed July 10, 2026. Old indexed pricing showing $25/$75/$250 annual equivalents or “two months free” is stale. [Dated announcement](https://dub.co/changelog/improved-yearly-pricing), [annual event quotas](https://dub.co/help/article/dub-analytics-limits).

## What the gates actually mean

- **Branding:** QR codes on Free retain Dub's logo. Pro permits both removing it and replacing it with a custom logo. Logos can be workspace-wide or overridden by domain, with the domain taking precedence. This is a direct example of reusable brand defaults. [QR branding](https://dub.co/help/article/custom-qr-codes).
- **Social previews:** Pro permits a custom image, title, and description; image uploads are limited to 1.5 MB, with 1200 × 630 recommended. Its documented AI feature creates title/description text from the source URL. This documentation does not establish that Dub includes content-specific generative background images. [Custom previews](https://dub.co/help/article/custom-link-previews).
- **Domains:** Even Free supports three custom domains. Pro adds a complimentary .link domain for one year. Do not confuse an externally registered domain with a logo-removal entitlement. [Domain limits](https://dub.co/help/article/how-to-add-custom-domain), [domain offer](https://dub.co/help/article/free-dot-link-domain).
- **Team and enterprise scope:** Dub bills each workspace separately, allows two Free workspaces, and treats a workspace as a team/organization. Passage should decide whether its payer owns a personal account or a team before copying this structure. [Workspace billing](https://dub.co/help/article/what-is-a-workspace).

## Limits and billing behavior

The live pricing FAQs say creation stops at the non-Enterprise link allowance; Enterprise may incur contracted overages. Monthly unused links do not carry forward, deletion does not refund usage, and quotas reset at the billing-period boundary. Cancellation takes effect after the paid period. [Expanded pricing FAQs](https://dub.co/pricing/links).

Event limits behave differently: links continue working and events keep being tracked, but analytics viewing is gated until upgrade. Dub currently does not charge event overages. Its documented anti-abuse rule prevents usage reset beyond 4× the Free allowance or 2× other plans. **Uncertainty:** that paragraph still says “monthly” despite the newer annual pool; do not assume the annual threshold behavior from it. [Analytics limits](https://dub.co/help/article/dub-analytics-limits).

Its 14-day paid-plan trial has separate caps: 100 links, 5,000 analytics events, five domains, and three teammates. One trial is allowed per workspace. Its guide says the card is charged when the trial ends unless canceled. This demonstrates feature access and usage allowance can be independent. [Trial terms](https://dub.co/help/article/free-trial).

Dub's billing guide exposes an “Adjust usage” option for links/events in addition to plan selection. Public base tiers therefore may not exhaust its purchasing options; this research did not enter authenticated checkout or verify additional usage prices. [Managing the subscription](https://dub.co/help/article/how-to-cancel-subscription).

## Implications for Passage — hypotheses to test

1. **Charge for distinct cost/value dimensions.** Separate new publications, text-summary work, image generations/regenerations, stored assets, and delivery. A link quota alone cannot cap an AI image bill if a user can repeatedly regenerate images for one link.
2. **Do not promise unlimited billable work at $49.99.** An unbounded variable cost cannot be guaranteed profitable at any finite subscription price. A generous link allowance with explicit AI credits and hard generation limits is compatible with predictable margins. “Unlimited” should describe a genuinely bounded-cost operation, or have clearly explained limits.
3. **Challenge the $8.99/1,000-link bundle.** At full usage that yields $0.00899 revenue per link before payment fees, text inference, storage, hosting, and support. This arithmetic does not prove it fails; it sets the maximum budget to validate with measured costs. Cached reuse and genuinely new AI work need separate accounting.
4. **Challenge the logo split.** Dub includes both logo removal and replacement at its first paid step. Charging $49.99 for avatar replacement alone needs evidence of willingness to pay. Multiple brand kits, reusable layouts, bulk workflows, and a meaningful AI allowance are stronger candidate differences. These are candidate value propositions, not accepted scope.
5. **Preserve published links at exhaustion.** Stop new expensive actions and offer upgrade or prepaid credits. Avoid making readers encounter billing failures. Define renewal, downgrade, image retention, paid-template edits, and watermark behavior for existing links explicitly.
6. **Annual billing need not imply annual AI credits.** Dub's annual pool fits fluctuating marketing traffic. Passage can bill annually while replenishing image credits monthly, if disclosed clearly. Upfront annual credits need a full-year cost budget and protection against burst spend.
7. **Free margin is not a percentage.** Free has zero subscription revenue, so gross-margin percentage is undefined; report expected dollar subsidy per active free user and total acquisition spend. Free or guest limits should include abuse protection and a spend ceiling.
8. **Keep the MVP's pricing page legible.** Start with three tiers and a short set of meaningful differences. Do not import domains, teams, partner payouts, retention tiers, or enterprise security solely because Dub has them. The user need and marginal cost must justify each dimension.

Open decisions: buyer persona; personal versus team ownership; guest/free quotas; what creates a chargeable publication; text/image credit semantics; first paid plan's branding rights; annual discount and replenishment schedule; lifetime asset obligations after cancellation; target contribution margin and support budget. These decisions should precede final plan prices and implementation entitlements.

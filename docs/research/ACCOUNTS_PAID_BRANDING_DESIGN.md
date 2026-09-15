# Accounts and paid branding: interview working brief

September 14, 2026. Working design for the requested expansion. Accepted decisions through Q28 and the revised image pack are recorded below. The user explicitly requested continuing the grilling interview until the implementation handoff is fully aligned. Application code remains unchanged. The concrete implementation handoff is [Accounts and paid features](../ACCOUNTS_PAID_FEATURES_PLAN.md); it supersedes older sequencing recommendations.

## Direction stated by the user

- Keep normal passage creation available without signup.
- Add accounts with Better Auth, Google and GitHub sign-in, and password login.
- Retain Next.js on Vercel, Neon PostgreSQL and Drizzle; use standard Stripe billing and Cloudflare R2 for durable assets.
- Sync current browser appearance preferences to an account; provide more advanced paid customization.
- The initial Startup/Professional price brainstorm was superseded by the accepted Free/Plus/Pro package below, with monthly and annual billing.
- Explore uploaded backgrounds, custom social templates, watermark removal/replacement, personal branding and content-dependent generated backgrounds that retain a consistent style.
- Use Dub as the primary pricing/packaging comparison. Understand costs and protect paid-user economics.
- Preserve Passage's accepted visual identity in account and billing flows.

## Accepted decisions — round one

The user explicitly accepted Q1–Q5.

1. **Account scope:** individual accounts and subscriptions. No team or collaboration features for the first launch.
2. **Password identity:** email/password, Google and GitHub sign-in. Display names are separate from authentication; no unique login username is required.
3. **After cancellation:** preserve branding and images on existing published passages; restrict future paid creation. Source removal still disables Passage reader and publication-image routes. The later Q17 clarification leaves standalone public R2 assets stored and accessible by their direct URLs.
4. **Economic promise:** use explicit AI summary-generation and image-generation allowances, with prepaid additional image capacity. Q15 supersedes publication-based quotas. Free requires a capped subsidy. The baseline allowances were accepted in round three, conditional on cost validation; contribution targets and the free AI subsidy were accepted in round two.
5. **Template scope:** customize approved layouts using colors, typography choices, backgrounds, logo/avatar and saved style references. No freeform canvas editor for this launch.

## Accepted decisions — round two

- **Q6, pricing direction:** the initial names and $8.99/$49.99 prices were brainstorming, not constraints. The user asked for a simple three-tier recommendation; the resulting package was accepted in round three.
- **Q7, branding surfaces:** customize social cards for this launch. Retain the Passage reader interface and original-source attribution. Custom domains and broader Dub-like customization are future scope.
- **Q8, account management:** accept account-owned passage history, deletion of one's own publications, secure carryover from the current new guest session, and a new URL for revised text/design rather than editing a published URL. Also support saved user templates that guide dynamic image generation for future passages. Legacy public URLs alone cannot prove ownership.
- **Q9, CLI and skill:** paid users can create passages using their account's default template and settings. The webapp is the main customization interface. Use a revocable credential and the same entitlement and usage rules across clients.
- **Q10, annual billing:** change the recommended discount to **20%**, charged upfront. Retain monthly allowance replenishment and no rollover of included monthly credits. Purchased-pack rules are recorded with the accepted revised pack below.
- **Q11, operating budgets:** target 80% contribution at expected usage and at least 70% in the supported full-allowance cost scenario. Start with a $25/month service-wide anonymous/free AI budget; reaching it pauses new uncached free generations while existing publications remain readable. This does not cap all storage or reader-serving costs.

## Accepted pricing baseline — cost validation required before sale

Keep the complete paid personal-branding feature set on both paid plans. Differentiate through summary and image generation capacity, with no teams, model picker or elaborate feature gates.

|                                                   | Free | Plus |  Pro |
| ------------------------------------------------- | ---: | ---: | ---: |
| Monthly price                                     |   $0 |  $10 |  $25 |
| Annual price, paid upfront                        |   $0 |  $96 | $240 |
| Annual equivalent per month                       |   $0 |   $8 |  $20 |
| AI summary generations per month                  |   25 |  100 |  300 |
| AI background generations per month               |    0 |   10 |   25 |
| Custom card branding, uploads and saved templates |   No |  Yes |  Yes |

Free accounts get the monthly allowance and synced curated appearance preferences. Guests retain basic creation with explicit guest/network limits; do not pretend a cookie or IP proves a unique person. Both paid plans include watermark removal/replacement and account defaults for browser/CLI/skill. Do not introduce a separate commercial saved-template quota initially; the accepted upload limits are 10 MB per file and 1 GB of active uploaded assets per paid account (Q27).

The annual prices implement exactly 20% off monthly billing. The user accepted all displayed prices and quantities as implementation targets, conditional on a cost/quality benchmark before sale. They are not live published commitments. Q15 removes the separate 2x preparation allowance and publication counter. A model using 100/300 summary generations, $0.003 per summary, $0.08 per image generation and $0.50/$1 in other variable reserves yields approximately 76%/77% full-use contribution on annual plans. These are budget assumptions, not measured costs; validate supported inputs, model quality and actual usage before selling allowances. See [updated economics](PASSAGE_UNIT_ECONOMICS_2026-09.md#current-generation-based-economics-after-q15).

## Accepted decisions — round three

- **Q12, pricing:** accept Free/Plus/Pro prices, annual prices and allowances as the implementation baseline; benchmark costs and quality before selling the plans. Paid plans share the same customization features.
- **Q13, exhausted image allowance:** pause creation when the selected template needs a new generated background but no generations remain. Offer a prepaid image pack or an explicit switch to an uploaded/curated background. The CLI returns a clear limit and billing link. No automatic overage charge or silent style fallback; existing publications remain readable.

## Accepted decisions — Q15–Q17

- **Generation quotas:** count actual new summary and image generations, including deliberate regeneration and work abandoned before publication. No separate monthly publication counter or hidden 2x preview allowance. Reusing a cached result, manual text editing, uploading an asset, rendering or publishing adds no generation charge. Summary and image balances stay separate; generating both consumes one of each. Deletion does not restore spent generations. Maintain ordinary endpoint abuse limits.
- **Guest access:** five generations per browser per month under the same generation-based rule, plus network abuse controls and the shared free AI budget. Guest history and generation usage carry into an account on signup. A browser/session is not a verified unique person.
- **Deletion and forks:** deleting an account cancels billing and makes its own Passage publications unavailable without removing other users' independent publications. Forks reuse reviewed text/source captures but apply the new sharer's permitted defaults; they do not copy another account's uploaded branding or private style references. Changing or deleting a saved template leaves earlier publications intact.
- **Public R2 assets:** keep the MVP simple and do not garbage-collect or delete public images on account deletion, cancellation or source removal. Reader and publication-image routes can become unavailable while standalone public R2 URLs remain accessible. Do not claim revocation of those object URLs. Private references remain access-controlled; public retention does not make private inputs public.

## Accepted revised image pack — benchmark required before sale

The user rejected $10 for 10 images as poor value and accepted the revised target of **$10 for 50 standard image generations**, with explicit purchase, monthly allowance used first, and no expiry for purchased units. Purchased balance survives cancellation and requires a paid subscription to use. Keep the previously proposed simple pack rules: no automatic purchase, no expiry, monthly units spent first, and paid-subscription eligibility. No pack has been created or sold.

At assumed US one-off card fees of $0.59 and a provisional $0.20 operating/retained-asset reserve per pack, full redemption permits a model cost of $0.0242 per generation for 80% contribution, or $0.0442 for 70%. At $0.02 per generation, the modeled margin is 82.1%; at $0.03 it is 77.1%; at $0.04 it is 72.1%. Those are cost scenarios, not measured provider bills. The benchmark must establish the supported quality and reference limits before selling this pack.

The previous $0.08 reserve assumed much more work per credit than a single standard generation. Deliberate user rerolls are separately metered and must not also be counted as free repeat images inside every credit's unit-cost estimate. Technical failures and uncertain provider completion still need bounded accounting and reconciliation. Reserve generation allowance before model work, prevent duplicate calls/debits with an idempotency key, and return allowance for requests definitively rejected before generation. Do not blindly retry uncertain work.

The newly affordable pack also warrants reassessing the included 10/25 image counts after the quality/cost benchmark; do not silently change the accepted subscription quantities. The benchmark should propose a coherent bundle rather than preserving weak image allowances merely to encourage upgrades.

Standard billing implementation defaults proposed for the final plan: cancellation/downgrade at period end; immediate prorated upgrade after confirmed payment, granting only the allowance difference without resetting used usage; failed renewal blocks new paid actions while preserving existing publications. Billing event processing and quota grants must be idempotent. Purchased-credit expiry/eligibility follows the accepted pack design rather than a library default.

A proposed saved template is a named set of approved layout/branding choices, image art direction and optional style reference. It selects a curated, uploaded or generated background. One template is the account default used by browser/CLI/skill; customization is managed primarily in the webapp. Template changes affect future creations, while a publication snapshots the chosen settings and accepted artwork. When generated mode is selected, creating a new background uses one generation allowance; an explicit reroll uses another. Reusing an existing result or publishing it does not generate an image again. Provider failures and duplicate requests require a separate bounded retry/reconciliation policy.

## Accepted decisions — Q18–Q23

The user explicitly accepted every recommendation in this round.

18. **Exact template controls:** start from the five existing card styles and retain their layout geometry. Expose three card colors (surface, text, accent), approved font pairings from bundled Inter/DM Sans/Newsreader fonts, and one branding slot showing Passage, nothing, or an uploaded logo/avatar with optional brand name. Derive secondary colors, rules and readability overlays. Preserve source attribution and remove Passage-specific wording in custom/unbranded modes. Arbitrary positioning and uploaded fonts are outside launch scope.
19. **Image style definition:** a short written art-direction field plus one optional private style-reference image. Passage derives the subject from the conversation. Each template selects curated, uploaded or generated artwork; uploaded backgrounds get simple crop positioning. Previewing an AI style is an explicit metered generation. No model training or advanced reference controls in the MVP.
20. **Generation experience:** show the card as soon as the text summary is ready, with a clear pending background state while imagery generates. Aim for the image to usually arrive within 60 seconds, subject to the benchmark. Require the selected generated image to be ready before publishing. Separate text and image regeneration actions; ordinary text/color edits do not automatically spend generation quota. Initial use of an account default configured for generated artwork invokes the selected generation workflow.
21. **Draft recovery:** automatically save account drafts so users can refresh, leave, or switch devices and resume without repeating already-completed paid work. Include drafts in My passages and retain until user deletion initially. This requires durable draft/job state but does not imply public R2 cleanup. Recovery across request loss is a technical acceptance condition; a browser-only loading state is insufficient.
22. **Failed generations:** reserve allowance at start and consume it when a usable generated result is available to the user, including unwanted aesthetic results and unpublished drafts. Restore allowance for definitive technical failure with no usable result; keep uncertain in-flight requests reserved until reconciled. Do not double-charge duplicate requests. Provider-billed failures still count toward internal cost/rate controls. Deliberate rerolls are new generations.
23. **Later evaluation budget:** allocate up to $20 for a controlled model/style benchmark at the relevant milestone after the interview and handoff are aligned. Compare a fixed conversation/style set across candidate configurations, recording actual usage, cost, latency and visual acceptance. Start with the existing OpenAI integration path; evaluate another provider only if needed within the agreed budget and available access. The spending allowance is accepted for that later milestone; no paid benchmark has run.

The template questions are grounded in source inspection: all five styles share TemplateCard's left-text/right-art geometry; the current public appearance schema contains only templateId. Existing fonts and styles can be parameterized through one shared resolution path for live preview, thumbnails and exported cards. Painted artwork does not recolor automatically when the user changes interface colors.

## Accepted decisions — Q24–Q28

The user accepted Q24–Q27 and explicitly changed the implementation sequence in Q28.

24. **Summary allowance exhaustion:** block only new uncached summary generations and deliberate summary rerolls. Keep cached reuse, existing drafts, manual edits and publication available within the account's feature entitlements. Offer signup/upgrade where applicable or the reset date; Pro waits for replenishment. Image packs do not buy summaries. Do not add summary packs or a new from-scratch manual preparation flow for this launch.
25. **Paid drafts after access ends:** retain unfinished drafts and generated results, but require an active paid subscription to publish a new passage with paid branding/backgrounds. Offer an explicit switch to Free curated appearance or resubscription, without silently mutating the saved paid design. A generation accepted while entitled may finish and save its output. Earlier paid publications retain their accepted presentation.
26. **Guest carryover on existing-account login:** import the current guest session's drafts, publications and current-period generation usage once on either signup or login. Preserve imported work even when combined usage exceeds allowance; then block further generation until replenishment. Existing account defaults take precedence, while an active draft retains its reviewed choices. Public URLs alone remain insufficient ownership evidence.
27. **Upload library bounds:** accept up to 10 MB per uploaded file and 1 GB of active custom uploads per account (backgrounds, logos/avatars, private references), shared across both paid tiers. No commercial saved-template count. Generated assets are governed separately by generation allowance. Removing an item can free library allowance while retained public publication assets stay in R2; this is an active-library bound, not a cap on all retained storage or a new public cleanup policy. Normalize accepted formats, dimensions and reference inputs using implementation/benchmark defaults.
28. **Release sequence and feedback gate:** implement accounts and related Free features first, then pause for user feedback. Only after explicit direction to proceed, implement billing and all other paid features immediately afterward in the same implementation plan. Do not run paid implementation lanes or the image benchmark before this gate. Paid launch remains conditional on complete integration and the accepted quality/cost benchmark.

## Interview closure and implementation sequence

The product frontier is settled through Q28. The [concrete handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) defines shared contracts, work packages, benchmark protocol, provisioning and acceptance criteria. It preserves two consecutive phases in one plan:

1. Implement accounts, guest ownership/carryover, saved drafts, history, synced curated preferences and Free generation limits.
2. Stop for feedback, apply it, and wait for explicit direction to continue.
3. Implement billing, R2/uploads, templates/branding, image evaluation/generation and authenticated CLI/skill. Parallelize within this phase after shared contracts are set.
4. Validate the complete paid experience and actual economics before public paid checkout.

Model quality, actual cost and production setup are later implementation gates, not unanswered interview questions. No application implementation or paid benchmark has begun.

The main application-specific work is ownership and quota enforcement, not authentication boilerplate. Current publications are globally deduplicated across people; generation costs arise before publishing; existing guest links contain no ownership evidence. Keep upstream source/snapshot reuse while designing unambiguous ownership of new account publications. Public readers remain accessible without authentication.

Use one image provider initially behind a narrow internal adapter. Generate artwork only, then compose text, branding and layout with the existing deterministic renderer. Store accepted assets in R2; source/account removal disables Passage routes while public objects remain, per Q17. Model selection remains contingent on evaluated quality, consistency, latency and actual billed cost.

## Evidence

- [Dub pricing and feature gates](DUB_PRICING_2026-09.md)
- [Passage unit economics and affordable-cost ceilings](PASSAGE_UNIT_ECONOMICS_2026-09.md)
- [Image models, reference inputs and R2 costs](IMAGE_GENERATION_ECONOMICS_2026-09.md)
- [Existing architecture and Better Auth/Stripe integration](ACCOUNTS_BILLING_ARCHITECTURE_2026-09.md)

The cost ceilings are scenarios, not measured margins. No new provider accounts, paid generation calls, subscriptions or production changes were made during this research.

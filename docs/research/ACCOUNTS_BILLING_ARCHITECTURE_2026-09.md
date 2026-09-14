# Accounts and billing architecture research

Implementation authority: the [accounts and paid features handoff](../ACCOUNTS_PAID_FEATURES_PLAN.md) contains the accepted package and sequence: accounts first, a mandatory feedback stop, then billing and paid features. Historical recommendations below do not override it.

Researched September 14, 2026. Findings and implementation proposals for the feature interview, not accepted product requirements. No application code, schema, or production state was changed. Pricing and model selection are separate research tracks.

Later interview decisions supersede the initial recommendations below: Q15 meters generations instead of publications, and Q17 retains public R2 objects without deletion while disabling affected Passage routes. See the [working brief](ACCOUNTS_PAID_BRANDING_DESIGN.md) for accepted decisions.

## Existing architecture that matters

- The app already uses Next.js 16, React 19, Drizzle, PostgreSQL through `postgres-js`, and Node 24. Better Auth and Stripe are not installed. The database client has a five-connection pool with prepared statements disabled; the production guide records pooled Neon runtime connections and direct migration connections. See [package.json](../../package.json), [database client](../../lib/db/index.ts), and [production guide](../PRODUCTION.md).
- Sources identify upstream public shares; snapshots cache normalized conversation content and generated summaries; publications fix reviewed text and appearance. Sources and snapshots have no owner, correctly reflecting that sharing a public conversation does not prove authorship. See [glossary](../CONTEXT.md) and [schema](../../lib/db/schema.ts).
- Publication identity is currently global: `publishPreview` hashes the snapshot, optional parent publication, reviewed text, appearance, and renderer version. The unique constraint is `(source_id, generation, fingerprint)`. Two strangers publishing identical presentations receive the same URL. Adding an owner column alone would leave ambiguous ownership and billing. Account-scoped publication identity or a separate ownership/presentation model must be selected first. Shared source/snapshot caching can remain. See [publish transaction](../../lib/service.ts#L405) and [publication constraint](../../lib/db/schema.ts#L175).
- Drafts use signed 24-hour bearer tokens containing snapshot, optional parent publication, generation, preview hash, and expiry. There is no identity or unique draft identifier. The browser stores only `templateId`, not drafts, history, or ownership receipts. Legacy public links therefore cannot prove which browser created them. See [draft tokens](../../lib/drafts.ts), [preferences](../../lib/card-preferences.ts), and [share flow](../../components/share-flow.tsx).
- Preparation incurs model cost before publication. Current hourly IP/client attempt budgets are separate from the publication transaction; they cannot serve as paid monthly success quotas. Existing atomic counters provide a useful pattern, but a monthly quota needs its own identity, reset rules, idempotency, and transactional consumption. See [prepare route](../../app/api/prepare/route.ts), [publish route](../../app/api/publish/route.ts), [rate limits](../../lib/db/rate-limit.ts), and [generation limits](../MVP_PLAN.md#implementation-and-limits).
- Forks preserve their parent's exact saved content, reviewed text, and appearance, while creating an independent publication identity. If paid artwork or branding is introduced, copying another person's paid assets through a fork needs an explicit rule. See [fork preparation](../../lib/service.ts#L74).
- Cards currently load checked-in artwork and render WebP on each public request. Exact historical image bytes are not stored. Public image routes check publication availability before rendering, and use `no-store` to preserve removal behavior. A directly public R2 URL could bypass that check. Persisting generated assets or complete rendered cards therefore requires an asset-serving/removal policy. See [renderer](../../lib/card.tsx), [image route](../../app/[provider]/[publicationId]/image/route.ts), and [availability rules](../MVP_PLAN.md#saved-content-and-availability).

## Verified library fit

Better Auth documents a Next.js App Router handler at `/api/auth/[...all]`, React client support, and server session checks. It explicitly supports Next.js 16. Cookie-presence checks are insufficient to authorize protected actions; the protected operation must validate the session. Server Actions that set cookies use its `nextCookies` integration. [Next.js integration](https://better-auth.com/docs/integrations/next).

Its current Drizzle adapter is provided by `@better-auth/drizzle-adapter`, supports `provider: 'pg'`, and generates the required auth schema. Keep Drizzle Kit as the migration workflow. No database or framework replacement is needed. Match the adapter to the installed Drizzle relation API rather than adopting Relations v2 incidentally. [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

Google and GitHub are built-in providers configured with client credentials and callback URLs. Google requires a correct configured base URL; GitHub requires access to the user's email. Production, local Portless, and preview callback/origin policies need configuration work. [Google](https://better-auth.com/docs/authentication/google), [GitHub](https://better-auth.com/docs/authentication/github).

Email/password is built in, but sending verification and reset emails is the application's responsibility. Requiring email verification is configurable; the email/password setting does not automatically gate social sign-in. Transactional email delivery is therefore an additional launch dependency. [Email/password](https://better-auth.com/docs/authentication/email-password).

Literal usernames are optional: the username plugin extends email/password login, still requires email at signup, and adds username fields and validation. Clarify whether “username/password” meant a unique login handle or ordinary email/password. [Username plugin](https://better-auth.com/docs/plugins/username).

Account linking is enabled by default for matching verified provider email. Explicit trusted-provider overrides can link without the verification assurance, so do not add those merely by copying an example. Linking can instead require explicit action from a signed-in user. Better Auth prevents unlinking the only login method by default; adding a password to an OAuth account uses a server operation or reset flow. [Accounts and linking](https://better-auth.com/docs/concepts/users-accounts).

The anonymous plugin creates an actual temporary user and session without a visible signup, then supplies an account-link callback for moving application data; application data migration is still our responsibility. It is one option if retaining guest history is accepted, not required merely to preserve today's account-free creation. It cannot retroactively establish ownership of existing anonymous links. [Anonymous plugin](https://better-auth.com/docs/plugins/anonymous).

The official Stripe plugin supports user or organization customers, monthly and annual prices, Checkout, Billing Portal, scheduled plan changes, subscription state, and lifecycle hooks. It supports one active/trialing subscription per billing reference; existing upgrades need the subscription ID to avoid duplicate billing. Its `limits` values are configuration, not a Passage usage ledger. Authorize billing references server-side. Account deletion does not by itself imply safe subscription cancellation; integrate the deletion policy. [Stripe plugin](https://better-auth.com/docs/plugins/stripe).

Stripe events can arrive out of order or more than once. Any application-side entitlement, quota grant, or credit grant triggered by a webhook needs idempotent processing and reconciliation with authoritative subscription state. Do not unlock paid functionality solely from a browser success redirect. [Stripe webhooks](https://docs.stripe.com/webhooks).

## Decisions the user must settle

| Decision | Why it blocks implementation | Initial recommendation for discussion |
| --- | --- | --- |
| Individual ownership or shared workspaces | Determines billing reference, asset ownership, brand permissions, and future transfer | Individual accounts unless team collaboration is part of the launch promise |
| Email/password or literal usernames | Unique handles create additional account and profile policy | Email/password plus Google/GitHub; add handles only for a concrete use |
| Guest continuity | Determines whether anonymous sessions/claim receipts are needed | Preserve creation without signup; decide separately whether newly created guest passages should join an account on signup |
| What accounts manage | History, deletion, published editing, and source authorship are different capabilities | Account-owned publication history is useful; do not silently introduce editing or claim source authorship |
| Branding controls | Uploads, saved presets, arbitrary templates, fonts, avatars, and reader branding have different scope | Structured presets on existing layouts; clarify card-only versus reader branding and number of saved brands |
| Downgrade and cancellation | Changes retention costs and whether existing shared cards change | Snapshot branding at publication and preserve it for existing passages; gate future paid actions |
| Monthly quota semantics | Publication attempts, successes, forks, AI rerolls, and uploads have different costs | Count successful new publications once; separately budget model attempts/rerolls and storage |
| Annual allowance reset | Annual billing does not define monthly included usage | Monthly usage windows even for annual subscribers, with explicit reset and rollover policy |
| Exhausted quota and failed payment | Determines blocking, upgrades, top-ups, grace, and ongoing publication serving | Existing links remain readable; decide creation grace and top-up policy |
| Paid CLI/agent use | Current CLI uses anonymous draft tokens, not browser sessions | Keep the current anonymous flow compatible; make authenticated CLI support an explicit milestone |
| Forking paid presentation assets | Current forks copy all appearance | Do not transfer private style references or another account's brand rights implicitly |
| Asset retention/removal | Unpublished generations, source removal, account deletion, and cancellation differ | Retain referenced publication assets; expire abandoned outputs; preserve source-disable checks on public serving |

## Proposed milestone seams

These are candidates to sequence after the interview confirms the decisions, not authorization to implement.

1. **Foundation contracts:** settle ownership, guest continuity, immutable publication presentation, billing reference, plan entitlements, quota units/reset rules, and asset identity. Assign one integrator to shared schema/migrations.
2. **Parallel after those contracts:**
   - **Accounts:** Better Auth, provider/email configuration, branded signup/login/reset UI, sessions, account preferences, ownership and optional guest linking.
   - **Billing and usage:** Stripe test products/prices, Checkout/Portal, subscription lifecycle, server entitlement checks, atomic publication quota and generation reservation accounting. UI depends on the shared account contract, not a finished auth screen.
   - **Assets and presentation:** R2 access layer, upload validation, immutable asset versions, structured brand presets, renderer inputs, appearance snapshot persistence, removal-aware serving. Use the existing visual comparison workflow before changing card output.
   - **Image evaluation:** compare candidate APIs on authored conversations and accepted style controls; record per-attempt cost, consistency, latency, retries, and supported inputs. This can start before auth/billing implementation.
3. **Paid image generation:** integrate the selected provider behind a narrow internal interface, record job/attempt state and provenance, reserve budget before incurring cost, save output in R2, and charge rerolls according to policy. User-facing model selection is a separate decision from an internal replaceable adapter.
4. **Release integration:** test cross-account authorization, duplicate/concurrent publishing and billing events, failed or abandoned generation, downgrade/cancellation, guest migration if selected, and source removal across reader/card/assets. Verify OAuth/email/Stripe test mode and production callback configuration, plus browser and exported-card visuals. Read the local installed Next.js guides before implementation and retain the existing test/build workflow.

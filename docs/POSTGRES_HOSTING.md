# Production Postgres recommendation

Researched September 11, 2026 against current first-party documentation. No hosted database has been provisioned for this project.

## Recommendation

Use **Neon Launch** for the public soft launch, with one production database beside the Vercel function region. Keep the existing `postgres` + Drizzle implementation. Neon Free is a good zero-cost option for deployment validation and staging; paid Launch avoids the Free tier's quota suspension and provides a longer restore window. This recommendation fits Passage's small, intermittent Postgres workload and lack of requirements for hosted auth, storage, or realtime services.

| Option | Current price and relevant limits | Fit |
| --- | --- | --- |
| Neon Free | $0; 100 CU-hours/project/month, 0.5 GB database storage, 5 GB transfer, six-hour restore history capped at 1 GB of changes. Compute/transfer exhaustion suspends the database until reset or upgrade. | Staging and a zero-dollar trial. |
| Neon Launch | No monthly minimum; $0.106/CU-hour, $0.35/GB-month of database storage, $0.20/GB-month of restore history. Up to seven days of restore history. | Recommended production starting point. |
| Supabase Free | $0; 500 MB database. Low-activity projects can pause after seven days, and automatic backups are unavailable. | Less convenient for public links that must remain available during quiet periods. |
| Supabase Pro | Starts at $25/month, including compute credit for one Micro database; seven days of daily backups. Point-in-time recovery is a separate add-on. | Reasonable if Supabase's broader services are useful to you. |

Sources: [Neon plans](https://neon.com/docs/introduction/plans), [Supabase pricing](https://supabase.com/pricing), [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Neon's older $5 minimum was removed in December 2025. Its older pricing articles also contain superseded compute rates; use the current plan table when checking out. [Pricing update](https://neon.com/blog/new-usage-based-pricing).

## A useful budget

An **illustrative**, light-usage month of 50 CU-hours, 1 GB of database data, and 0.5 GB of retained restore history costs about **$5.75** on Launch. A 0.25-CU database running continuously for 730 hours costs about **$19.35 in compute**, before storage/history. These are calculations from current rates, not measured traffic forecasts. Vercel, model usage, tax, and optional extras are separate. [Current rates](https://neon.com/docs/introduction/plans).

Start at 0.25 CU, leave scale-to-zero enabled, and choose a modest maximum such as 1 CU. Set a $10 or $20 spending notification and inspect usage during launch. Notifications currently send email at 80% and 100%; **they do not impose a hard dollar cap**. Per-project consumption quotas can stop compute, but that also stops the app's database-backed reader. [Scale to zero](https://neon.com/docs/introduction/scale-to-zero), [spending notifications](https://neon.com/docs/introduction/spending-notifications), [consumption limits](https://neon.com/docs/guides/consumption-limits).

## Minimal setup for this repository

1. Create one Neon production project directly or through the [Vercel Marketplace integration](https://vercel.com/marketplace/neon). Pick the same region as the Vercel Node.js functions. Keep preview/staging databases separate from production.
2. Put the TLS-enabled **pooled** connection string in the Vercel Production `DATABASE_URL`. Keep the existing bounded application pool and `prepare: false`; no driver migration is needed. [Neon pooling](https://neon.com/docs/connect/connection-pooling).
3. Use the **direct** connection for `pnpm db:migrate`. The migration config accepts `DIRECT_DATABASE_URL`, then Neon's `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. Apply the checked-in migrations once before serving traffic; run future migrations as an explicit release step, not from ordinary requests. [Pooling considerations](https://neon.com/docs/connect/connection-pooling).
4. Set the restore-history window to seven days on Launch, and verify a restore on an isolated branch. Keep migration/back-up credentials out of client bundles. [Neon restore](https://neon.com/docs/introduction/branch-restore).
5. Run the production journey and social checks in [the launch audit](LAUNCH_READINESS.md), including a first read after the database has been idle. Measure that wake-up latency before deciding whether to keep compute always running.

Vercel's former first-party Postgres product is no longer available for new databases; the current path is an external provider through Marketplace. [Vercel Postgres documentation](https://vercel.com/docs/postgres).

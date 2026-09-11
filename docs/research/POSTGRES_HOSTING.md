# Postgres hosting cheat sheet

> Hosting research as of September 11, 2026. Prices, provider terms, and setup observations below are dated evidence. Current scope and remaining gates live in [MVP_PLAN.md](../MVP_PLAN.md); operational setup lives in [PRODUCTION.md](../PRODUCTION.md).

Verified September 11, 2026 against current first-party documentation. Prices are USD/month before tax; Vercel, model calls, and optional extras are separate. Neon Free is now configured for this project; see [production setup](../PRODUCTION.md). Vercel creation remains deferred.

## Recommendation

**Start with Neon Free.** It fits Vercel's connection pattern and wakes automatically when someone opens a quiet public link. There is no need to start on paid Launch. **Prisma Postgres Free is the strongest alternative** if transfer or Neon's awake-time allowance becomes the constraint. When paying becomes necessary, compare **PlanetScale's $5 single-node plan** before automatically upgrading Neon: continuous light traffic can make Neon's usage pricing more expensive.

This revises the earlier paid-first recommendation to match the explicit priority: keep Passage free for as long as practical. A free tier is useful while its quotas and recovery limits fit; this is not a promise that today's provider terms will remain forever.

## Quick comparison

| Provider | Useful free allowance | First paid step | Main tradeoff for Passage |
| --- | --- | --- | --- |
| **[Neon](https://neon.com/docs/introduction/plans)** | 0.5 GB storage; 100 CU-hours and 5 GB transfer/month | Launch: usage-based, no minimum | Best default for Vercel. Free compute/transfer exhaustion stops access until reset or upgrade. |
| **[Prisma Postgres](https://www.prisma.io/pricing)** | 500 MB; **200k SQL operations/month**; unlimited DB transfer | **$10**: 10 GB, 1M operations | Strong free alternative. Operations are queries, not page views. No Free backups. |
| **[Aiven](https://aiven.io/pricing/postgresql)** | **1 GB** disk; network included; no trial expiry | **$5** Developer: 8 GB | More free storage, but no pooler, few connections, and Free can stop for inactivity. |
| **[Supabase](https://supabase.com/pricing)** | 500 MB database; 5 GB uncached transfer | **$25**: one Micro, 8 GB disk | Free can pause after low activity. Higher paid floor; broader services are currently unnecessary. |
| **[PlanetScale Postgres](https://planetscale.com/pricing.md)** | None | **$5**: 10 GB disk, 10 GB transfer | Best predictable paid candidate. Pooling/backups included; tiny CPU and no high availability at $5. |
| **[Railway](https://docs.railway.com/pricing)** | $1 of resources/month, after initial trial | **$5 minimum**, credited toward usage | Convenient, but ongoing RAM consumes credit; database template is unmanaged. |
| **[Render](https://render.com/pricing)** | 1 GB, **expires after 30 days** | **$6 compute**, plus billable storage/transfer | Paid option is reasonable; Free does not meet the long-term goal. |

These storage limits measure different things: allocated disk, logical database size, or provider-metered storage. Compare actual dashboard usage, not just transcript bytes.

## The limits that actually matter

**Neon meters awake time.** At 0.25 CU, 100 CU-hours buys about **400 active hours/month**, including the five-minute idle delay before sleeping. Requests spread throughout the day, including bots or health checks, can keep it awake even when each query is tiny. It resumes on a new connection. Free includes six hours of restore history, capped at 1 GB of changes. Running out of compute or transfer suspends access; exceeding storage blocks space-growing operations. [Plans](https://neon.com/docs/introduction/plans), [scale to zero](https://neon.com/docs/introduction/scale-to-zero).

On Launch, compute is $0.106/CU-hour, data $0.35/GB-month, and restore history $0.20/GB-month. A continuously awake 0.25-CU database for 730 hours costs **$19.35 in compute**, before storage/history. By contrast, an illustrative 50 CU-hours + 1 GB data + 0.5 GB history costs **$5.75**. Neither example predicts our traffic. Paid plans include 500 GB transfer/project/month, then $0.10/GB. Spending notifications are emails, not hard dollar caps. [Current rates](https://neon.com/docs/introduction/plans), [notifications](https://neon.com/docs/introduction/spending-notifications).

**Prisma meters operations.** The Free allowance doubled to 200k on August 28, 2026. With our existing driver, each SQL query is an operation, including a health-check query. A reader request performs a publication read and an availability-check transaction; images read separately. **200k operations is not 200k visits.** Current pricing and pooling docs disagree about the Free pooled connection ceiling (10 versus 50); verify the live limit before choosing it. Starter overages are $8/million operations and $2/GB storage. [Quota increase](https://www.prisma.io/changelog/2026-08-28), [query accounting](https://www.prisma.io/docs/postgres/faq), [pricing](https://www.prisma.io/pricing), [pooling](https://www.prisma.io/docs/postgres/database/connection-pooling).

**Aiven's main constraint is connections.** Free allows 20 total connections and no managed pooler. Developer also lacks pooling and has a similarly small ceiling; current docs disagree on 15 versus 20. Our five-connection pool is per Vercel instance, so it does not enforce a global five-connection limit. Free can be powered off after inactivity with notice; no exact interval is promised. Developer avoids inactivity shutdown. Both lack precise cloud/region choice and include a single disaster-recovery backup rather than selectable restore history. [Free limits](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier), [plan behavior](https://aiven.io/docs/platform/concepts/service-pricing), [connection limits](https://aiven.io/docs/products/postgresql/reference/pg-connection-limits), [backup scope](https://aiven.io/pricing/postgresql).

**Supabase needs manual attention after a quiet period.** Low activity over seven days can trigger pausing; the owner resumes it. Free has no automatic backups. Transaction pooling works with our driver; no Supabase SDK is required. Pro includes seven-day daily backups, with point-in-time recovery sold separately. [Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [backups](https://supabase.com/docs/guides/platform/backups), [connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

**PlanetScale provides a useful paid baseline.** PS-5 has 512 MiB RAM and 1/16 vCPU. Included PgBouncer supports Vercel; direct connections support migrations. Backups run every 12 hours with two-day default retention, plus point-in-time recovery. Included backup/WAL storage equals twice allocated disk. In US East, excess disk is $0.125/GB-month and excess transfer $0.06/GB; extra branches, backup storage, or dedicated poolers can add cost. The $5 plan is single-node; PS-5 high availability starts at $15. [Live catalog](https://planetscale.com/pricing.md), [pricing rules](https://planetscale.com/docs/postgres/pricing), [connections](https://planetscale.com/docs/postgres/connecting/quickstart), [backups](https://planetscale.com/docs/postgres/backups).

**Railway and Render are weaker free choices.** At Railway's $10/GB-month RAM rate, a database averaging 0.25 GB RAM alone consumes about $2.50/month, before CPU/storage. The actual idle footprint requires measurement. Public connections from Vercel incur egress, and the template leaves configuration/maintenance to us. Render's free database becomes inaccessible after 30 days and is deleted after a further 14-day grace period unless upgraded; it has no backups. [Railway pricing](https://docs.railway.com/pricing), [database responsibilities](https://docs.railway.com/databases/postgresql), [Render free limits](https://render.com/docs/free).

## Keep this application cheap

- Keep text/metadata in Postgres. Current messages contain typed omissions, not stored media binaries; social PNGs are rendered on demand. Put future image/audio/video files outside Postgres.
- Reuse snapshots across publications and styles. Storage grows with distinct captured content, not every share URL. The eight current local snapshots average about **9 KB of message JSON**; that sample is too small for a reliable capacity forecast. As an illustration, 500 MB / 50 KB is roughly 10,000 captures before other columns, indexes, history, and overhead.
- Measure compute/operations, database size, and outbound transfer after launch. Avoid keep-awake pings on metered free services. Reader and image traffic currently reach the DB; the image lookup also fetches the full transcript. A narrower image query is a future optimization if transfer becomes material.
- Keep the existing `postgres` + Drizzle stack. Every option above supports ordinary PostgreSQL connections. Prisma Postgres does not require adopting Prisma ORM. Select a pooled runtime endpoint where available and keep migrations on a suitable direct/session connection.
- Stay free while quotas fit. Before a paid upgrade, compare observed usage against the $5 PlanetScale baseline, including migration effort. Keep a backup outside the chosen service and verify restoration; free plans have limited or absent recovery history.

## Minimal Neon setup

1. Create one Free production project near the Vercel function region, directly or through [Vercel Marketplace](https://vercel.com/marketplace/neon). Keep preview/staging data separate.
2. Put the TLS-enabled pooled URL in Production `DATABASE_URL`. Keep the existing bounded pool and `prepare: false`. [Pooling](https://neon.com/docs/connect/connection-pooling).
3. Apply checked-in migrations using the direct URL. The config accepts `DIRECT_DATABASE_URL`, then `DATABASE_URL_UNPOOLED`, then `DATABASE_URL`. Run migrations explicitly, not from requests.
4. Verify backup/restore appropriate to Free's six-hour window and retain an independent dump. If longer managed recovery is required, include that in the paid comparison.
5. Run [the production journey and social checks](../archive/LAUNCH_READINESS.md), including the first visit after idle. Watch actual usage before changing plans.

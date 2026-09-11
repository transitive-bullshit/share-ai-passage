# Production database and local testing

Neon is configured. Vercel project creation is intentionally deferred until branding is settled.

## Current database

| Setting | Value |
| --- | --- |
| Project | [passage / wild-moon-12089892](https://console.neon.tech/app/projects/wild-moon-12089892) |
| Plan | Free |
| Branch | `production` (default) |
| Database / role | `neondb` / `neondb_owner` |
| Region | AWS `us-east-2` (Ohio) |
| PostgreSQL | 18 |
| Production compute | Fixed 0.25 CU, approximately 1 GB RAM |
| Idle behavior | Sleeps after five idle minutes; wakes on demand |
| Recovery history | Six hours, subject to the Free plan's history limit |

The checked-in migrations have been applied. Runtime connections use the pooled endpoint; migrations use the direct endpoint. Both endpoints point to this same branch/database. Credentials are in ignored `.env.prod.local` with owner-only file permissions. The file has a separate stable production `APP_SECRET` and the configured OpenAI key/model; it is never needed by ordinary development or tests.

## Commands

Run these from the repository:

| Command | What it does |
| --- | --- |
| `pnpm dev` | Ordinary development with the existing local PostgreSQL configuration and Portless URL. |
| `pnpm dev:prod` | Development server at `http://localhost:3001`, connected to **real production Neon data**. |
| `pnpm build:prod` | Builds the production app into `.next-prod` using the explicit production configuration. |
| `pnpm start:prod` | Serves that build at `http://localhost:3001`, connected to **real production Neon data**. |
| `pnpm db:check:prod` | Checks the pooled connection and application-table presence without reading conversations. |
| `pnpm db:migrate:prod` | Applies pending checked-in migrations using the production direct connection. |

For the closest local match to the deployed application:

```sh
pnpm db:check:prod
pnpm build:prod
pnpm start:prod
```

Then open [localhost:3001](http://localhost:3001). Stop that server before using `dev:prod` on the same port. To use another port, pass `--port 3101` to the app commands; use the same port for build and start.

The `:prod` commands print the database host and a production-data notice. Creating, publishing, or checking a conversation through that local server changes the real production database. Local links correctly use localhost; these records will use the future public domain when served by the deployed app. Publications store IDs and content rather than a permanently fixed host.

The wrapper forces the local origin and disables forwarded-header trust. Production app output is separate from `.next`, so normal development/build artifacts remain independent. Next may still list `.env.local` in its startup banner; the explicit production values are already in the child process environment and take precedence. `.env.prod.local` itself is not one of Next's automatically loaded filenames.

## On another machine

Copy `.env.prod.example` to `.env.prod.local` and fill its values from the Neon connection panel and the production application configuration. Use the pooled URL for `DATABASE_URL`, the matching direct URL for `DIRECT_DATABASE_URL`, and preserve the existing production `APP_SECRET`. Values are literal; shell-style variable references are not expanded. Keep the file private and out of Git.

Do not put the production URL in `TEST_DATABASE_URL`. The test suite uses a disposable local database, and the explicit production wrapper refuses to execute in CI/test environments. Unit tests do not load `.env.prod.local` or call the model.

## Before public deployment

- Choose the brand/domain and create Vercel only when requested. Configure the actual public `APP_URL` there, alongside the pooled `DATABASE_URL`, stable `APP_SECRET`, and OpenAI settings. Keep the direct migration credential in the release environment. Do not use localhost as the hosted origin.
- Place Vercel's Node.js functions near the Ohio database. Keep preview deployments on separate data unless an explicit production test is intended.
- Free's six-hour restore history is limited. Arrange an independent backup and verify restoration before inviting a public audience. Logical dumps of this PostgreSQL 18 server need `pg_dump` 18 or newer; the current local Postgres.app client is 17.4. No scheduled backup or off-site restore is configured yet.
- Run the remaining hosted extraction and real social-unfurl checks in [the launch audit](LAUNCH_READINESS.md). A local production build with a remote database does not exercise Vercel's runtime or network.

For quotas and paid alternatives, see [the hosting comparison](POSTGRES_HOSTING.md).

# Summary generation reconciliation

Use an explicit `DATABASE_URL` for the intended environment. Commands do not load production configuration and report operational IDs, ages and cost/usage counters without private conversation text. Image execution and reconciliation were removed; historical image rows remain audit data.

```sh
pnpm reconcile:summary status <operation-uuid>
pnpm reconcile:summary list-stale --older-than-minutes 30 --limit 50
```

Repair unknown summary outcomes/costs only from definitive provider evidence using the summary command's help. Unknown costs retain estimated liability; never invent a zero charge, erase operations or rewrite known costs to lift a pause. Confirmed technical failure restores customer allowance once; billed failures still count toward spending.

## Per-account AI spending protection

`AI_SPEND_LIMIT` (HTTP 429) means the next summary reservation would exceed monetary headroom. It does not debit a generation, delete saved work or prevent publication. Exact request replay remains recoverable. Pending or unknown charges retain liability.

```sh
pnpm reconcile:billing status <account-id>
```

The read-only command reports `aiSpending.subscription` with `limitMicros`, `liabilityMicros` and the anchored monthly `resetAt`; it is null without paid access. Summaries consume this budget; image-credit funding no longer exists. Settlement can restore headroom before reset. Service-wide and per-account protections coexist; Preview uses a tighter service-wide summary limit.

## Aggregate operations check and optional digest

```sh
pnpm reconcile:operations check
pnpm reconcile:operations check --notify <operator-email> --apply
```

Set `DATABASE_URL` explicitly; neither command loads environment files. The default check takes one read-only database snapshot and emits aggregate JSON: exit **0** when healthy, **1** when action is needed, or **2** if the check or requested notification fails. Output excludes account/operation IDs, recipients, private content, object URLs and credentials. It never repairs a ledger or calls a generation provider.

The check reports:

- Summary operations older than 30 minutes that remain unresolved, plus a separate count of terminal operations with unknown costs. Creation time determines age; status polling does not postpone an alert.
- Unprocessed billing events with a recorded failure immediately, other unprocessed events after 30 minutes, and closing accounts whose cancellation is incomplete after 30 minutes. Processed events and completed cancellations are excluded.
- Current UTC-month Free service budget that cannot accept the next configured reservation, including outstanding liabilities. No provider credentials are required for inspection.
- Known actual summary charges greater than their accepted reservation, for operations created in the current UTC month only. This specific cost-overrun signal is not comprehensive anomaly detection; historical overruns age out without rewriting their costs.

`--notify` requires both `--apply` and the existing `RESEND_API_KEY` plus `RESEND_FROM_EMAIL` (or `EMAIL_FROM`). It reuses account email's sender/reply-to and sanitized delivery handling. Healthy reports send nothing. Actionable reports send one bounded text digest and retain exit 1 after provider acceptance; acceptance is not proof of inbox delivery. Missing notification configuration fails without echoing the address. No actual operator recipient or schedule is configured by this implementation.

Repeated identical reports for the same UTC day, target fingerprint and normalized recipient use identical message bodies and Resend idempotency keys. Changing the day, report, target or recipient produces a new key. Resend retains keys for 24 hours; this is retry deduplication, not a permanent notification history. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Use the existing status/list commands to inspect affected operations and failed events. For closing cancellations, inspect the retained `billing_accounts` closing markers in the selected database, then use `pnpm reconcile:billing cancel-closing <account-id> --apply` with the intended Stripe configuration. Investigate cost overruns and budget exhaustion before changing limits; resolve unknown costs only from definitive evidence. Scheduling, an operator-selected destination and actual delivery verification remain separate setup steps; this command installs no scheduler, HTTP endpoint or cloud setting.

## Daily private-asset cleanup

The owner approved recurring cleanup for development/testing on September 15. `vercel.json` declares `GET /api/cron/cleanup-assets` daily at 04:00 UTC. Vercel invokes schedules only on production deployments, so Preview testing does not activate the schedule. Configure the normal server-only `CRON_SECRET` for the intended deployment; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`. [Vercel Cron setup](https://vercel.com/docs/cron-jobs/quickstart), [Cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)

The Node route has a 60-second maximum duration. It rejects missing, blank or inexact authorization before importing the cleanup service. Authorized requests call `cleanupPrivateAssets(100)` once and return only `examined`, `cleaned`, `skipped` and `failed`, with private/no-store and noindex headers. Unauthorized requests return 401; partial cleanup failure or a sanitized service exception returns 503. The existing service skips overlapping runs and preserves public cards, protected private inputs, accepted active jobs and unexpired upload/processing permissions.

For manual catch-up, use `pnpm cleanup:assets --apply --limit 100` with explicit database/R2 settings. Neither the route's fixture tests nor this source configuration prove a deployed schedule or a successful real cleanup. Deployment, secret configuration and runtime verification remain separate steps; the operations email digest above has no schedule attached.

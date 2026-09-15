# Generation reconciliation

Use an explicit `DATABASE_URL` for the intended environment. These commands do not load `.env` or production configuration. Status/list output contains only operational IDs, timestamps expressed as ages, request IDs and cost/usage counters. Paid summary operations correctly report `null` Free-budget fields.

```sh
pnpm reconcile:summary status <operation-uuid>
pnpm reconcile:summary list-stale --older-than-minutes 30 --limit 50
pnpm exec tsx scripts/reconcile-image.ts status <operation-uuid>
pnpm exec tsx scripts/reconcile-image.ts list-stale --older-than-minutes 30 --limit 50
```

Image `list-stale` filters and orders by operation creation time, so status polling cannot hide an old unresolved job or unknown charge. `inactiveMinutes` remains a separate diagnostic; recent operations and terminal operations with known costs are excluded.

Image recovery uses the existing explicit R2 configuration to verify and recover the operation's immutable object. It can settle a valid saved result and apply it only under the existing draft-revision rules. It never submits a provider request or blindly retries generation. Missing objects/timeouts remain uncertain, not proof of failure.

```sh
pnpm exec tsx scripts/reconcile-image.ts recover <operation-uuid> --apply
pnpm exec tsx scripts/reconcile-image.ts fail <operation-uuid> --evidence /private/evidence.json --apply
pnpm exec tsx scripts/reconcile-image.ts cost <operation-uuid> --evidence /private/evidence.json --apply
```

Failure evidence must be definitive. An unwanted aesthetic result still consumes a credit. Keep evidence files private, at most 64 KiB, with exactly:

```json
{
  "action": "fail",
  "operationId": "38036029-4971-4c94-98a1-3cf08a19d141",
  "evidence": "Provider support confirmed no usable result for the recorded request.",
  "actualCostMicros": null
}
```

Use `null` only when final provider cost is unknown; that liability stays reserved. `cost` requires a final nonnegative integer amount in USD micros and a terminal outcome; it fills an unknown cost, never overwrites a known one. Include actual billed failures even when customer credits are refunded. Existing token usage is retained. A conflicting terminal outcome is not overwritten. There is no image `succeed` command: success requires a verified durable object.

## Per-account AI spending protection

`AI_SPEND_LIMIT` (HTTP 429, retry after 60 seconds) means the next reservation would exceed the account's monetary headroom. It does not debit a generation, delete saved work or prevent publication. Exact operation replay remains available. Pending or unknown charges retain their reservations; definitive billed failures count even when customer units are restored.

```sh
pnpm reconcile:billing status <account-id>
```

This read-only command reports `aiSpending.subscription` and `aiSpending.purchasedImages`, with `limitMicros` and `liabilityMicros` in USD micros. The subscription bucket also reports `resetAt`; it is null when paid access is unavailable. Summaries and included images share the original anchored month. Purchased images use lifetime pack funding, reduced by refunds/disputes without erasing historical charges. New paid packs add funding; that pool has no monthly reset. Exact ceilings and assumptions are in [measured economics](research/PHASE2_MEASURED_ECONOMICS.md#supported-cost-bounds).

Inspect the operation status and reconcile unknown costs only from definitive provider evidence using the commands above. Normal settlement may restore headroom before a monthly reset. Late image metering can fill a recovered terminal operation's unknown cost under the same account lock; it never replaces a known charge, changes the result or debits/refunds another unit. Never invent a zero charge, clear operation rows, or rewrite known costs to lift a pause. These controls limit admission; they cannot cap a provider's first charge or guarantee all hosting and retention costs.

## Aggregate operations check and optional digest

```sh
pnpm reconcile:operations check
pnpm reconcile:operations check --notify <operator-email> --apply
```

Set `DATABASE_URL` explicitly; neither command loads environment files. The default check takes one read-only database snapshot and emits aggregate JSON: exit **0** when healthy, **1** when action is needed, or **2** if the check or requested notification fails. Output excludes account/operation IDs, recipients, private content, object URLs and credentials. It never repairs a ledger or calls a generation provider.

The check reports:

- Summary/image operations older than 30 minutes that remain unresolved, plus a separate count of terminal operations with unknown costs. Creation time determines age; status polling does not postpone an alert.
- Unprocessed billing events with a recorded failure immediately, other unprocessed events after 30 minutes, and closing accounts whose cancellation is incomplete after 30 minutes. Processed events and completed cancellations are excluded.
- Current UTC-month Free and image service budgets that cannot accept the next configured reservation, including outstanding liabilities. Disabled image generation does not raise an exhausted-image-budget alert. No provider credentials are required for inspection.
- Known actual summary/image charges greater than their accepted reservation, for operations created in the current UTC month only. This specific cost-overrun signal is not comprehensive anomaly detection; historical overruns age out without rewriting their costs.

`--notify` requires both `--apply` and the existing `RESEND_API_KEY` plus `RESEND_FROM_EMAIL` (or `EMAIL_FROM`). It reuses account email's sender/reply-to and sanitized delivery handling. Healthy reports send nothing. Actionable reports send one bounded text digest and retain exit 1 after provider acceptance; acceptance is not proof of inbox delivery. Missing notification configuration fails without echoing the address. No actual operator recipient or schedule is configured by this implementation.

Repeated identical reports for the same UTC day, target fingerprint and normalized recipient use identical message bodies and Resend idempotency keys. Changing the day, report, target or recipient produces a new key. Resend retains keys for 24 hours; this is retry deduplication, not a permanent notification history. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Use the existing status/list commands to inspect affected operations and failed events. For closing cancellations, inspect the retained `billing_accounts` closing markers in the selected database, then use `pnpm reconcile:billing cancel-closing <account-id> --apply` with the intended Stripe configuration. Investigate cost overruns and budget exhaustion before changing limits; resolve unknown costs only from definitive evidence. Scheduling, an operator-selected destination and actual delivery verification remain separate setup steps; this command installs no scheduler, HTTP endpoint or cloud setting.

# Generation reconciliation

Use an explicit `DATABASE_URL` for the intended environment. These commands do not load `.env` or production configuration. Status/list output contains only operational IDs, timestamps expressed as ages, request IDs and cost/usage counters. Paid summary operations correctly report `null` Free-budget fields.

```sh
pnpm reconcile:summary status <operation-uuid>
pnpm reconcile:summary list-stale --older-than-minutes 30 --limit 50
pnpm exec tsx scripts/reconcile-image.ts status <operation-uuid>
pnpm exec tsx scripts/reconcile-image.ts list-stale --older-than-minutes 30 --limit 50
```

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

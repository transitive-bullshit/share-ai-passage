import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { asc, eq, isNull } from 'drizzle-orm'

import { requireReconciliationDatabase } from './reconcile-summary'

const help = `Billing reconciliation:
  status <account ID>
  failed-events [--limit 50]
  refresh <account ID> --apply
  cancel-closing <account ID> --apply

Set DATABASE_URL explicitly. Environment files are never loaded.
refresh retrieves authoritative Stripe payment state; it accepts no asserted plan.
cancel-closing retries cancellation only for an account already marked closing.
Mutations require explicit Stripe credentials and --apply. No invoice is created.
Replay failed event IDs through Stripe's signed webhook delivery tooling.`

class BillingCommandError extends Error {}
type BillingCommand =
  | { action: 'help' }
  | { action: 'failed-events'; limit: number }
  | { action: 'status' | 'refresh' | 'cancel-closing'; userId: string }

export function parseBillingArgs(args: string[]): BillingCommand {
  let parsed
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean' },
        apply: { type: 'boolean' },
        limit: { type: 'string' }
      }
    })
  } catch {
    throw new BillingCommandError('Invalid arguments. Run with --help.')
  }
  if (parsed.values.help || args.length === 0)
    return { action: 'help' as const }
  const [action, userId, ...extra] = parsed.positionals
  if (extra.length) throw new BillingCommandError('Supply one account ID.')
  if (action === 'failed-events') {
    const limit = Number(parsed.values.limit || 50)
    if (
      userId ||
      parsed.values.apply ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw new BillingCommandError(
        'failed-events is read-only; choose a limit of 1–200.'
      )
    return { action, limit }
  }
  if (
    !['status', 'refresh', 'cancel-closing'].includes(action || '') ||
    !userId ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(userId) ||
    parsed.values.limit
  )
    throw new BillingCommandError(
      'Choose status, refresh, or cancel-closing with one account ID.'
    )
  if (action === 'status') {
    if (parsed.values.apply)
      throw new BillingCommandError('status is read-only.')
    return { action, userId }
  }
  if (!parsed.values.apply)
    throw new BillingCommandError('Billing changes require --apply.')
  return { action: action as 'refresh' | 'cancel-closing', userId }
}

export async function runBillingReconciliation(args: string[]) {
  const command = parseBillingArgs(args)
  if (command.action === 'help') return help
  requireReconciliationDatabase(process.env.DATABASE_URL)
  const { getDb, closeDatabase } = await import('../lib/db')
  const { billingAccounts, billingEvents } = await import('../lib/db/schema')
  try {
    if (command.action === 'failed-events') {
      const events = await getDb()
        .select({
          id: billingEvents.id,
          type: billingEvents.type,
          receivedAt: billingEvents.receivedAt,
          attempts: billingEvents.attempts,
          lastError: billingEvents.lastError
        })
        .from(billingEvents)
        .where(isNull(billingEvents.processedAt))
        .orderBy(asc(billingEvents.receivedAt))
        .limit(command.limit)
      return JSON.stringify(events, null, 2)
    }
    const [account] = await getDb()
      .select()
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, command.userId))
    if (!account)
      throw new BillingCommandError(
        'Billing account not found in the selected database.'
      )
    if (command.action !== 'status') {
      const { billingConfiguration, getStripe } =
        await import('../lib/billing-config')
      getStripe()
      const { reconcileBillingAccount, cancelAccountSubscriptions } =
        await import('../lib/billing-reconciliation')
      if (command.action === 'refresh') {
        if (account.closingAt)
          throw new BillingCommandError(
            'This account is closing. Use cancel-closing to retry its cancellation.'
          )
        if (!billingConfiguration().configured)
          throw new BillingCommandError(
            'Configure the Stripe webhook secret and all plan price IDs before refreshing billing.'
          )
        await reconcileBillingAccount(command.userId)
      } else {
        if (!account.closingAt)
          throw new BillingCommandError(
            'Only an account already marked closing can be cancelled by this command.'
          )
        await cancelAccountSubscriptions(command.userId)
        const { lockUsageSubjects } = await import('../lib/usage')
        const { accountSubject } = await import('../lib/accounts')
        await getDb().transaction(async (tx) => {
          await lockUsageSubjects(tx, accountSubject(command.userId))
          await tx
            .update(billingAccounts)
            .set({ cancellationCompletedAt: new Date(), updatedAt: new Date() })
            .where(eq(billingAccounts.userId, command.userId))
        })
      }
    }
    const [saved] = await getDb()
      .select({
        userId: billingAccounts.userId,
        status: billingAccounts.status,
        paidPlan: billingAccounts.paidPlan,
        paidThrough: billingAccounts.paidThrough,
        allowanceAnchorAt: billingAccounts.allowanceAnchorAt,
        reconciledAt: billingAccounts.reconciledAt,
        closingAt: billingAccounts.closingAt,
        cancellationCompletedAt: billingAccounts.cancellationCompletedAt
      })
      .from(billingAccounts)
      .where(eq(billingAccounts.userId, command.userId))
    return JSON.stringify(saved, null, 2)
  } finally {
    await closeDatabase()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runBillingReconciliation(process.argv.slice(2))
    .then((output) => console.log(output))
    .catch((err: unknown) => {
      console.error(
        err instanceof BillingCommandError
          ? err.message
          : 'Billing reconciliation did not finish. Inspect status before retrying; no invoice was created.'
      )
      process.exitCode = 1
    })
}

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import {
  ReconciliationError,
  requireReconciliationDatabase
} from './reconcile-summary'

const help = `Operations check:
  pnpm reconcile:operations check
  pnpm reconcile:operations check --notify <operator-email> --apply

Set DATABASE_URL explicitly. No environment files or production configuration are loaded.
Default: read-only aggregate JSON and exit 1 when actionable, exit 0 when healthy.
Failed check or email delivery: sanitized JSON and exit 2.
--notify requires --apply and existing Resend configuration; healthy reports never send.
No scheduler, provider generation, repairs or public endpoint is installed.`

type Command = { action: 'help' } | { action: 'check'; notify?: string }

export function parseOperationsArgs(args: string[]): Command {
  let parsed
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean' },
        notify: { type: 'string' },
        apply: { type: 'boolean' }
      }
    })
  } catch {
    throw new ReconciliationError('Invalid arguments. Run with --help.')
  }
  const { values, positionals } = parsed
  if (values.help || args.length === 0) return { action: 'help' }
  if (positionals.length !== 1 || positionals[0] !== 'check')
    throw new ReconciliationError('Choose check, with no positional values.')
  if (values.notify !== undefined) {
    const destination = z
      .email()
      .max(254)
      .safeParse(values.notify.trim().toLowerCase())
    if (!destination.success || values.apply !== true)
      throw new ReconciliationError(
        'Notifications require a valid single operator email and --apply.'
      )
    return { action: 'check', notify: destination.data }
  }
  if (values.apply)
    throw new ReconciliationError(
      '--apply is only valid with --notify <operator-email>.'
    )
  return { action: 'check' }
}

export async function runOperationsReconciliation(args: string[]) {
  const command = parseOperationsArgs(args)
  if (command.action === 'help') return { output: help, exitCode: 0 }
  requireReconciliationDatabase(process.env.DATABASE_URL)
  if (command.notify) {
    const { isEmailConfigured } = await import('../lib/email')
    if (!isEmailConfigured())
      throw new ReconciliationError(
        'Notifications require existing RESEND_API_KEY and RESEND_FROM_EMAIL or EMAIL_FROM configuration.'
      )
  }
  const { closeDatabase } = await import('../lib/db')
  try {
    const { readOperationsReport, operationsDigest } =
      await import('../lib/operations')
    const report = await readOperationsReport()
    let notification: 'accepted' | 'skipped_healthy' | undefined
    if (command.notify && report.status === 'action_required') {
      const url = new URL(process.env.DATABASE_URL!)
      const digest = operationsDigest(report, url.host + url.pathname)
      const { sendOperationsEmail } = await import('../lib/email')
      await sendOperationsEmail({ to: command.notify, ...digest })
      notification = 'accepted'
    } else if (command.notify) notification = 'skipped_healthy'
    return {
      output: JSON.stringify({ ...report, notification }, null, 2),
      exitCode: report.status === 'action_required' ? 1 : 0
    }
  } finally {
    await closeDatabase()
  }
}

export function operationsErrorOutput(error: unknown) {
  return JSON.stringify({
    status: 'check_failed',
    error:
      error instanceof ReconciliationError
        ? error.message
        : 'Operations check or requested notification did not finish. No repair or provider generation was attempted.'
  })
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runOperationsReconciliation(process.argv.slice(2))
    .then(({ output, exitCode }) => {
      console.log(output)
      process.exitCode = exitCode
    })
    .catch((err: unknown) => {
      console.error(operationsErrorOutput(err))
      process.exitCode = 2
    })
}

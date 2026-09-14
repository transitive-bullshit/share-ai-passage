import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const usage = `Private asset cleanup:
  pnpm exec tsx scripts/cleanup-assets.ts --apply [--limit 50]

Set DATABASE_URL and R2 credentials explicitly; no environment files are loaded.
--apply is required. Each run examines at most 1–100 queued/expired records.
Public cards and inputs retained by saved work are never deleted.
Active generation jobs and unexpired upload/processing leases are skipped.
A scheduler is not installed; repeat this command after queued jobs are reconciled.`
class AssetCleanupError extends Error {}
type Command = { action: 'help' } | { action: 'apply'; limit: number }
export function parseAssetCleanupArgs(args: string[]): Command {
  let values
  try {
    values = parseArgs({
      args,
      options: {
        help: { type: 'boolean' },
        apply: { type: 'boolean' },
        limit: { type: 'string' }
      }
    }).values
  } catch {
    throw new AssetCleanupError('Invalid arguments. Run with --help for usage.')
  }
  if (values.help || args.length === 0) return { action: 'help' }
  if (!values.apply)
    throw new AssetCleanupError(
      'Cleanup requires --apply. No objects were deleted.'
    )
  const raw = values.limit ?? '50',
    limit = Number(raw)
  if (
    !/^\d+$/.test(raw) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new AssetCleanupError('Choose a cleanup limit between 1 and 100.')
  return { action: 'apply', limit }
}
export function requireCleanupDatabase(value: string | undefined) {
  try {
    if (!value?.trim()) throw new Error('missing')
    const url = new URL(value)
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error('invalid')
  } catch {
    throw new AssetCleanupError(
      'Set an explicit, valid PostgreSQL DATABASE_URL. No environment files are loaded.'
    )
  }
}
export async function runAssetCleanup(args: string[]) {
  const command = parseAssetCleanupArgs(args)
  if (command.action === 'help') return { output: usage, exitCode: 0 }
  requireCleanupDatabase(process.env.DATABASE_URL)
  const { cleanupPrivateAssets } = await import('../lib/assets')
  const { closeDatabase } = await import('../lib/db')
  try {
    const { examined, cleaned, skipped, failed } = await cleanupPrivateAssets(
      command.limit
    )
    const report = {
      examined,
      cleaned,
      skipped,
      failed,
      message: failed
        ? 'Some cleanup attempts failed; their records remain queued for retry.'
        : null
    }
    return { output: JSON.stringify(report, null, 2), exitCode: failed ? 1 : 0 }
  } finally {
    await closeDatabase()
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runAssetCleanup(process.argv.slice(2))
    .then(({ output, exitCode }) => {
      console.log(output)
      process.exitCode = exitCode
    })
    .catch((err: unknown) => {
      console.error(
        err instanceof AssetCleanupError
          ? err.message
          : 'Cleanup did not finish. Queued private records remain eligible for a later retry.'
      )
      process.exitCode = 1
    })
}

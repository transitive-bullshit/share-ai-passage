import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'

import {
  parseReconcileArgs,
  parseReconciliationEvidence,
  ReconciliationError,
  requireReconciliationDatabase
} from './reconcile-summary'

const usage = `Image reconciliation (never makes a model request):
  status <operation UUID>
  list-stale [--older-than-minutes 30] [--limit 50]
  recover <operation UUID> --apply
  fail|cost <operation UUID> --evidence <JSON file> --apply

Set DATABASE_URL explicitly. No environment files or production configuration are loaded.
list-stale uses operation age, oldest first; status polling does not reset that age.
Recovery needs the existing R2 configuration; it verifies/reuses a durable object only.
Failure/cost evidence must bind action and operationId. Keep evidence files private.
Timeouts are not definitive failure evidence. There is no provider retry or asserted success.`

type ImageCommand =
  | { action: 'help' }
  | { action: 'status'; operationId: string }
  | { action: 'list-stale'; olderThanMinutes: number; limit: number }
  | { action: 'recover'; operationId: string; apply: true }
  | { action: 'fail' | 'cost'; operationId: string; evidencePath: string }

export function parseImageReconcileArgs(args: string[]): ImageCommand {
  if (args[0] === 'recover') {
    try {
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: { apply: { type: 'boolean' } }
      })
      if (
        positionals.length !== 2 ||
        !z.uuid().safeParse(positionals[1]).success ||
        values.apply !== true
      )
        throw new Error('invalid')
      return {
        action: 'recover' as const,
        operationId: positionals[1]!,
        apply: true as const
      }
    } catch {
      throw new ReconciliationError(
        'Recovery requires one operation UUID and --apply; it accepts no provider or evidence options.'
      )
    }
  }
  const command = parseReconcileArgs(args)
  if ('evidencePath' in command) {
    if (command.action === 'succeed')
      throw new ReconciliationError(
        'Use recover to verify an existing durable image. An image cannot be marked successful from an evidence assertion.'
      )
    return {
      action: command.action,
      operationId: command.operationId,
      evidencePath: command.evidencePath
    }
  }
  return command
}

export function parseImageReconciliationEvidence(
  action: 'fail' | 'cost',
  operationId: string,
  input: unknown
) {
  const evidence = parseReconciliationEvidence(action, operationId, input)
  if (evidence.action === 'succeed')
    throw new ReconciliationError('Invalid image repair action.')
  return evidence
}

type Inspection = {
  id: string
  status: string
  createdAt: Date
  updatedAt: Date
  providerRequestId: string | null
  reservedCostMicros: number
  actualCostMicros: number | null
  grantUsed: number | null
  grantReserved: number | null
  grantAllowance: number | null
}
export function imageReconciliationReport(row: Inspection, now = new Date()) {
  return {
    id: row.id,
    status: row.status,
    ageMinutes: Math.max(
      0,
      Math.floor((now.getTime() - row.createdAt.getTime()) / 60_000)
    ),
    inactiveMinutes: Math.max(
      0,
      Math.floor((now.getTime() - row.updatedAt.getTime()) / 60_000)
    ),
    providerRequestId: row.providerRequestId,
    reservedCostMicros: row.reservedCostMicros,
    actualCostMicros: row.actualCostMicros,
    outstandingCostMicros:
      row.actualCostMicros === null ? row.reservedCostMicros : 0,
    grantUsed: row.grantUsed,
    grantReserved: row.grantReserved,
    grantAllowance: row.grantAllowance
  }
}

export async function applyImageReconciliation(
  command:
    | { action: 'recover'; operationId: string }
    | ReturnType<typeof parseImageReconciliationEvidence>
) {
  if (command.action === 'recover') {
    const { recoverImageResult } = await import('../lib/image-worker')
    return recoverImageResult(command.operationId)
  }
  const { failImageOperation, reconcileImageCost } =
    await import('../lib/image-usage')
  const operation =
    command.action === 'fail'
      ? await failImageOperation(command.operationId, {
          actualCostMicros: command.actualCostMicros,
          errorCode: 'OPERATOR_CONFIRMED_FAILURE'
        })
      : await reconcileImageCost(command.operationId, command.actualCostMicros)
  if (command.action === 'fail' && operation.status !== 'failed')
    throw new ReconciliationError(
      'The operation already has another final outcome. Inspect status; no outcome was overwritten.'
    )
  if (operation.actualCostMicros !== command.actualCostMicros)
    throw new ReconciliationError(
      'The saved cost differs from this evidence. Inspect status; cost can only resolve an unknown final cost.'
    )
  return { operationId: operation.id, status: operation.status }
}

export async function runImageReconciliation(args: string[]) {
  const command = parseImageReconcileArgs(args)
  if (command.action === 'help') return usage
  requireReconciliationDatabase(process.env.DATABASE_URL)
  let evidence: ReturnType<typeof parseImageReconciliationEvidence> | undefined
  if ('evidencePath' in command) {
    let input: unknown
    try {
      if ((await stat(command.evidencePath)).size > 65_536)
        throw new Error('oversized')
      input = JSON.parse(await readFile(command.evidencePath, 'utf8'))
    } catch {
      throw new ReconciliationError(
        'The evidence file must contain valid JSON and be at most 64 KiB.'
      )
    }
    evidence = parseImageReconciliationEvidence(
      command.action,
      command.operationId,
      input
    )
  }
  const { getDb, closeDatabase } = await import('../lib/db')
  const { imageOperations: operations, imageCreditGrants: grants } =
    await import('../lib/db/schema')
  try {
    if (command.action === 'recover') await applyImageReconciliation(command)
    else if (evidence) await applyImageReconciliation(evidence)
    const now = new Date()
    const condition =
      command.action === 'list-stale'
        ? and(
            lt(
              operations.createdAt,
              new Date(now.getTime() - command.olderThanMinutes * 60_000)
            ),
            or(
              inArray(operations.status, [
                'reserved',
                'dispatching',
                'running',
                'uncertain'
              ]),
              and(
                inArray(operations.status, [
                  'succeeded',
                  'failed',
                  'cancelled'
                ]),
                isNull(operations.actualCostMicros)
              )
            )
          )
        : eq(operations.id, command.operationId)
    const rows = await getDb()
      .select({
        id: operations.id,
        status: operations.status,
        createdAt: operations.createdAt,
        updatedAt: operations.updatedAt,
        providerRequestId: operations.providerRequestId,
        reservedCostMicros: operations.reservedCostMicros,
        actualCostMicros: operations.actualCostMicros,
        grantUsed: grants.used,
        grantReserved: grants.reserved,
        grantAllowance: grants.allowance
      })
      .from(operations)
      .leftJoin(grants, eq(grants.id, operations.grantId))
      .where(condition)
      .orderBy(asc(operations.createdAt), asc(operations.id))
      .limit(command.action === 'list-stale' ? command.limit : 1)
    if (!rows.length && command.action !== 'list-stale')
      throw new ReconciliationError(
        'Operation not found in the selected database.'
      )
    return JSON.stringify(
      rows.map((row) => imageReconciliationReport(row, now)),
      null,
      2
    )
  } finally {
    await closeDatabase()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runImageReconciliation(process.argv.slice(2))
    .then((output) => console.log(output))
    .catch((err: unknown) => {
      console.error(
        err instanceof ReconciliationError
          ? err.message
          : 'Image reconciliation did not finish. Inspect status before retrying; no model request was made.'
      )
      process.exitCode = 1
    })
}

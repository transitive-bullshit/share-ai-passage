import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { and, asc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'

import { parseGeneratedPreview } from '../lib/summary'

const usage = `Summary reconciliation (never makes a model request):
  status <operation UUID>
  list-stale [--older-than-minutes 30] [--limit 50]
  succeed|fail|cost <operation UUID> --evidence <JSON file> --apply

Set DATABASE_URL explicitly. No environment files or production configuration are loaded.
Repairs require an evidence file binding action and operationId. Keep that file private.
Unknown provider outcomes must stay reserved; elapsed time is not failure evidence.`

class ReconciliationError extends Error {}

const uuid = z.uuid()
const cost = z.number().int().min(0).max(2_147_483_647)
const evidenceBase = {
  operationId: uuid,
  evidence: z.string().trim().min(1).max(4_000),
  actualCostMicros: cost
}
const evidenceSchema = z.discriminatedUnion('action', [
  z.strictObject({
    ...evidenceBase,
    action: z.literal('succeed'),
    preview: z.unknown()
  }),
  z.strictObject({
    ...evidenceBase,
    action: z.literal('fail'),
    actualCostMicros: cost.nullable()
  }),
  z.strictObject({ ...evidenceBase, action: z.literal('cost') })
])

type RepairAction = 'succeed' | 'fail' | 'cost'
type Command =
  | { action: 'help' }
  | { action: 'status'; operationId: string }
  | { action: 'list-stale'; olderThanMinutes: number; limit: number }
  | { action: RepairAction; operationId: string; evidencePath: string }

export function parseReconcileArgs(args: string[]): Command {
  let parsed
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        help: { type: 'boolean' },
        apply: { type: 'boolean' },
        evidence: { type: 'string' },
        'older-than-minutes': { type: 'string' },
        limit: { type: 'string' }
      }
    })
  } catch {
    throw new ReconciliationError(
      'Invalid arguments. Run with --help for usage.'
    )
  }
  const { values, positionals } = parsed
  if (values.help || args.length === 0) return { action: 'help' }
  const [action, operationId, ...extra] = positionals
  if (extra.length)
    throw new ReconciliationError(
      'Unexpected arguments. Run with --help for usage.'
    )
  if (action === 'list-stale') {
    if (operationId || values.apply || values.evidence)
      throw new ReconciliationError(
        'list-stale is read-only and does not accept an operation or evidence.'
      )
    const olderThanMinutes = Number(values['older-than-minutes'] ?? 30)
    const limit = Number(values.limit ?? 50)
    if (
      !Number.isInteger(olderThanMinutes) ||
      olderThanMinutes < 1 ||
      olderThanMinutes > 525_600 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200
    ) {
      throw new ReconciliationError(
        'Choose 1–525600 minutes and a result limit of 1–200.'
      )
    }
    return { action, olderThanMinutes, limit }
  }
  if (
    !uuid.safeParse(operationId).success ||
    values.limit ||
    values['older-than-minutes']
  ) {
    throw new ReconciliationError(
      'Supply one operation UUID. Paging options belong to list-stale.'
    )
  }
  if (action === 'status') {
    if (values.apply || values.evidence)
      throw new ReconciliationError(
        'status is read-only and does not accept repair options.'
      )
    return { action, operationId: operationId! }
  }
  if (action !== 'succeed' && action !== 'fail' && action !== 'cost') {
    throw new ReconciliationError(
      'Choose status, list-stale, succeed, fail or cost.'
    )
  }
  if (values.apply !== true || !values.evidence?.trim()) {
    throw new ReconciliationError(
      'Repairs require both --apply and --evidence <JSON file>.'
    )
  }
  return { action, operationId: operationId!, evidencePath: values.evidence }
}

export function requireReconciliationDatabase(value: string | undefined) {
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
    throw new ReconciliationError(
      'Set an explicit, valid PostgreSQL DATABASE_URL. This command does not load environment files.'
    )
  }
}

export function parseReconciliationEvidence(
  action: RepairAction,
  operationId: string,
  input: unknown
) {
  const parsed = evidenceSchema.safeParse(input)
  if (
    !parsed.success ||
    parsed.data.action !== action ||
    parsed.data.operationId !== operationId
  ) {
    throw new ReconciliationError(
      'Evidence must match the action and operationId, include an evidence note, and contain a valid actualCostMicros value.'
    )
  }
  const evidence = parsed.data
  if (evidence.action === 'succeed') {
    const preview = parseGeneratedPreview(evidence.preview)
    if (!preview.success)
      throw new ReconciliationError(
        'Successful reconciliation requires a valid saved preview.'
      )
    return { ...evidence, preview: preview.data }
  }
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
  periodUsed: number
  periodReserved: number
  periodAllowance: number
  budgetSpentMicros: number
  budgetReservedMicros: number
  budgetLimitMicros: number
}

/** Explicit allowlist: never spread an operation or log provider/database errors. */
export function reconciliationReport(row: Inspection, now = new Date()) {
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
    periodUsed: row.periodUsed,
    periodReserved: row.periodReserved,
    periodAllowance: row.periodAllowance,
    budgetSpentMicros: row.budgetSpentMicros,
    budgetReservedMicros: row.budgetReservedMicros,
    budgetLimitMicros: row.budgetLimitMicros
  }
}

export async function runReconciliation(args: string[]) {
  const command = parseReconcileArgs(args)
  if (command.action === 'help') return usage
  requireReconciliationDatabase(process.env.DATABASE_URL)

  let evidence: ReturnType<typeof parseReconciliationEvidence> | undefined
  if ('evidencePath' in command) {
    let contents: string
    try {
      if ((await stat(command.evidencePath)).size > 65_536)
        throw new Error('oversized')
      contents = await readFile(command.evidencePath, 'utf8')
    } catch {
      throw new ReconciliationError(
        'The evidence file could not be read or exceeds 64 KiB.'
      )
    }
    let input: unknown
    try {
      input = JSON.parse(contents)
    } catch {
      throw new ReconciliationError(
        'The evidence file must contain valid JSON.'
      )
    }
    evidence = parseReconciliationEvidence(
      command.action,
      command.operationId,
      input
    )
  }

  // Loading the database happens only after arguments, target and evidence pass.
  const { getDb, closeDatabase } = await import('../lib/db')
  const {
    generationOperations: operations,
    usagePeriods: periods,
    aiBudgetPeriods: budgets
  } = await import('../lib/db/schema')
  try {
    if (evidence) {
      const {
        succeedSummaryOperation,
        failSummaryOperation,
        reconcileSummaryCost
      } = await import('../lib/usage')
      const result =
        evidence.action === 'succeed'
          ? await succeedSummaryOperation(
              evidence.operationId,
              evidence.preview,
              evidence.actualCostMicros
            )
          : evidence.action === 'fail'
            ? await failSummaryOperation(
                evidence.operationId,
                evidence.actualCostMicros
              )
            : await reconcileSummaryCost(
                evidence.operationId,
                evidence.actualCostMicros
              )
      const expectedStatus =
        evidence.action === 'succeed' ? 'succeeded' : 'failed'
      if (evidence.action !== 'cost' && result.status !== expectedStatus) {
        throw new ReconciliationError(
          'The operation already has another final outcome. Inspect status; no outcome was overwritten.'
        )
      }
      if (result.actualCostMicros !== evidence.actualCostMicros) {
        throw new ReconciliationError(
          'The saved cost differs from this evidence. Inspect status; use cost only to resolve an unknown cost.'
        )
      }
    }
    const now = new Date()
    const condition =
      command.action === 'list-stale'
        ? and(
            lt(
              operations.updatedAt,
              new Date(now.getTime() - command.olderThanMinutes * 60_000)
            ),
            or(
              inArray(operations.status, ['reserved', 'running', 'uncertain']),
              and(
                inArray(operations.status, ['succeeded', 'failed']),
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
        periodUsed: periods.used,
        periodReserved: periods.reserved,
        periodAllowance: periods.allowance,
        budgetSpentMicros: budgets.spentMicros,
        budgetReservedMicros: budgets.reservedMicros,
        budgetLimitMicros: budgets.limitMicros
      })
      .from(operations)
      .innerJoin(periods, eq(periods.id, operations.periodId))
      .innerJoin(budgets, eq(budgets.id, operations.budgetPeriodId))
      .where(condition)
      .orderBy(asc(operations.updatedAt), asc(operations.id))
      .limit(command.action === 'list-stale' ? command.limit : 1)
    if (!rows.length && command.action !== 'list-stale')
      throw new ReconciliationError(
        'Operation not found in the selected database.'
      )
    return JSON.stringify(
      rows.map((row) => reconciliationReport(row, now)),
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
  runReconciliation(process.argv.slice(2))
    .then((output) => {
      console.log(output)
    })
    .catch((err: unknown) => {
      // Driver errors can contain SQL parameters, including a recovered preview.
      console.error(
        err instanceof ReconciliationError
          ? err.message
          : 'Reconciliation did not finish. Inspect status before retrying; no model request was made.'
      )
      process.exitCode = 1
    })
}

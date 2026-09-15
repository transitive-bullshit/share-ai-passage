import type { Resend } from 'resend'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { operationsDigest, type OperationsReport } from '../lib/operations'
import { sendOperationsEmail } from '../lib/email'
import {
  operationsErrorOutput,
  parseOperationsArgs,
  runOperationsReconciliation
} from '../scripts/reconcile-operations'

const { read, close, send } = vi.hoisted(() => ({
  read: vi.fn<() => Promise<OperationsReport>>(),
  close: vi.fn<() => Promise<void>>(),
  send: vi.fn<
    (...args: Parameters<Resend['emails']['send']>) => Promise<unknown>
  >()
}))
vi.mock('../lib/operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/operations')>()),
  readOperationsReport: read
}))
vi.mock('../lib/db', () => ({
  closeDatabase: close,
  getDb: vi.fn<() => never>()
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  }
}))

function report(actionable = true): OperationsReport {
  return {
    status: actionable ? 'action_required' : 'healthy',
    checkedAt: '2026-09-15T08:00:00.000Z',
    olderThanMinutes: 30,
    reportingMonth: {
      startsAt: '2026-09-01T00:00:00.000Z',
      endsAt: '2026-10-01T00:00:00.000Z'
    },
    summary: {
      staleUnresolved: actionable ? 1 : 0,
      staleUnknownCost: 0,
      currentMonthCostOverruns: 0
    },
    image: {
      staleUnresolved: 0,
      staleUnknownCost: 0,
      currentMonthCostOverruns: 0
    },
    billing: { failedEvents: 0, overdueEvents: 0, overdueCancellations: 0 },
    budgets: {
      free: {
        limitMicros: 25_000_000,
        liabilityMicros: 20_000,
        nextReservationMicros: 20_000,
        exhausted: false
      },
      image: {
        enabled: false,
        limitMicros: null,
        liabilityMicros: 0,
        nextReservationMicros: 1_000_000,
        exhausted: false
      }
    },
    issues: actionable ? ['stale_summary_operations'] : []
  }
}

beforeEach(() => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgresql://private-user:private-password@localhost:5432/private-db'
  )
  read.mockReset().mockResolvedValue(report())
  close.mockReset().mockResolvedValue(undefined)
  send
    .mockReset()
    .mockResolvedValue({ data: { id: 'fixture-only' }, error: null })
})
afterEach(() => vi.unstubAllEnvs())

function emailConfig() {
  vi.stubEnv('RESEND_API_KEY', 'fixture-only-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'Passage <operations@example.invalid>')
  vi.stubEnv('RESEND_REPLY_TO', 'support@example.invalid')
}

it('requires explicit notification approval, rejects ambiguous destinations and keeps help credential-free', async () => {
  for (const args of [
    ['check', '--notify', 'operator@example.invalid'],
    ['check', '--notify', 'a@example.invalid,b@example.invalid', '--apply'],
    ['check', '--apply'],
    [
      'check',
      '--notify',
      'a@example.invalid\nBcc:private@example.invalid',
      '--apply'
    ],
    ['check', '--unknown', 'private']
  ])
    expect(() => parseOperationsArgs(args)).toThrow()
  expect(
    parseOperationsArgs([
      'check',
      '--notify',
      ' Operator@Example.invalid ',
      '--apply'
    ])
  ).toEqual({ action: 'check', notify: 'operator@example.invalid' })
  vi.stubEnv('DATABASE_URL', '')
  expect((await runOperationsReconciliation(['--help'])).output).toContain(
    'No environment files'
  )
  await expect(runOperationsReconciliation(['check'])).rejects.toThrow(
    'explicit, valid PostgreSQL DATABASE_URL'
  )
  expect(read).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})

it('returns actionable JSON without provider/email credentials, recipients or database details', async () => {
  const result = await runOperationsReconciliation(['check'])
  expect(result.exitCode).toBe(1)
  expect(JSON.parse(result.output).issues).toEqual(['stale_summary_operations'])
  expect(result.output).not.toMatch(/private-|postgres|@|fixture-only-key/)
  expect(send).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})

it('requires email configuration only for explicit notification and stays quiet when healthy', async () => {
  await expect(
    runOperationsReconciliation([
      'check',
      '--notify',
      'operator@example.invalid',
      '--apply'
    ])
  ).rejects.toThrow('RESEND_API_KEY')
  expect(read).not.toHaveBeenCalled()
  emailConfig()
  read.mockResolvedValue(report(false))
  const result = await runOperationsReconciliation([
    'check',
    '--notify',
    'operator@example.invalid',
    '--apply'
  ])
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.output).notification).toBe('skipped_healthy')
  expect(result.output).not.toContain('operator@example.invalid')
  expect(send).not.toHaveBeenCalled()
})

it('awaits a digest receipt with identical same-day payload/key and distinct report/day/recipient keys', async () => {
  emailConfig()
  const args = ['check', '--notify', 'operator@example.invalid', '--apply']
  const first = await runOperationsReconciliation(args)
  expect(first.exitCode).toBe(1)
  expect(JSON.parse(first.output).notification).toBe('accepted')
  expect(first.output).not.toContain('@')
  const payload = send.mock.calls[0]!
  expect(payload[0]).toMatchObject({
    to: 'operator@example.invalid',
    from: 'Passage <operations@example.invalid>',
    replyTo: 'support@example.invalid'
  })
  expect(payload[0].text).not.toMatch(/private-|postgres|08:00:00|@/)
  read.mockResolvedValue({ ...report(), checkedAt: '2026-09-15T09:12:00.000Z' })
  await runOperationsReconciliation(args)
  expect(send.mock.calls[1]).toEqual(payload)
  read.mockResolvedValue({ ...report(), checkedAt: '2026-09-16T08:00:00.000Z' })
  await runOperationsReconciliation(args)
  expect(send.mock.calls[2]![1]!.idempotencyKey).not.toBe(
    payload[1]!.idempotencyKey
  )
  read.mockResolvedValue({
    ...report(),
    summary: { ...report().summary, staleUnresolved: 2 }
  })
  await runOperationsReconciliation(args)
  expect(send.mock.calls[3]![1]!.idempotencyKey).not.toBe(
    payload[1]!.idempotencyKey
  )
  read.mockResolvedValue(report())
  await runOperationsReconciliation([
    'check',
    '--notify',
    'other@example.invalid',
    '--apply'
  ])
  expect(send.mock.calls[4]![1]!.idempotencyKey).not.toBe(
    payload[1]!.idempotencyKey
  )
  expect(operationsDigest(report(), 'target-a').idempotencyKey).not.toBe(
    operationsDigest(report(), 'target-b').idempotencyKey
  )
})

it('sanitizes provider/database failures and closes the database without claiming delivery', async () => {
  emailConfig()
  send.mockResolvedValue({
    error: { message: 'private recipient token' },
    data: null
  })
  await expect(
    runOperationsReconciliation([
      'check',
      '--notify',
      'operator@example.invalid',
      '--apply'
    ])
  ).rejects.toThrow('could not send')
  expect(close).toHaveBeenCalledOnce()
  const output = operationsErrorOutput(
    new Error('postgres://secret and operator@example.invalid')
  )
  expect(JSON.parse(output).status).toBe('check_failed')
  expect(output).not.toMatch(/postgres|secret|@/)
  send.mockRejectedValue(new Error('private request details'))
  await expect(
    sendOperationsEmail({
      to: 'operator@example.invalid',
      ...operationsDigest(report(), 'fixture')
    })
  ).rejects.toThrow('could not send')
})

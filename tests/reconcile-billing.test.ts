import { afterEach, expect, it, vi } from 'vitest'

import {
  parseBillingArgs,
  runBillingReconciliation
} from '../scripts/reconcile-billing'

afterEach(() => vi.unstubAllEnvs())

it('requires explicit repair approval and rejects asserted plans and unknown arguments before connecting', () => {
  expect(() => parseBillingArgs(['refresh', 'account-id'])).toThrow('--apply')
  expect(() => parseBillingArgs(['cancel-closing', 'account-id'])).toThrow(
    '--apply'
  )
  expect(() =>
    parseBillingArgs(['refresh', 'account-id', '--apply', '--plan', 'pro'])
  ).toThrow('Invalid arguments')
  expect(() => parseBillingArgs(['status', 'account-id', '--apply'])).toThrow(
    'read-only'
  )
  expect(() => parseBillingArgs(['failed-events', '--limit', '201'])).toThrow(
    '1–200'
  )
  expect(parseBillingArgs(['refresh', 'account-id', '--apply'])).toEqual({
    action: 'refresh',
    userId: 'account-id'
  })
})

it('does not load environment files or require credentials to show operator help', async () => {
  vi.stubEnv('DATABASE_URL', '')
  expect(await runBillingReconciliation(['--help'])).toContain(
    'Environment files are never loaded'
  )
  await expect(
    runBillingReconciliation(['status', 'account-id'])
  ).rejects.toThrow('explicit, valid PostgreSQL DATABASE_URL')
})

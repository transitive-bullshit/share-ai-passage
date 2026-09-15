import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  parseAssetCleanupArgs,
  requireCleanupDatabase,
  runAssetCleanup
} from '../scripts/cleanup-assets'
import { cleanupPrivateAssets } from '@/lib/assets'
import { closeDatabase } from '@/lib/db'
vi.mock('@/lib/assets', () => ({
  cleanupPrivateAssets: vi.fn<
    () => Promise<{
      examined: number
      cleaned: number
      skipped: number
      failed: number
    }>
  >()
}))
vi.mock('@/lib/db', () => ({
  closeDatabase: vi.fn<() => Promise<void>>(async () => {})
}))
beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
})
it('requires explicit apply and a bounded batch before loading cleanup work', async () => {
  expect(parseAssetCleanupArgs([])).toEqual({ action: 'help' })
  expect(parseAssetCleanupArgs(['--apply'])).toEqual({
    action: 'apply',
    limit: 50
  })
  expect(parseAssetCleanupArgs(['--apply', '--limit', '100'])).toEqual({
    action: 'apply',
    limit: 100
  })
  for (const args of [
    ['--limit', '10'],
    ['--apply', '--limit', '0'],
    ['--apply', '--limit', '101'],
    ['--apply', '--limit', '1.5'],
    ['--apply', 'unexpected']
  ])
    expect(() => parseAssetCleanupArgs(args)).toThrow()
  await expect(runAssetCleanup(['--limit', '50'])).rejects.toThrow('--apply')
  expect(cleanupPrivateAssets).not.toHaveBeenCalled()
})
it('requires an explicit PostgreSQL target without echoing secrets', async () => {
  for (const target of [
    undefined,
    '',
    'https://secret@example.invalid/db',
    'postgres://localhost',
    'postgres://localhost/db#secret'
  ])
    expect(() => requireCleanupDatabase(target)).toThrow('valid PostgreSQL')
  expect(() =>
    requireCleanupDatabase('postgresql://fixture:secret@localhost/fixture')
  ).not.toThrow()
  vi.stubEnv('DATABASE_URL', '')
  await expect(runAssetCleanup(['--apply'])).rejects.toThrow('DATABASE_URL')
  expect(cleanupPrivateAssets).not.toHaveBeenCalled()
})
it('reports only counts, preserves failed cleanup for retry and closes the database', async () => {
  vi.stubEnv(
    'DATABASE_URL',
    'postgres://fixture:private-value@localhost/fixture'
  )
  vi.mocked(cleanupPrivateAssets).mockResolvedValue({
    examined: 6,
    cleaned: 2,
    skipped: 3,
    failed: 1
  })
  const result = await runAssetCleanup(['--apply', '--limit', '6'])
  expect(cleanupPrivateAssets).toHaveBeenCalledExactlyOnceWith(6)
  expect(result.exitCode).toBe(1)
  expect(JSON.parse(result.output)).toMatchObject({
    examined: 6,
    cleaned: 2,
    skipped: 3,
    failed: 1
  })
  expect(result.output).not.toContain('private-value')
  expect(closeDatabase).toHaveBeenCalledOnce()
})

import { beforeEach, expect, it, vi } from 'vitest'

import { AppError } from '@/lib/errors'
import { preparePassage } from '@/workflows/prepare-passage'

const state = vi.hoisted(() => ({
  prepare: vi.fn<(id: string) => Promise<void>>(),
  fail: vi.fn<(id: string, message?: string) => Promise<void>>(),
  retries: [] as number[]
}))

vi.mock('@/lib/account-drafts', () => ({
  prepareDraftInBackground: state.prepare,
  failDraftPreparation: state.fail
}))
vi.mock('workflow', async (importOriginal) => {
  const original = await importOriginal<typeof import('workflow')>()
  return {
    ...original,
    RetryableError: class extends original.RetryableError {
      constructor(message: string, options: { retryAfter: number }) {
        super(message, options)
        state.retries.push(options.retryAfter)
      }
    }
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  state.retries.length = 0
  state.fail.mockResolvedValue()
})

it('waits for a concurrent source preparation lease before retrying the same draft', async () => {
  state.prepare.mockRejectedValue(
    new AppError('This source is already being checked.', 409, 60)
  )
  await preparePassage('saved-draft-id')
  expect(state.retries).toEqual([60_000])
  expect(state.prepare).toHaveBeenCalledWith('saved-draft-id')
  // A direct call skips Workflow execution; its catch models exhausted retries.
  expect(state.fail).toHaveBeenCalledWith('saved-draft-id')
})

it('stops uncertain summary dispatch without scheduling another paid attempt', async () => {
  state.prepare.mockRejectedValue(
    new AppError('The previous generation is still being reconciled.', 409)
  )
  await preparePassage('saved-draft-id')
  expect(state.retries).toEqual([])
  expect(state.fail).toHaveBeenCalledWith(
    'saved-draft-id',
    'The previous generation is still being reconciled.'
  )
})

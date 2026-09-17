import { beforeEach, expect, it, vi } from 'vitest'

import { POST as createDraft } from '@/app/api/drafts/route'
import { POST as draftAction } from '@/app/api/drafts/[id]/[action]/route'
import type { Actor } from '@/lib/actors'
import type { DraftResult } from '@/lib/draft-client'

const id = '00000000-0000-4000-8000-000000000001'
const state = vi.hoisted(() => ({
  actor: {
    userId: 'fixture-owner',
    subjectKey: 'user:fixture-owner',
    registered: true,
    allowance: 25
  } as Actor,
  create: vi.fn<() => Promise<DraftResult>>(),
  resume: vi.fn<() => Promise<DraftResult>>(),
  enqueue: vi.fn<typeof import('@/lib/draft-jobs').ensureDraftEnqueued>(),
  start: vi.fn<() => Promise<{ runId: string }>>(),
  workflow: vi.fn<() => void>(),
  budget: vi.fn<() => void>()
}))
vi.mock('@/lib/account-http', () => ({
  accountRequest: async (
    _request: Request,
    action: (actor: Actor) => Promise<unknown>
  ) => Response.json(await action(state.actor))
}))
vi.mock('@/lib/account-drafts', () => ({
  createPendingSavedDraft: state.create,
  queueSavedDraftResume: state.resume
}))
vi.mock('@/lib/draft-jobs', () => ({ ensureDraftEnqueued: state.enqueue }))
vi.mock('@/workflows/prepare-passage', () => ({
  preparePassage: state.workflow
}))
vi.mock('workflow/api', () => ({ start: state.start }))
vi.mock('@/lib/service', () => ({ enforceBudget: state.budget }))

beforeEach(() => {
  vi.clearAllMocks()
  state.create.mockResolvedValue({ draftId: id, status: 'preparing' })
  state.resume.mockResolvedValue({ draftId: id, status: 'preparing' })
  state.start.mockResolvedValue({ runId: 'fixture-run' })
  state.enqueue.mockImplementation(async (_actor, draftId, callback) => {
    await callback(draftId)
  })
})
function request(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}
it('returns the persisted passage identity and dispatches durable preparation on creation and explicit resume', async () => {
  const response = await createDraft(
    request('/api/drafts', {
      url: 'https://chatgpt.com/share/fixture',
      requestKey: id
    })
  )
  expect(await response.json()).toEqual({ draftId: id, status: 'preparing' })
  await draftAction(request(`/api/drafts/${id}/resume`, {}), {
    params: Promise.resolve({ id, action: 'resume' })
  })
  expect(state.enqueue).toHaveBeenCalledTimes(2)
  expect(state.start.mock.calls).toEqual([
    [state.workflow, [id]],
    [state.workflow, [id]]
  ])
})
it('keeps blocked preparation recoverable without dispatching new work', async () => {
  state.create.mockResolvedValue({
    draftId: id,
    status: 'preparing',
    generationBlock: {
      code: 'SUMMARY_LIMIT',
      resetAt: '2026-10-01T00:00:00Z',
      canSignUp: false
    }
  })
  await createDraft(
    request('/api/drafts', {
      url: 'https://chatgpt.com/share/fixture',
      requestKey: id
    })
  )
  expect(state.enqueue).not.toHaveBeenCalled()
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as createDraft } from '@/app/api/drafts/route'
import { POST as draftAction } from '@/app/api/drafts/[id]/[action]/route'
import type { Actor } from '@/lib/actors'
import { DEFAULT_CARD_APPEARANCE } from '@/lib/card-appearance'
import type { DraftResult, SavedDraft } from '@/lib/draft-client'
import { defaultTemplateRecipe } from '@/lib/paid-design'

const draftId = '00000000-0000-4000-8000-000000000001'
const imageJobId = '00000000-0000-4000-8000-000000000002'
const requestKey = '00000000-0000-4000-8000-000000000003'
const state = vi.hoisted(() => ({
  actor: {
    userId: 'fixture-owner',
    subjectKey: 'user:fixture-owner',
    registered: true,
    allowance: 25
  } as Actor & { userId: string },
  create: vi.fn<(actor: Actor, input: unknown) => Promise<DraftResult>>(),
  resume: vi.fn<(actor: Actor, id: string) => Promise<DraftResult>>(),
  requestImage:
    vi.fn<
      (
        actor: Actor,
        id: string,
        revision: number,
        key: string
      ) => Promise<{ id: string }>
    >(),
  enqueue:
    vi.fn<
      (
        id: string,
        callback: (id: string) => Promise<{ runId: string }>
      ) => Promise<void>
    >(),
  start:
    vi.fn<(workflow: unknown, args: string[]) => Promise<{ runId: string }>>(),
  workflow: vi.fn<() => Promise<void>>(),
  budget: vi.fn<() => Promise<void>>()
}))

vi.mock('@/lib/account-http', () => ({
  accountRequest: async (
    _request: Request,
    action: (actor: Actor & { userId: string }) => Promise<unknown>
  ) => Response.json(await action(state.actor))
}))
vi.mock('@/lib/account-drafts', () => ({
  createSavedDraft: state.create,
  resumeSavedDraft: state.resume
}))
vi.mock('@/lib/image-jobs', () => ({
  requestImageJob: state.requestImage,
  ensureImageEnqueued: state.enqueue
}))
vi.mock('@/lib/service', () => ({ enforceBudget: state.budget }))
vi.mock('@/lib/http', async (original) => ({
  ...(await original<typeof import('@/lib/http')>()),
  clientKey: () => 'fixture-client'
}))
vi.mock('workflow/api', () => ({ start: state.start }))
vi.mock('@/workflows/generate-background', () => ({
  generatePassageBackground: state.workflow
}))

function ready(): SavedDraft {
  return {
    draftId,
    revision: 0,
    status: 'ready',
    draftToken: 'fixture-token',
    provider: 'chatgpt',
    sourceUrl: 'https://chatgpt.com/share/fixture',
    preview: { title: 'Saved summary', highlights: ['A useful point'] },
    appearance: DEFAULT_CARD_APPEARANCE,
    canCustomize: true,
    design: {
      version: 1,
      recipe: { ...defaultTemplateRecipe(), background: { mode: 'generated' } },
      fromTemplate: null,
      generatedImage: null
    }
  }
}

function request(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}
function create() {
  return createDraft(
    request('/api/drafts', { url: ready().sourceUrl, requestKey })
  )
}
function resume() {
  return draftAction(request(`/api/drafts/${draftId}/resume`, {}), {
    params: Promise.resolve({ id: draftId, action: 'resume' })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.create.mockResolvedValue(ready())
  state.resume.mockResolvedValue(ready())
  state.requestImage.mockResolvedValue({ id: imageJobId })
  state.enqueue.mockImplementation(async (id, enqueue) => {
    await enqueue(id)
  })
  state.start.mockResolvedValue({ runId: 'fixture-run' })
})

describe('initial generated background route wiring', () => {
  it('returns the same initial image job for creation and delayed-summary resume, including replay', async () => {
    expect(await (await create()).json()).toMatchObject({ draftId, imageJobId })
    expect(await (await resume()).json()).toMatchObject({ draftId, imageJobId })
    expect(await (await resume()).json()).toMatchObject({ draftId, imageJobId })
    expect(state.requestImage.mock.calls).toEqual([
      [state.actor, draftId, 0, draftId],
      [state.actor, draftId, 0, draftId],
      [state.actor, draftId, 0, draftId]
    ])
    expect(state.start).toHaveBeenCalledWith(state.workflow, [imageJobId])
  })

  it.each(['pending', 'edited', 'free', 'already-generated'] as const)(
    'does not request an automatic image for a %s draft',
    async (kind) => {
      let draft: DraftResult = ready()
      if (kind === 'pending') draft = { draftId, status: 'preparing' }
      else if (kind === 'edited') draft.revision = 1
      else if (kind === 'free') {
        draft.design = null
        draft.canCustomize = false
      } else
        draft.design!.generatedImage = {
          assetId: imageJobId,
          operationId: imageJobId,
          recipeHash: 'a'.repeat(64)
        }
      state.create.mockResolvedValue(draft)
      state.resume.mockResolvedValue(draft)
      expect(await (await create()).json()).not.toHaveProperty('imageJobId')
      expect(await (await resume()).json()).not.toHaveProperty('imageJobId')
      expect(state.requestImage).not.toHaveBeenCalled()
      expect(state.start).not.toHaveBeenCalled()
    }
  )
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/publish/route'
import {
  DEFAULT_CARD_APPEARANCE,
  type CardAppearance
} from '@/lib/card-appearance'
import { socialTemplateIds } from '@/lib/social-templates'

const service = vi.hoisted(() => ({
  enforceBudget: vi.fn<(key: string, limit: number) => Promise<void>>(),
  publishPreview:
    vi.fn<
      (
        token: string,
        appearance: CardAppearance
      ) => Promise<{ publicationId: string; shareUrl: string }>
    >()
}))
vi.mock('@/lib/service', () => service)

function request(body: unknown) {
  return new Request('http://localhost:3000/api/publish', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

describe('read-only preview publication API', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'http://localhost:3000')
    service.enforceBudget.mockReset().mockResolvedValue(undefined)
    service.publishPreview.mockReset().mockResolvedValue({
      publicationId: 'id',
      shareUrl: 'http://localhost:3000/chatgpt/id'
    })
  })

  it('publishes the saved draft capability with the default appearance', async () => {
    const response = await POST(request({ draftToken: 'signed-preview' }))
    expect(response.status).toBe(200)
    expect(service.publishPreview).toHaveBeenCalledExactlyOnceWith(
      'signed-preview',
      DEFAULT_CARD_APPEARANCE
    )
  })

  it.each(socialTemplateIds)(
    'publishes the selected %s template',
    async (templateId) => {
      const appearance = { templateId }
      const response = await POST(
        request({ draftToken: 'signed-preview', appearance })
      )
      expect(response.status).toBe(200)
      expect(service.publishPreview).toHaveBeenCalledExactlyOnceWith(
        'signed-preview',
        appearance
      )
    }
  )

  it.each([
    null,
    'midnight-observatory',
    {},
    { templateId: 'unknown' },
    { templateId: 'margin-notes', title: 'Edited title' },
    { templateId: 'margin-notes', background: 'https://example.com/asset.png' }
  ])('rejects malformed or unsupported appearance %j', async (appearance) => {
    const response = await POST(
      request({ draftToken: 'signed-preview', appearance })
    )
    expect(response.status).toBe(400)
    expect(service.publishPreview).not.toHaveBeenCalled()
  })

  it.each(['title', 'highlights', 'selection'])(
    'rejects client-supplied %s edits before publishing',
    async (field) => {
      const response = await POST(
        request({ draftToken: 'signed-preview', [field]: 'edited' })
      )
      expect(response.status).toBe(400)
      expect(service.publishPreview).not.toHaveBeenCalled()
    }
  )
})

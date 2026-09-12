import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/publish/route'
import {
  DEFAULT_CARD_APPEARANCE,
  type CardAppearance
} from '@/lib/card-appearance'
import type { GeneratedPreview } from '@/lib/domain'
import { AppError } from '@/lib/errors'
import { socialTemplateIds } from '@/lib/social-templates'

const service = vi.hoisted(() => ({
  enforceBudget: vi.fn<(key: string, limit: number) => Promise<void>>(),
  publishPreview:
    vi.fn<
      (
        token: string,
        appearance: CardAppearance,
        preview?: GeneratedPreview
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

describe('reviewed preview publication API', () => {
  beforeEach(() => {
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
      DEFAULT_CARD_APPEARANCE,
      undefined
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
        appearance,
        undefined
      )
    }
  )

  it('normalizes reviewed title and highlight edits before publishing', async () => {
    const response = await POST(
      request({
        draftToken: 'signed-preview',
        preview: {
          title: '  Cafe\u0301\n habits  ',
          highlights: [' Start\tsmall. ', ' Repeat each day. ']
        }
      })
    )
    expect(response.status).toBe(200)
    expect(service.publishPreview).toHaveBeenCalledExactlyOnceWith(
      'signed-preview',
      DEFAULT_CARD_APPEARANCE,
      { title: 'Café habits', highlights: ['Start small.', 'Repeat each day.'] }
    )
  })

  it('accepts astral Unicode characters at the title and highlight limits', async () => {
    const preview = {
      title: '🌱'.repeat(60),
      highlights: ['🦊'.repeat(100)]
    }
    const response = await POST(
      request({ draftToken: 'signed-preview', preview })
    )
    expect(response.status).toBe(200)
    expect(service.publishPreview).toHaveBeenCalledExactlyOnceWith(
      'signed-preview',
      DEFAULT_CARD_APPEARANCE,
      preview
    )
  })

  it.each([
    null,
    { title: 'A title', highlights: [] },
    { title: '🌱'.repeat(61), highlights: ['One point.'] },
    { title: 'A title', highlights: ['🦊'.repeat(101)] },
    { title: 'A title', highlights: ['One.', 'Two.', 'Three.', 'Four.'] },
    { title: 'A title', highlights: ['Same point', ' same\npoint '] },
    { title: 'A title', highlights: ['One point.'], attribution: 'Invented' }
  ])(
    'rejects invalid reviewed preview text before publication: %j',
    async (preview) => {
      const response = await POST(
        request({ draftToken: 'signed-preview', preview })
      )
      expect(response.status).toBe(400)
      expect(await response.json()).toHaveProperty('error')
      expect(service.publishPreview).not.toHaveBeenCalled()
    }
  )

  it.each([403, 410])(
    'retains draft capability failures for edited previews: HTTP %s',
    async (status) => {
      service.publishPreview.mockRejectedValue(
        new AppError('Prepare the source again.', status)
      )
      const response = await POST(
        request({
          draftToken: 'invalid-draft',
          preview: {
            title: 'An edited title',
            highlights: ['An edited point.']
          }
        })
      )
      expect(response.status).toBe(status)
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
    'rejects unsupported top-level %s fields before publishing',
    async (field) => {
      const response = await POST(
        request({ draftToken: 'signed-preview', [field]: 'edited' })
      )
      expect(response.status).toBe(400)
      expect(service.publishPreview).not.toHaveBeenCalled()
    }
  )
})

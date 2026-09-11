import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as publicImage } from '@/app/[provider]/[publicationId]/image/route'
import { POST as previewImage } from '@/app/api/card/route'
import { GET as exampleImage } from '@/app/api/example-card/route'
import { renderCard } from '@/lib/card'
import {
  DEFAULT_CARD_APPEARANCE,
  type CardAppearance
} from '@/lib/card-appearance'
import { socialTemplateIds } from '@/lib/social-templates'

const savedPreview = {
  title: 'Small habits create steady progress',
  highlights: [
    'Start small and keep showing up.',
    'Repeated effort builds lasting results.'
  ]
}

function publication(
  appearance: CardAppearance | null = DEFAULT_CARD_APPEARANCE
) {
  return {
    publication: { title: savedPreview.title, appearance },
    preview: savedPreview,
    source: { provider: 'claude' as const },
    disabled: false
  }
}

const service = vi.hoisted(() => ({
  enforceBudget: vi.fn<(key: string, limit: number) => Promise<void>>(),
  getDraft: vi.fn<
    () => Promise<{
      preview: typeof savedPreview
      source: { provider: 'claude' }
    }>
  >(),
  getPublication: vi.fn<() => Promise<ReturnType<typeof publication> | null>>()
}))
vi.mock('@/lib/service', () => service)
vi.mock('@/lib/card', () => ({ renderCard: vi.fn<typeof renderCard>() }))

function request(body: unknown) {
  return new Request('http://localhost:3000/api/card', {
    method: 'POST',
    headers: {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

function publicRequest(query = '') {
  return publicImage(
    new Request(`http://localhost:3000/claude/publication-id/image${query}`),
    {
      params: Promise.resolve({
        provider: 'claude',
        publicationId: 'publication-id'
      })
    }
  )
}

async function bytes(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('cache-control')).toContain('no-store')
  const buffer = Buffer.from(await response.arrayBuffer())
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return buffer
}

describe('saved social-card appearance routes', () => {
  beforeEach(() => {
    vi.mocked(renderCard)
      .mockReset()
      .mockImplementation(async () => new Response('rendered card'))
    service.enforceBudget.mockReset().mockResolvedValue(undefined)
    service.getDraft.mockReset().mockResolvedValue({
      preview: savedPreview,
      source: { provider: 'claude' }
    })
    service.getPublication.mockReset().mockResolvedValue(publication())
  })

  // Keep one composed PNG comparison; other route cases test the renderer boundary.
  it('shows the exact reviewed preview after publication and ignores query overrides', async () => {
    const actual =
      await vi.importActual<typeof import('@/lib/card')>('@/lib/card')
    vi.mocked(renderCard).mockImplementation(actual.renderCard)
    const appearance = { templateId: 'friendly-lab' as const }
    service.getPublication.mockResolvedValue(publication(appearance))
    const preview = await bytes(
      await previewImage(request({ draftToken: 'signed-preview', appearance }))
    )
    const published = await bytes(
      await publicRequest('?template=unknown&appearance=edited')
    )
    expect(published.equals(preview)).toBe(true)
    for (const call of [1, 2]) {
      expect(renderCard).toHaveBeenNthCalledWith(
        call,
        { ...savedPreview, provider: 'claude' },
        appearance
      )
    }
    expect(service.getDraft).toHaveBeenCalledExactlyOnceWith('signed-preview')
    expect(service.getPublication).toHaveBeenCalledExactlyOnceWith(
      'claude',
      'publication-id'
    )
  })

  it('uses the initial template when the preview request omits appearance', async () => {
    const response = await previewImage(
      request({ draftToken: 'signed-preview' })
    )
    expect(response.status).toBe(200)
    expect(renderCard).toHaveBeenCalledExactlyOnceWith(
      { ...savedPreview, provider: 'claude' },
      DEFAULT_CARD_APPEARANCE
    )
  })

  it.each([
    { appearance: null },
    { appearance: {} },
    { appearance: { templateId: 'unknown' } },
    { appearance: { templateId: 'margin-notes', font: 'remote.woff' } },
    { title: 'A client-authored title' },
    { highlights: ['A client-authored highlight'] },
    { selection: 'A client-selected excerpt' }
  ])(
    'rejects appearance injection and preview text edits: %j',
    async (input) => {
      const response = await previewImage(
        request({ draftToken: 'signed-preview', ...input })
      )
      expect(response.status).toBe(400)
      expect(service.getDraft).not.toHaveBeenCalled()
    }
  )

  it('keeps legacy publications on the unthemed renderer', async () => {
    service.getPublication.mockResolvedValue(publication(null))
    const response = await publicRequest('?template=friendly-lab')
    expect(response.status).toBe(200)
    expect(renderCard).toHaveBeenCalledExactlyOnceWith(
      { ...savedPreview, provider: 'claude' },
      undefined
    )
  })

  it('passes only the disabled state to the renderer after removal', async () => {
    service.getPublication.mockResolvedValue({
      ...publication({ templateId: 'friendly-lab' }),
      disabled: true
    })
    const response = await publicRequest()
    expect(response.status).toBe(200)
    expect(renderCard).toHaveBeenCalledExactlyOnceWith({ disabled: true })
  })

  it('returns a private 404 for a missing publication', async () => {
    service.getPublication.mockResolvedValue(null)
    const response = await publicRequest()
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it.each(socialTemplateIds)(
    'offers an allowlisted %s example image',
    async (templateId) => {
      const response = await exampleImage(
        new Request(
          `http://localhost:3000/api/example-card?template=${templateId}`
        )
      )
      expect(response.status).toBe(200)
      expect(renderCard).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ example: true }),
        { templateId }
      )
    }
  )

  it('rejects unknown example templates', async () => {
    const response = await exampleImage(
      new Request('http://localhost:3000/api/example-card?template=unknown')
    )
    expect(response.status).toBe(400)
  })
})

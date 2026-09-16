import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as publicImage } from '@/app/[provider]/[publicationId]/image/route'
import { POST as previewImage } from '@/app/api/card/route'
import { GET as exampleImage } from '@/app/api/example-card/route'
import { renderCard, renderCardPreview } from '@/lib/card'
import {
  DEFAULT_CARD_APPEARANCE,
  type CardAppearance
} from '@/lib/card-appearance'
import { AppError } from '@/lib/errors'
import { socialTemplateIds } from '@/lib/social-templates'
import { webpDimensions } from '@/lib/webp'

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
      appearance?: CardAppearance
      source: { provider: 'claude' }
    }>
  >(),
  getPublication: vi.fn<() => Promise<ReturnType<typeof publication> | null>>()
}))
vi.mock('@/lib/service', () => service)
vi.mock('@/lib/card', () => ({
  renderCard: vi.fn<typeof renderCard>(),
  renderCardPreview: vi.fn<typeof renderCardPreview>()
}))

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
  expect(response.headers.get('content-type')).toBe('image/webp')
  const buffer = Buffer.from(await response.arrayBuffer())
  expect(webpDimensions(buffer)).toEqual({ width: 1200, height: 630 })
  return buffer
}

describe('saved social-card appearance routes', () => {
  beforeEach(() => {
    vi.mocked(renderCard)
      .mockReset()
      .mockImplementation(async () => new Response('rendered card'))
    vi.mocked(renderCardPreview)
      .mockReset()
      .mockImplementation(async () => new Response('HTML preview'))
    service.enforceBudget.mockReset().mockResolvedValue(undefined)
    service.getDraft.mockReset().mockResolvedValue({
      preview: savedPreview,
      source: { provider: 'claude' }
    })
    service.getPublication.mockReset().mockResolvedValue(publication())
  })

  // Keep one composed WebP comparison; other route cases test the renderer boundary.
  it('shows the exact reviewed preview after publication and ignores query overrides', async () => {
    const actual =
      await vi.importActual<typeof import('@/lib/card')>('@/lib/card')
    vi.mocked(renderCard).mockImplementation(actual.renderCard)
    const appearance = { templateId: 'friendly-lab' as const }
    service.getPublication.mockResolvedValue(publication(appearance))
    const previewResponse = await previewImage(
      request({ draftToken: 'signed-preview', appearance })
    )
    expect(previewResponse.headers.get('cache-control')).toContain('no-store')
    const preview = await bytes(previewResponse)
    const publishedResponse = await publicRequest(
      '?template=unknown&appearance=edited'
    )
    expect(publishedResponse.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(publishedResponse.headers.get('cdn-cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    )
    expect(publishedResponse.headers.get('vercel-cdn-cache-control')).toBe(
      'public, max-age=2592000'
    )
    const published = await bytes(publishedResponse)
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

  it('preserves a forked passage style when the preview request omits appearance', async () => {
    const appearance: CardAppearance = { templateId: 'midnight-observatory' }
    service.getDraft.mockResolvedValue({
      preview: savedPreview,
      source: { provider: 'claude' },
      appearance
    })
    const response = await previewImage(
      request({ draftToken: 'forked-preview' })
    )
    expect(response.status).toBe(200)
    expect(renderCard).toHaveBeenCalledExactlyOnceWith(
      { ...savedPreview, provider: 'claude' },
      appearance
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

  it('uses the HTML renderer for a creation-page preview with the saved draft copy', async () => {
    const appearance = { templateId: 'friendly-lab' as const }
    const response = await previewImage(
      request({ draftToken: 'signed-preview', appearance, format: 'html' })
    )
    expect(response.status).toBe(200)
    expect(renderCardPreview).toHaveBeenCalledExactlyOnceWith(
      { ...savedPreview, provider: 'claude' },
      appearance
    )
    expect(renderCard).not.toHaveBeenCalled()
    expect(service.getDraft).toHaveBeenCalledExactlyOnceWith('signed-preview')
  })

  it.each(['webp', 'html'])(
    'renders normalized edited copy as %s without changing the draft',
    async (format) => {
      const original = structuredClone(savedPreview)
      const appearance = { templateId: 'friendly-lab' as const }
      const response = await previewImage(
        request({
          draftToken: 'signed-preview',
          appearance,
          format,
          preview: {
            title: '  Cafe\u0301 habits  ',
            highlights: [' Start\nsmall. ']
          }
        })
      )
      expect(response.status).toBe(200)
      const renderer = format === 'html' ? renderCardPreview : renderCard
      expect(renderer).toHaveBeenCalledExactlyOnceWith(
        {
          title: 'Café habits',
          highlights: ['Start small.'],
          provider: 'claude'
        },
        appearance
      )
      expect(service.getDraft).toHaveBeenCalledExactlyOnceWith('signed-preview')
      expect(savedPreview).toEqual(original)
    }
  )

  it.each([403, 410])(
    'does not render edited text when the draft is invalid or expired: HTTP %s',
    async (status) => {
      service.getDraft.mockRejectedValue(
        new AppError('Prepare the source again.', status)
      )
      const response = await previewImage(
        request({
          draftToken: 'invalid-draft',
          preview: {
            title: 'An edited title',
            highlights: ['An edited point.']
          }
        })
      )
      expect(response.status).toBe(status)
      expect(renderCard).not.toHaveBeenCalled()
      expect(renderCardPreview).not.toHaveBeenCalled()
    }
  )

  it.each([
    { format: 'png' },
    { format: 'svg' },
    { format: null },
    { appearance: null },
    { appearance: {} },
    { appearance: { templateId: 'unknown' } },
    { appearance: { templateId: 'margin-notes', font: 'remote.woff' } },
    { preview: null },
    { preview: { title: 'x'.repeat(601), highlights: ['One.'] } },
    { preview: { title: 'Title', highlights: ['x'.repeat(1001)] } },
    { preview: { title: 'Title', highlights: ['Same', ' same '] } },
    { title: 'A client-authored title' },
    { highlights: ['A client-authored highlight'] },
    { selection: 'A client-selected excerpt' }
  ])(
    'rejects unsupported fields and invalid preview text: %j',
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
        expect.objectContaining({ provider: 'chatgpt' }),
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

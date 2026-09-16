// @vitest-environment happy-dom

import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { PreviewReview, type PreparedDraft } from '@/components/preview-review'
import type { CardAppearance } from '@/lib/card-appearance'
import { getSocialTemplate } from '@/lib/social-templates'

vi.mock('takumi-js', () => {
  throw new Error(
    'The review component must not import the native card renderer'
  )
})

const draft: PreparedDraft = {
  draftToken: 'fixture-draft',
  provider: 'claude',
  sourceUrl: 'https://claude.ai/share/00000000-0000-4000-8000-000000000001',
  preview: {
    title: 'A useful conversation deserves to travel',
    highlights: ['Keep the useful idea.', 'Share the reasoning behind it.']
  }
}

function ReviewHarness() {
  const [appearance, setAppearance] = useState<CardAppearance>({
    templateId: 'margin-notes'
  })
  return createElement(PreviewReview, {
    draft,
    appearance,
    onAppearanceChange: setAppearance,
    preferencesReady: true,
    preferencesAvailable: true,
    onBack: () => {}
  })
}

let container: HTMLDivElement
let root: Root
let requests: ReturnType<typeof vi.fn<typeof fetch>>
let imageDecodes: { source: string | null; resolve: () => void }[]
let loadFont: ReturnType<typeof vi.fn<FontFaceSet['load']>>
let originalFonts: PropertyDescriptor | undefined

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  requests = vi.fn<typeof fetch>(() => new Promise(() => {}))
  vi.stubGlobal('fetch', requests)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  loadFont = vi.fn<FontFaceSet['load']>().mockResolvedValue([])
  originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: loadFont,
      ready: Promise.resolve()
    }
  })
  imageDecodes = []
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
    function (this: HTMLImageElement) {
      return new Promise<void>((resolve) => {
        imageDecodes.push({ source: this.getAttribute('src'), resolve })
      })
    }
  )
  // DOM simulation covers readiness and interactions, not browser text layout.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(
        0,
        0,
        1200,
        this.classList.contains('social-card-copy') ? 200 : 630
      )
    }
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
  else Reflect.deleteProperty(document, 'fonts')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function selectTemplate(templateId: CardAppearance['templateId']) {
  const template = getSocialTemplate(templateId)
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${template.name}"]`
  )!
  expect(button).not.toBeNull()
  await act(async () => button.click())
  return template
}

async function finishArtwork(templateId: CardAppearance['templateId']) {
  const source = getSocialTemplate(templateId).backgroundImage
  const pending = imageDecodes.filter((image) => image.source === source)
  expect(pending.length).toBeGreaterThan(0)
  await act(async () => {
    for (const image of pending) image.resolve()
  })
}

function publishButton() {
  const button = container.querySelector<HTMLButtonElement>(
    '.publish-control button'
  )!
  expect(button).not.toBeNull()
  return button
}

async function editField(id: string, value: string) {
  const input = container.querySelector<HTMLTextAreaElement>(`#${id}`)!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return input
}

it('switches the actual review preview locally across rapid style changes without requesting a card', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  for (const templateId of [
    'midnight-observatory',
    'friendly-lab',
    'margin-notes'
  ] as const) {
    const template = await selectTemplate(templateId)
    const preview = container.querySelector('.live-card')!
    expect.soft(preview.querySelector('iframe')).toBeNull()
    expect
      .soft(preview.querySelector('.social-card-copy')?.textContent ?? '')
      .toContain(draft.preview.title)
    expect
      .soft(preview.querySelector('img')?.getAttribute('src'))
      .toBe(template.backgroundImage)
  }
  expect(requests).not.toHaveBeenCalled()
})

it('previews the draft’s current title and highlights in every card style, including live edits', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  const thumbnails = container.querySelectorAll('.social-template-thumbnail')
  expect(thumbnails).toHaveLength(5)
  for (const thumbnail of thumbnails) {
    expect(thumbnail.textContent).toContain(draft.preview.title)
    expect(thumbnail.textContent).toContain(draft.preview.highlights[0])
    expect(thumbnail.textContent).not.toContain('Make room for the unexpected')
  }
  await editField('summary-title', 'A clearer introduction for this draft')
  await editField('summary-highlight-1', 'Bring the context with the link')
  for (const thumbnail of thumbnails) {
    expect(thumbnail.textContent).toContain(
      'A clearer introduction for this draft'
    )
    expect(thumbnail.textContent).toContain('Bring the context with the link')
    expect(thumbnail.textContent).not.toContain(draft.preview.title)
  }
  expect(requests).not.toHaveBeenCalled()
})

it('ignores stale artwork readiness and publishes only the current reviewed style', async () => {
  requests.mockResolvedValue(
    Response.json({ shareUrl: 'http://localhost:3000/claude/example-passage' })
  )
  await act(async () => root.render(createElement(ReviewHarness)))
  expect(publishButton().disabled).toBe(true)
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)

  await selectTemplate('midnight-observatory')
  expect(publishButton().disabled).toBe(true)
  await selectTemplate('friendly-lab')
  await finishArtwork('midnight-observatory')
  expect(publishButton().disabled).toBe(true)
  await act(async () => publishButton().click())
  expect(requests).not.toHaveBeenCalled()

  await finishArtwork('friendly-lab')
  expect(publishButton().disabled).toBe(false)
  await act(async () => publishButton().click())
  expect(requests).toHaveBeenCalledExactlyOnceWith(
    '/api/publish',
    expect.objectContaining({ method: 'POST' })
  )
  expect(JSON.parse(requests.mock.calls[0]![1]!.body as string)).toEqual({
    draftToken: draft.draftToken,
    appearance: { templateId: 'friendly-lab' },
    preview: draft.preview
  })
  expect(container.textContent).toContain('Your passage is published.')
})

it('keeps publishing disabled after a font failure until a retried preview finishes loading', async () => {
  loadFont.mockRejectedValue(new Error('Font request failed'))
  await act(async () => root.render(createElement(ReviewHarness)))
  expect(publishButton().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'The card artwork or fonts could not be loaded.'
  )

  const retryFont = Promise.withResolvers<FontFace[]>()
  loadFont.mockImplementation(() => retryFont.promise)
  const retryButton = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Try preview again'
  )!
  expect(retryButton).not.toBeUndefined()
  await act(async () => retryButton.click())
  expect(container.querySelector('[role="alert"]')).toBeNull()
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(true)

  await act(async () => retryFont.resolve([]))
  expect(publishButton().disabled).toBe(false)
  expect(requests).not.toHaveBeenCalled()
})

it('edits each field locally and publishes the latest fitted wording, preserving it on success', async () => {
  const publication = Promise.withResolvers<Response>()
  requests.mockReturnValue(publication.promise)
  await act(async () => root.render(createElement(ReviewHarness)))
  await finishArtwork('margin-notes')

  const earlierArtwork = [...imageDecodes]
  const title = await editField('summary-title', '  A clearer way to share  ')
  await editField('summary-highlight-1', '  Keep the   useful idea. ')
  await editField('summary-highlight-2', 'Make the next step clear.')
  expect(title.value).toBe('  A clearer way to share  ')
  expect(container.querySelector('.live-card')?.textContent).toContain(
    'A clearer way to share'
  )
  expect(container.querySelector('.live-card')?.textContent).toContain(
    'Make the next step clear.'
  )
  expect(draft.preview.title).toBe('A useful conversation deserves to travel')
  expect(requests).not.toHaveBeenCalled()

  await act(async () => earlierArtwork.forEach((image) => image.resolve()))
  expect(publishButton().disabled).toBe(true)
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)
  await act(async () => publishButton().click())
  expect(title.disabled).toBe(true)
  expect(requests).toHaveBeenCalledExactlyOnceWith(
    '/api/publish',
    expect.objectContaining({ method: 'POST' })
  )
  expect(JSON.parse(requests.mock.calls[0]![1]!.body as string)).toEqual({
    draftToken: draft.draftToken,
    appearance: { templateId: 'margin-notes' },
    preview: {
      title: 'A clearer way to share',
      highlights: ['Keep the useful idea.', 'Make the next step clear.']
    }
  })
  await act(async () =>
    publication.resolve(
      Response.json({ shareUrl: 'http://localhost:3000/claude/edited' })
    )
  )
  expect(container.querySelector('.published-preview')?.textContent).toContain(
    'A clearer way to share'
  )
  expect(container.querySelector('.published-preview')?.textContent).toContain(
    'Make the next step clear.'
  )
})

it('shows field errors for empty and over-limit edits while counting Unicode characters correctly', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  await editField('summary-title', ' ')
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(true)
  expect(container.querySelector('#summary-title-error')?.textContent).toBe(
    'Enter a title.'
  )

  await editField('summary-title', '😀'.repeat(60))
  await finishArtwork('margin-notes')
  expect(container.querySelector('#summary-title-count')?.textContent).toBe(
    '1 word · ~10 recommended'
  )
  expect(publishButton().disabled).toBe(false)

  const title = await editField('summary-title', '😀'.repeat(601))
  expect(title.getAttribute('aria-invalid')).toBe('true')
  expect(container.querySelector('#summary-title-error')?.textContent).toBe(
    'Keep your title within 600 characters.'
  )
  await editField('summary-highlight-1', 'a'.repeat(1001))
  expect(
    container.querySelector('#summary-highlight-1-error')?.textContent
  ).toBe('Keep your highlight within 1000 characters.')
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(true)
  expect(requests).not.toHaveBeenCalled()
})

it('requires distinct edited highlights and keeps edits when changing styles', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  await editField('summary-highlight-2', ' keep the useful idea. ')
  await finishArtwork('margin-notes')
  expect(container.querySelector('#summary-error')?.textContent).toBe(
    'Use distinct highlights.'
  )
  expect(publishButton().disabled).toBe(true)

  await editField('summary-highlight-2', 'A distinct next step.')
  await selectTemplate('friendly-lab')
  await finishArtwork('friendly-lab')
  expect(container.querySelector('.live-card')?.textContent).toContain(
    'A distinct next step.'
  )
  expect(publishButton().disabled).toBe(false)
  expect(container.querySelector('#summary-error')).toBeNull()
})

it('publishes above recommendations with whitespace highlights removed', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  await editField(
    'summary-title',
    'A useful specific title that takes more than ten words to describe clearly'
  )
  await editField('summary-highlight-1', ' \n\t ')
  await editField('summary-highlight-2', 'A'.repeat(101))
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)
  await act(async () => publishButton().click())
  const body = JSON.parse(requests.mock.calls[0]![1]!.body as string)
  expect(body.preview.highlights).toEqual(['A'.repeat(101)])
})

it('removes every highlight and restores an optional empty field', async () => {
  await act(async () => root.render(createElement(ReviewHarness)))
  for (let count = 0; count < 2; count++) {
    const remove = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('aria-label') === 'Remove highlight 1'
    )!
    await act(async () => remove.click())
  }
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)
  expect(container.querySelector('.live-card')?.textContent).not.toContain(
    'HIGHLIGHTS'
  )
  const add = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Add highlight'
  )!
  await act(async () => add.click())
  const field = container.querySelector<HTMLTextAreaElement>(
    '#summary-highlight-1'
  )!
  expect(field.value).toBe('')
  expect(field.required).toBe(false)
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)
})

it('resets readiness and text fitting when paid font or artwork inputs change within the same style', async () => {
  const { SocialCardPreview } = await import('@/components/social-card-preview')
  const { defaultTemplateRecipe, resolveCardDesign } =
    await import('@/lib/paid-design')
  const onStatusChange =
    vi.fn<
      (
        status: import('@/components/social-card-preview').CardPreviewStatus
      ) => void
    >()
  const appearance: CardAppearance = { templateId: 'margin-notes' }
  const recipe = defaultTemplateRecipe()
  const firstDesign = resolveCardDesign(appearance, {
    version: 1,
    recipe,
    fromTemplate: null,
    generatedImage: null
  })!
  const props = {
    preview: draft.preview,
    provider: draft.provider,
    appearance,
    onStatusChange
  }
  await act(async () =>
    root.render(
      createElement(SocialCardPreview, {
        ...props,
        resolvedDesign: firstDesign
      })
    )
  )
  await finishArtwork('margin-notes')
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: true })
  )
  const nextDesign = resolveCardDesign(appearance, {
    version: 1,
    recipe: {
      ...recipe,
      fontPairing: 'dm-sans-inter',
      background: {
        mode: 'uploaded',
        assetId: '00000000-0000-4000-8000-000000000001'
      }
    },
    fromTemplate: null,
    generatedImage: null
  })!
  await act(async () =>
    root.render(
      createElement(SocialCardPreview, {
        ...props,
        resolvedDesign: nextDesign,
        artwork: { background: '/fixture-new-artwork.webp' }
      })
    )
  )
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: false })
  )
  expect(loadFont).toHaveBeenCalledWith(
    '700 16px "DM Sans"',
    expect.any(String)
  )
  const nextArtwork = imageDecodes.filter(
    (image) => image.source === '/fixture-new-artwork.webp'
  )
  expect(nextArtwork.length).toBeGreaterThan(0)
  await act(async () => {
    for (const image of nextArtwork) image.resolve()
  })
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: true })
  )
  await act(async () =>
    root.render(
      createElement(SocialCardPreview, {
        ...props,
        resolvedDesign: nextDesign,
        artwork: { background: '/fixture-renewed-artwork.webp' }
      })
    )
  )
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: false })
  )
  await act(async () => {
    for (const image of nextArtwork) image.resolve()
  })
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: false })
  )
  await act(async () => {
    for (const image of imageDecodes.filter(
      (image) => image.source === '/fixture-renewed-artwork.webp'
    ))
      image.resolve()
  })
  expect(onStatusChange).toHaveBeenLastCalledWith(
    expect.objectContaining({ loaded: true })
  )
})

it('keeps oversized text saved in the editor and requires shortening instead of publishing tiny highlights', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      let height = 630
      if (this.classList.contains('social-card-copy')) {
        const title = this.querySelector<HTMLElement>('.social-card-title')!
        const scale = Number.parseFloat(title.style.fontSize) / 68
        const long = (this.textContent?.length ?? 0) > 500
        height = long ? 780 * scale : 200
      }
      return new DOMRect(0, 0, 1200, height)
    }
  )
  await act(async () => root.render(createElement(ReviewHarness)))
  const full = 'A'.repeat(1000)
  await editField('summary-highlight-1', full)
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(true)
  expect(container.textContent).toContain('Shorten the highlights')
  expect(
    container.querySelector<HTMLTextAreaElement>('#summary-highlight-1')?.value
  ).toBe(full)
  expect(container.textContent).not.toContain('Try preview again')
  await editField('summary-highlight-1', 'A shorter highlight.')
  await finishArtwork('margin-notes')
  expect(publishButton().disabled).toBe(false)
  expect(container.textContent).not.toContain('Shorten the highlights')
  expect(requests).not.toHaveBeenCalled()
})

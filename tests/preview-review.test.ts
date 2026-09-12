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
  expect(requests).toHaveBeenCalledTimes(1)
  expect(requests).toHaveBeenCalledWith(
    '/api/publish',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        draftToken: draft.draftToken,
        appearance: { templateId: 'friendly-lab' }
      })
    })
  )
  expect(container.textContent).toContain('Your passage is published.')
})

it('keeps publishing disabled after a font failure until a retried preview finishes loading', async () => {
  loadFont.mockRejectedValueOnce(new Error('Font request failed'))
  await act(async () => root.render(createElement(ReviewHarness)))
  expect(publishButton().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'The card artwork or fonts could not be loaded.'
  )

  const retryFont = Promise.withResolvers<FontFace[]>()
  loadFont.mockImplementationOnce(() => retryFont.promise)
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

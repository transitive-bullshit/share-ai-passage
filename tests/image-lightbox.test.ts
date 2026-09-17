// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { SavedMessage } from '../components/saved-message'
import { message } from '../lib/messages'

const image = {
  sha256: 'a'.repeat(64),
  objectKey: `assets/conversations/${'b'.repeat(64)}/${'a'.repeat(64)}.webp`,
  width: 1254,
  height: 1254
}
const basePath = '/chatgpt/example/media'
let container: HTMLDivElement
let root: Root
const nativeAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'animate'
)

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true
  } as MediaQueryList)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (nativeAnimate)
    Object.defineProperty(HTMLElement.prototype, 'animate', nativeAnimate)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render(linked = false) {
  const entry = message(
    'image',
    'assistant',
    linked
      ? `[![Moon repair shop](passage-image:${image.sha256})](https://example.com/original)`
      : `![Moon repair shop](passage-image:${image.sha256})`
  )
  entry.images = [image]
  await act(async () =>
    root.render(
      createElement(SavedMessage, {
        message: entry,
        index: 0,
        imageBasePath: basePath
      })
    )
  )
}

async function open() {
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('.image-lightbox-trigger')!
      .click()
  )
}

it('zooms linked images in an accessible dialog and closes again without animation for reduced motion', async () => {
  await render(true)
  const trigger = container.querySelector<HTMLButtonElement>(
    '.image-lightbox-trigger'
  )!
  expect(trigger.closest('a')).toBeNull()
  expect(trigger.getAttribute('aria-label')).toBe(
    'Enlarge image: Moon repair shop'
  )
  await open()
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(
    document.getElementById(dialog.getAttribute('aria-labelledby')!)
      ?.textContent
  ).toBe('Moon repair shop')
  expect(
    dialog
      .querySelector<HTMLImageElement>('.lightbox-full')
      ?.getAttribute('src')
  ).toBe(`${basePath}/${image.sha256}`)
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('.lightbox-frame')!.click()
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(container.querySelector('.conversation-image')).not.toBeNull()
})

it('supports Escape dismissal and keeps the inline image available for reopening', async () => {
  await render()
  await open()
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await open()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!
      .click()
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('waits for the return animation before removing the enlarged image', async () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: false
  } as MediaQueryList)
  let finish!: () => void
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })
  const cancel = vi.fn<() => void>()
  const animate = vi
    .fn<() => { cancel: () => void; finished: Promise<void> }>()
    .mockReturnValue({ cancel, finished })
  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: animate
  })
  await render()
  await open()
  expect(animate).toHaveBeenCalledOnce()
  await act(async () =>
    document.querySelector<HTMLButtonElement>('.lightbox-frame')!.click()
  )
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(animate).toHaveBeenCalledTimes(2)
  await act(async () => finish())
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('downloads from the publication-bound media route and offers retry after a failure', async () => {
  const fetchImage = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(
      new Response(new Blob(['webp'], { type: 'image/webp' }))
    )
  vi.stubGlobal('fetch', fetchImage)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => {})
  await render()
  await open()
  const download =
    document.querySelector<HTMLButtonElement>('.lightbox-download')!
  await act(async () => download.click())
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    'Download failed'
  )
  await act(async () => download.click())
  expect(fetchImage).toHaveBeenLastCalledWith(
    `${basePath}/${image.sha256}`,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  )
  expect(download.textContent).toContain('Download started')
  expect(click).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="alert"]')).toBeNull()
})

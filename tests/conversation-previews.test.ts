// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConversationPreviews } from '@/components/conversation-previews'
import type { LinkPreviewResult } from '@/lib/link-previews/types'

const { resolve } = vi.hoisted(() => ({
  resolve:
    vi.fn<(url: string, signal: AbortSignal) => Promise<LinkPreviewResult>>()
}))
vi.mock('@/lib/link-previews/client', () => ({ resolveClientPreview: resolve }))
// Controller tests isolate hover/focus from the separately tested idle queue.
vi.mock('@/lib/link-previews/prefetch', () => ({
  createLinkPreviewPrefetch: () => ({
    update() {},
    pause() {},
    resume() {},
    dispose() {}
  })
}))
let root: Root
let anchor: HTMLAnchorElement
beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('matchMedia', () =>
    Object.assign(new EventTarget(), { matches: true })
  )
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  resolve.mockResolvedValue({
    ok: true,
    metadata: {
      requestedUrl: 'https://example.org/',
      url: 'https://example.org/',
      title: 'Article title'
    }
  })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      createElement(ConversationPreviews, {
        // oxlint-disable-next-line react/no-children-prop -- This repository discovers .test.ts files without JSX.
        children: createElement(
          'div',
          { className: 'markdown' },
          createElement(
            'a',
            { href: 'https://example.org/', target: '_blank' },
            'Article'
          )
        )
      })
    )
  )
  anchor = container.querySelector('a')!
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resolve.mockReset()
})

it('waits for mouse intent and preserves native navigation', async () => {
  await act(async () =>
    anchor.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
    )
  )
  await act(async () => vi.advanceTimersByTimeAsync(119))
  expect(resolve).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(resolve).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(100))
  expect(document.querySelector('[role=tooltip]')?.textContent).toContain(
    'Article title'
  )
  expect(anchor.href).toBe('https://example.org/')
  expect(anchor.target).toBe('_blank')
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  )
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  expect(anchor.hasAttribute('aria-describedby')).toBe(false)
})

it('does not show a late result after the pointer leaves', async () => {
  let finish!: (result: LinkPreviewResult) => void
  resolve.mockImplementation(
    () =>
      new Promise((result) => {
        finish = result
      })
  )
  await act(async () =>
    anchor.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
    )
  )
  await act(async () => vi.advanceTimersByTimeAsync(220))
  await act(async () =>
    anchor.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' })
    )
  )
  await act(async () =>
    finish({
      ok: true,
      metadata: {
        requestedUrl: anchor.href,
        url: anchor.href,
        title: 'Late result'
      }
    })
  )
  expect(document.querySelector('[role=tooltip]')).toBeNull()
  expect(resolve.mock.calls[0]![1].aborted).toBe(true)
})

it('ignores touch and links outside the conversation', async () => {
  await act(async () =>
    anchor.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' })
    )
  )
  const outside = document.createElement('a')
  outside.href = 'https://example.org/'
  document.body.append(outside)
  await act(async () =>
    outside.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })
    )
  )
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(resolve).not.toHaveBeenCalled()
  expect(document.querySelector('[role=tooltip]')).toBeNull()
})

'use client'

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

import { resolveClientPreview } from '@/lib/link-previews/client'
import { createLinkPreviewPrefetch } from '@/lib/link-previews/prefetch'
import type { LinkPreviewMetadata } from '@/lib/link-previews/types'
import { previewPageUrl } from '@/lib/link-previews/urls'

interface Preview {
  element: HTMLAnchorElement
  url: string
  label: string
  loading: boolean
  metadata?: LinkPreviewMetadata
}

function PreviewCard({ preview, id }: { preview: Preview; id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [readyImage, setReadyImage] = useState<string>()
  const [failedIcon, setFailedIcon] = useState<string>()
  const image = preview.metadata?.image
  const favicon = preview.metadata?.favicon
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const place = () => {
      const anchor = preview.element.getBoundingClientRect()
      const bounds = card.getBoundingClientRect()
      const viewport = window.visualViewport
      const left = viewport?.offsetLeft ?? 0
      const top = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? window.innerWidth
      const height = viewport?.height ?? window.innerHeight
      const below = anchor.bottom + 10
      card.style.left = `${Math.max(left + 12, Math.min(anchor.left, left + width - bounds.width - 12))}px`
      card.style.top = `${Math.max(top + 12, Math.min(below + bounds.height <= top + height - 12 ? below : anchor.top - bounds.height - 10, top + height - bounds.height - 12))}px`
      card.style.visibility = 'visible'
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(card)
    return () => observer.disconnect()
  }, [preview])
  return (
    <div
      ref={ref}
      id={id}
      role='tooltip'
      className='link-preview'
      style={{ visibility: 'hidden' }}
    >
      {image ? (
        <img
          key={image}
          className='link-preview-image'
          data-ready={readyImage === image}
          src={image}
          alt=''
          decoding='async'
          referrerPolicy='no-referrer'
          onLoad={(event) => {
            const element = event.currentTarget
            void element
              .decode()
              .then(() => {
                if (element.isConnected) setReadyImage(image)
              })
              .catch(() => {})
          }}
        />
      ) : null}
      <div className='link-preview-copy'>
        <div className='link-preview-domain'>
          {favicon && failedIcon !== favicon ? (
            <img
              src={favicon}
              width={16}
              height={16}
              alt=''
              referrerPolicy='no-referrer'
              onError={() => setFailedIcon(favicon)}
            />
          ) : null}
          {new URL(preview.metadata?.url ?? preview.url).hostname.replace(
            /^www\./,
            ''
          )}
        </div>
        <strong>{preview.metadata?.title || preview.label}</strong>
        {preview.loading ? (
          <span className='link-preview-loading'>Loading preview…</span>
        ) : preview.metadata?.description ? (
          <p>{preview.metadata.description}</p>
        ) : null}
      </div>
    </div>
  )
}

/** One delegated controller for server-rendered chat links, scoped to this reader. */
export function ConversationPreviews({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null)
  const id = useId()
  const [preview, setPreview] = useState<Preview>()
  useEffect(() => {
    const section = root.current
    if (!section) return
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const events = new AbortController()
    const links = new Map<HTMLElement, { url: string }>()
    for (const element of section.querySelectorAll<HTMLAnchorElement>(
      '.markdown a[href]'
    )) {
      const url = previewPageUrl(element.href)
      if (url && url.hostname !== location.hostname)
        links.set(element, { url: url.href })
    }
    const available = () =>
      hover.matches && document.visibilityState !== 'hidden'
    const prefetch = createLinkPreviewPrefetch({
      window,
      document,
      root: section,
      resolve: resolveClientPreview,
      available,
      isInternalUrl: (url) => url.hostname === location.hostname
    })
    prefetch.update(links)
    let active: Preview | undefined
    let controller: AbortController | undefined
    let requestTimer: ReturnType<typeof setTimeout> | undefined
    let openTimer: ReturnType<typeof setTimeout> | undefined
    let open = false
    let keyboard = true
    let dismissed: HTMLAnchorElement | undefined
    let description: string | null = null
    const close = () => {
      clearTimeout(requestTimer)
      clearTimeout(openTimer)
      controller?.abort()
      if (active) {
        if (description === null)
          active.element.removeAttribute('aria-describedby')
        else active.element.setAttribute('aria-describedby', description)
      }
      active = undefined
      open = false
      setPreview(undefined)
    }
    const begin = (element: HTMLAnchorElement, pointer: boolean) => {
      if (!available() || active?.element === element || dismissed === element)
        return
      const link = links.get(element)
      if (!link) return
      close()
      const current: Preview = {
        element,
        url: link.url,
        label: element.textContent?.trim() || new URL(link.url).hostname,
        loading: true
      }
      active = current
      description = element.getAttribute('aria-describedby')
      controller = new AbortController()
      const signal = controller.signal
      requestTimer = setTimeout(
        () => {
          void resolveClientPreview(link.url, signal, { phase: 'metadata' })
            .then((result) => {
              if (active !== current || signal.aborted) return
              if (
                result.ok &&
                new URL(result.metadata.url).hostname === location.hostname
              ) {
                close()
                return
              }
              current.loading = false
              if (result.ok) current.metadata = result.metadata
              if (open) setPreview({ ...current })
            })
            .catch(() => {
              if (active === current && !signal.aborted) {
                current.loading = false
                if (open) setPreview({ ...current })
              }
            })
        },
        pointer ? 120 : 0
      )
      openTimer = setTimeout(
        () => {
          if (active !== current) return
          open = true
          element.setAttribute(
            'aria-describedby',
            [description, id].filter(Boolean).join(' ')
          )
          setPreview({ ...current })
        },
        pointer ? 220 : 0
      )
    }
    const target = (event: Event) => {
      const element =
        event.target instanceof Element ? event.target.closest('a') : null
      return element instanceof HTMLAnchorElement && links.has(element)
        ? element
        : undefined
    }
    const config = { signal: events.signal, passive: true }
    section.addEventListener(
      'pointerover',
      (event) => {
        const element = target(event)
        if (element && event.pointerType === 'mouse' && !event.buttons)
          begin(element, true)
      },
      config
    )
    section.addEventListener(
      'pointerout',
      (event) => {
        const element = target(event)
        if (
          !element ||
          (event.relatedTarget instanceof Node &&
            element.contains(event.relatedTarget))
        )
          return
        if (dismissed === element) dismissed = undefined
        if (active?.element === element) close()
      },
      config
    )
    section.addEventListener(
      'focusin',
      (event) => {
        const element = target(event)
        if (keyboard && element) begin(element, false)
      },
      config
    )
    section.addEventListener(
      'focusout',
      () => {
        dismissed = undefined
        close()
      },
      config
    )
    document.addEventListener(
      'pointerdown',
      () => {
        keyboard = false
        close()
      },
      { ...config, capture: true }
    )
    document.addEventListener(
      'keydown',
      (event) => {
        keyboard = true
        if (event.key === 'Escape') {
          dismissed = active?.element
          close()
        }
      },
      config
    )
    document.addEventListener('scroll', close, { ...config, capture: true })
    window.addEventListener('resize', close, config)
    window.addEventListener('blur', close, config)
    window.visualViewport?.addEventListener('resize', close, config)
    window.visualViewport?.addEventListener('scroll', close, config)
    const changed = () => {
      close()
      if (available()) prefetch.resume()
      else prefetch.pause()
    }
    hover.addEventListener('change', changed, config)
    document.addEventListener('visibilitychange', changed, config)
    return () => {
      close()
      prefetch.dispose()
      events.abort()
    }
  }, [id])
  return (
    <>
      <section
        ref={root}
        className='conversation'
        aria-label='Saved conversation'
      >
        {children}
      </section>
      {preview
        ? createPortal(
            <PreviewCard key={preview.url} preview={preview} id={id} />,
            document.body
          )
        : null}
    </>
  )
}

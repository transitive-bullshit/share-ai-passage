'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { Check, Download, LoaderCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

const motion = { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ImageLightbox({
  children,
  src,
  original,
  alt,
  caption = '',
  width,
  height,
  blurDataURL,
  unoptimized
}: {
  children: ReactNode
  src: string
  original: string
  alt: string
  caption?: string
  width?: number
  height?: number
  blurDataURL?: string
  unoptimized: boolean
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(src)
  const [ready, setReady] = useState(false)
  const [download, setDownload] = useState<
    'idle' | 'loading' | 'done' | 'error'
  >('idle')
  const trigger = useRef<HTMLButtonElement>(null)
  const frame = useRef<HTMLButtonElement | null>(null)
  const origin = useRef<DOMRect | null>(null)
  const animation = useRef<Animation | null>(null)
  const closing = useRef(false)
  const downloading = useRef(false)
  const dismissedWithEscape = useRef(false)

  const transformFrom = (target: DOMRect, source: DOMRect) =>
    `translate(${source.x - target.x}px, ${source.y - target.y}px) scale(${source.width / target.width}, ${source.height / target.height})`

  const mountFrame = useCallback((node: HTMLButtonElement | null) => {
    frame.current = node
    if (!node || !origin.current || reducedMotion()) return
    animation.current = node.animate(
      [
        {
          transform: transformFrom(node.getBoundingClientRect(), origin.current)
        },
        { transform: 'none' }
      ],
      motion
    )
    return () => {
      animation.current?.cancel()
    }
  }, [])

  function changeOpen(next: boolean) {
    if (next) {
      const inline = trigger.current?.querySelector('img')
      origin.current = inline?.getBoundingClientRect() ?? null
      setPreview(inline?.currentSrc || blurDataURL || src)
      setReady(false)
      setDownload('idle')
      dismissedWithEscape.current = false
      closing.current = false
      setOpen(true)
    } else if (!closing.current) {
      closing.current = true
      const node = frame.current
      const destination = trigger.current
        ?.querySelector('img')
        ?.getBoundingClientRect()
      if (node && destination && !reducedMotion()) {
        const current = getComputedStyle(node).transform
        animation.current?.cancel()
        const end = transformFrom(node.getBoundingClientRect(), destination)
        animation.current = node.animate(
          [{ transform: current }, { transform: end }],
          { ...motion, fill: 'forwards' }
        )
        void animation.current.finished.then(
          () => setOpen(false),
          () => setOpen(false)
        )
      } else setOpen(false)
    }
  }

  async function downloadImage() {
    if (downloading.current) return
    downloading.current = true
    setDownload('loading')
    try {
      const response = await fetch(original, {
        signal: AbortSignal.timeout(60_000)
      })
      if (!response.ok) throw new Error('Download failed')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = `${
        alt
          .replace(/[^a-zA-Z0-9 _-]/g, '')
          .trim()
          .slice(0, 80) || 'image'
      }.webp`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setDownload('done')
    } catch {
      setDownload('error')
    } finally {
      downloading.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button
          ref={trigger}
          type='button'
          className='image-lightbox-trigger'
          aria-label={alt ? 'Enlarge image: ' + alt : 'Enlarge image'}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogContent
        className='image-lightbox'
        overlayClassName='image-lightbox-overlay'
        onClick={(event) => {
          if (event.target === event.currentTarget) changeOpen(false)
        }}
        onEscapeKeyDown={() => {
          dismissedWithEscape.current = true
        }}
        onCloseAutoFocus={(event) => {
          if (dismissedWithEscape.current) {
            event.preventDefault()
            trigger.current?.blur()
          }
        }}
      >
        <DialogTitle className='sr-only'>{alt || 'Image preview'}</DialogTitle>
        <button
          ref={mountFrame}
          type='button'
          className='lightbox-frame'
          aria-label={alt ? 'Zoom out image: ' + alt : 'Zoom out image'}
          onClick={() => changeOpen(false)}
          style={
            { '--image-ratio': (width || 1) / (height || 1) } as CSSProperties
          }
        >
          {/* Reuse the browser's decoded inline resource while the larger image loads. */}
          <img
            src={preview}
            alt={ready ? '' : alt}
            aria-hidden={ready}
            className='lightbox-image lightbox-preview'
          />
          <Image
            aria-hidden={!ready}
            src={src}
            alt={alt}
            fill
            sizes='(max-width: 600px) calc(100vw - 24px), (max-width: 1488px) calc(100vw - 48px), 1440px'
            loading='eager'
            unoptimized={unoptimized}
            onLoad={() => setReady(true)}
            className='lightbox-image lightbox-full'
            style={{
              opacity: ready ? 1 : 0,
              pointerEvents: ready ? 'auto' : 'none'
            }}
          />
        </button>
        <DialogDescription className={caption ? 'lightbox-caption' : 'sr-only'}>
          {caption || 'Enlarged conversation image'}
        </DialogDescription>
        <div className='lightbox-actions'>
          <button
            type='button'
            className='lightbox-download'
            onClick={() => void downloadImage()}
            disabled={download === 'loading'}
            data-state={download}
          >
            <span className='lightbox-download-icon' key={download}>
              {download === 'done' ? (
                <Check size={16} />
              ) : download === 'loading' ? (
                <LoaderCircle size={16} />
              ) : (
                <Download size={16} />
              )}
            </span>
            <span aria-live='polite'>
              {download === 'loading'
                ? 'Downloading…'
                : download === 'done'
                  ? 'Download started'
                  : download === 'error'
                    ? 'Retry download'
                    : 'Download image'}
            </span>
          </button>
        </div>
        {download === 'error' && (
          <p className='lightbox-download-error' role='alert'>
            Download failed. Please try again.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

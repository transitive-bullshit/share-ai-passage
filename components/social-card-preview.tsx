'use client'

import './social-card-fonts'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { CardAppearance } from '@/lib/card-appearance'
import type { ResolvedCardDesign } from '@/lib/paid-design'
import { initialCardTextFit, nextCardTextFit } from '@/lib/card-text-fit'
import type { GeneratedPreview, Provider } from '@/lib/domain'
import { SocialCard } from '@/lib/social-card'
import { getSocialTemplate } from '@/lib/social-templates'

export type CardPreviewStatus = {
  appearance: CardAppearance
  attempt: number
  loaded: boolean
  error?: string
}

type SocialCardPreviewProps = {
  preview: GeneratedPreview
  provider: Provider
  appearance: CardAppearance
  attempt?: number
  resolvedDesign?: ResolvedCardDesign
  artwork?: { background?: string; logo?: string }
  onStatusChange?: (status: CardPreviewStatus) => void
}

/** Every visual input owns its loading and fit state, including paid fonts/artwork. */
export function SocialCardPreview(props: SocialCardPreviewProps) {
  const identity = JSON.stringify([
    props.preview,
    props.provider,
    props.appearance,
    props.attempt ?? 0,
    props.resolvedDesign,
    props.artwork
  ])
  return <CardPreviewCanvas key={identity} {...props} />
}

function CardPreviewCanvas({
  preview,
  provider,
  appearance,
  attempt = 0,
  resolvedDesign,
  artwork,
  onStatusChange
}: SocialCardPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [assetsReady, setAssetsReady] = useState(false)
  const [fit, setFit] = useState(initialCardTextFit)
  const template =
    resolvedDesign?.template ?? getSocialTemplate(appearance.templateId)

  // Clear the parent's prior ready state before this new canvas is painted.
  useLayoutEffect(() => {
    onStatusChange?.({ appearance, attempt, loaded: false })
  }, [appearance, attempt, onStatusChange])

  useEffect(() => {
    const canvas = canvasRef.current!
    let cancelled = false
    const text = canvas.textContent ?? ''
    const fonts = new Set([
      '400 16px "Inter"',
      '500 16px "Inter"',
      '600 16px "Inter"',
      `${template.font.title.weight} 16px "${template.font.title.family}"`,
      `${template.font.body.weight} 16px "${template.font.body.family}"`,
      '400 16px "Noto Sans"',
      '400 16px "Noto Emoji"',
      '400 16px "Noto Sans SC"'
    ])
    void Promise.all([
      ...Array.from(fonts, (font) => document.fonts.load(font, text)),
      ...Array.from(canvas.querySelectorAll('img'), (image) => image.decode())
    ]).then(
      () => {
        if (!cancelled) setAssetsReady(true)
      },
      () => {
        if (!cancelled)
          onStatusChange?.({
            appearance,
            attempt,
            loaded: false,
            error: 'The card artwork or fonts could not be loaded.'
          })
      }
    )
    return () => {
      cancelled = true
    }
  }, [
    preview,
    provider,
    template,
    appearance,
    attempt,
    artwork,
    onStatusChange
  ])

  useLayoutEffect(() => {
    if (!assetsReady) return
    if (fit.done) {
      onStatusChange?.({ appearance, attempt, loaded: true })
      return
    }
    const canvas = canvasRef.current!
    const copy = canvas.querySelector<HTMLElement>('.social-card-copy')!
    // Undo display scaling; narrow viewports keep the same 1200px text layout.
    const displayScale = canvas.getBoundingClientRect().width / 1200
    const copyHeight = copy.getBoundingClientRect().height / displayScale
    try {
      setFit(nextCardTextFit(fit, copyHeight <= template.layout.copy.maxHeight))
    } catch {
      onStatusChange?.({
        appearance,
        attempt,
        loaded: false,
        error: 'The card text could not fit within this style.'
      })
    }
  }, [assetsReady, fit, template, appearance, attempt, onStatusChange])

  return (
    <div
      className='social-card-preview'
      role='img'
      aria-label={`${preview.title}: ${preview.highlights.join(' ')}`}
    >
      <div ref={canvasRef} className='social-card-canvas' aria-hidden='true'>
        <SocialCard
          data={{ ...preview, provider }}
          appearance={appearance}
          scale={fit.scale}
          design={resolvedDesign}
          background={artwork?.background}
          logo={artwork?.logo}
        />
      </div>
    </div>
  )
}

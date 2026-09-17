'use client'

import './social-card-fonts'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
  retryable?: boolean
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

/** Style/artwork changes reset the canvas; text edits preserve its fitted display. */
export function SocialCardPreview(props: SocialCardPreviewProps) {
  const identity = JSON.stringify([
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
  const textKey = JSON.stringify([preview.title, preview.highlights])
  const [artworkReady, setArtworkReady] = useState(false)
  const [fontsReadyFor, setFontsReadyFor] = useState<string | null>(null)
  const [assetError, setAssetError] = useState('')
  const [fit, setFit] = useState(() => ({
    ...initialCardTextFit(),
    textKey
  }))
  // Keep the old fit while glyphs load, then measure the new text from full size.
  const currentFit = useMemo(
    () =>
      fontsReadyFor === textKey && fit.textKey !== textKey
        ? { ...initialCardTextFit(), textKey }
        : fit,
    [fontsReadyFor, textKey, fit]
  )
  const template =
    resolvedDesign?.template ?? getSocialTemplate(appearance.templateId)
  const { family: titleFamily, weight: titleWeight } = template.font.title
  const { family: bodyFamily, weight: bodyWeight } = template.font.body

  // Visual inputs own the canvas key, so unchanged images decode only on mount.
  useEffect(() => {
    const canvas = canvasRef.current!
    let cancelled = false
    void Promise.all(
      Array.from(canvas.querySelectorAll('img'), (image) => image.decode())
    ).then(
      () => {
        if (!cancelled) setArtworkReady(true)
      },
      () => {
        if (!cancelled)
          setAssetError('The card artwork or fonts could not be loaded.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const text = canvasRef.current!.textContent ?? ''
    const fonts = new Set([
      '400 16px "Inter"',
      '500 16px "Inter"',
      '600 16px "Inter"',
      `${titleWeight} 16px "${titleFamily}"`,
      `${bodyWeight} 16px "${bodyFamily}"`,
      '400 16px "Noto Sans"',
      '400 16px "Noto Emoji"',
      '400 16px "Noto Sans SC"'
    ])
    // Already-loaded glyphs can be fitted before paint without an async reset.
    if (Array.from(fonts).every((font) => document.fonts.check?.(font, text))) {
      setFontsReadyFor(textKey)
      return
    }
    let cancelled = false
    void Promise.all(
      Array.from(fonts, (font) => document.fonts.load(font, text))
    ).then(
      () => {
        if (!cancelled) setFontsReadyFor(textKey)
      },
      () => {
        if (!cancelled)
          setAssetError('The card artwork or fonts could not be loaded.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [textKey, titleFamily, titleWeight, bodyFamily, bodyWeight])

  useLayoutEffect(() => {
    if (assetError || !artworkReady || fontsReadyFor !== textKey) {
      const status: CardPreviewStatus = { appearance, attempt, loaded: false }
      if (assetError) status.error = assetError
      onStatusChange?.(status)
      return
    }
    // Search synchronously so intermediate binary-search frames never paint.
    if (currentFit.done) {
      onStatusChange?.({ appearance, attempt, loaded: true })
      return
    }
    const canvas = canvasRef.current!
    const copy = canvas.querySelector<HTMLElement>('.social-card-copy')!
    // Undo display scaling; narrow viewports keep the same 1200px text layout.
    const displayScale = canvas.getBoundingClientRect().width / 1200
    const copyHeight = copy.getBoundingClientRect().height / displayScale
    setFit({
      ...nextCardTextFit(
        currentFit,
        copyHeight <= template.layout.copy.maxHeight
      ),
      textKey
    })
  }, [
    artworkReady,
    fontsReadyFor,
    textKey,
    assetError,
    currentFit,
    template,
    appearance,
    attempt,
    onStatusChange
  ])

  return (
    <div
      className='social-card-preview'
      role='img'
      aria-label={`${preview.title}: ${preview.highlights.join(' ')}`}
    >
      <div
        ref={canvasRef}
        className='social-card-canvas'
        aria-hidden='true'
        style={{ visibility: currentFit.done ? 'visible' : 'hidden' }}
      >
        <SocialCard
          data={{ ...preview, provider }}
          appearance={appearance}
          scale={currentFit.scale}
          design={resolvedDesign}
          background={artwork?.background}
          logo={artwork?.logo}
        />
      </div>
    </div>
  )
}

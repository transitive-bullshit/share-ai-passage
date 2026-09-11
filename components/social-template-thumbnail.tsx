import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/newsreader/latin-400.css'

import { BrandMark } from '@/components/brand-mark'
import { type Provider, providerNames } from '@/lib/domain'
import type { SocialTemplate } from '@/lib/social-templates'

const sampleHighlights = [
  'Follow a question worth asking.',
  'Find a different point of view.',
  'Make space for what comes next.'
]

const markers = {
  dash: '—',
  square: '▪',
  number: '',
  star: '✦',
  circle: '•'
}

// Catalog measurements use a 1200 × 630 canvas. Container units scale the
// browser sketch with its thumbnail, without JavaScript measuring or rendering.
const widthPercent = (value: number) => `${value / 12}%`
const heightPercent = (value: number) => `${value / 6.3}%`
const scaled = (value: number) => `${value / 12}cqw`

export function SocialTemplateThumbnail({
  template,
  provider
}: {
  template: SocialTemplate
  provider: Provider
}) {
  const { colors, font, layout } = template

  return (
    <span
      className='social-template-browser-preview'
      aria-hidden='true'
      style={{
        backgroundColor: colors.background,
        color: colors.text,
        fontFamily: font.body.family,
        fontWeight: font.body.weight
      }}
    >
      <img
        className='social-template-background'
        src={template.backgroundImage}
        width={1200}
        height={630}
        alt=''
        loading='lazy'
        draggable={false}
      />
      <span
        className='social-template-scrim'
        style={{ background: layout.scrim }}
      />
      <span
        className='social-template-mini-brand'
        style={{
          left: widthPercent(layout.copy.left),
          top: heightPercent(layout.headerTop)
        }}
      >
        <BrandMark />
        Passage
      </span>
      <span
        className='social-template-mini-copy'
        style={{
          left: widthPercent(layout.copy.left),
          top: heightPercent(layout.copy.top),
          width: widthPercent(layout.copy.width),
          maxHeight: heightPercent(layout.copy.maxHeight),
          gap: scaled(layout.gap)
        }}
      >
        <span
          className='social-template-mini-title'
          style={{
            fontFamily: font.title.family,
            fontWeight: font.title.weight,
            fontSize: scaled(layout.titleSize),
            lineHeight: layout.titleLineHeight,
            letterSpacing: scaled(layout.titleLetterSpacing)
          }}
        >
          Make room for the unexpected
        </span>
        <span
          className='social-template-mini-highlights'
          style={{
            gap: scaled(layout.highlightGap),
            color: colors.muted,
            fontSize: scaled(layout.highlightSize),
            lineHeight: layout.highlightLineHeight
          }}
        >
          {sampleHighlights.map((highlight, index) => (
            <span className='social-template-mini-highlight' key={highlight}>
              <span
                className='social-template-mini-marker'
                style={{ color: colors.accent }}
              >
                {layout.marker === 'number'
                  ? index + 1
                  : markers[layout.marker]}
              </span>
              <span>{highlight}</span>
            </span>
          ))}
        </span>
      </span>
      <span
        className='social-template-mini-footer'
        style={{
          left: widthPercent(layout.copy.left),
          top: heightPercent(layout.footerTop),
          width: widthPercent(layout.footerWidth),
          color: colors.muted,
          borderColor: colors.rule
        }}
      >
        A passage from {providerNames[provider]} worth sharing
      </span>
    </span>
  )
}

import { BrandMark } from '../components/brand-mark'
import { brand } from './brand'
import type { CardAppearance } from './card-appearance'
import { providerNames, type Provider } from './domain'
import { getSocialTemplate, type SocialTemplate } from './social-templates'

/** Explicit local fallbacks keep the browser and image renderer on the same faces. */
export function cardFontFamily(family: string) {
  return [
    ...new Set([family, 'Inter', 'Noto Sans', 'Noto Emoji', 'Noto Sans SC'])
  ]
    .map((name) => `"${name}"`)
    .join(', ')
}

export type CardData =
  | { disabled: true }
  | {
      title: string
      highlights: string[]
      provider: Provider
      example?: boolean
      disabled?: false
    }

export function footerText(data: CardData) {
  return data.disabled
    ? 'Original unavailable'
    : data.example
      ? brand.mantra
      : `A passage from ${providerNames[data.provider]} worth sharing`
}

function Card({ data, scale = 1 }: { data: CardData; scale?: number }) {
  const disabled = data.disabled
  const title = disabled ? 'This passage is unavailable' : data.title
  const highlights = disabled ? null : data.highlights
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 630,
        boxSizing: 'border-box',
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'left',
        whiteSpace: 'normal',
        background: '#ffffff',
        color: '#171717',
        padding: '46px 64px 38px',
        fontFamily: cardFontFamily('Inter'),
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 32,
          fontSize: 18,
          color: '#737373'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            fontSize: 23,
            fontWeight: 600,
            letterSpacing: '-0.8px',
            color: '#171717'
          }}
        >
          <span
            style={{ display: 'flex', width: 30, height: 30, flexShrink: 0 }}
          >
            <BrandMark
              size={30}
              color='#171717'
              style={{ width: 30, height: 30, flexShrink: 0 }}
            />
          </span>
          <span>{brand.name}</span>
        </div>
        {disabled ? (
          <span>Saved passage</span>
        ) : data.example ? (
          <span>Example passage</span>
        ) : null}
      </div>
      <div
        className='social-card-copy'
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 38,
          gap: 28 * scale,
          flexShrink: 0
        }}
      >
        <div
          className='social-card-title'
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textWrap: 'balance',
            fontSize: 60 * scale,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: '-2.5px',
            overflowWrap: 'anywhere'
          }}
        >
          {title}
        </div>
        {highlights?.length ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 15 * scale
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: '1.4px',
                color: '#737373',
                marginBottom: 1
              }}
            >
              HIGHLIGHTS
            </span>
            {highlights.map((highlight, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: 15,
                  alignItems: 'flex-start'
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: 5,
                    height: 5,
                    flexShrink: 0,
                    borderRadius: 1,
                    marginTop: 15 * scale,
                    background: '#a3a3a3'
                  }}
                />
                <span
                  style={{
                    fontSize: 28 * scale,
                    lineHeight: 1.4,
                    color: '#525252',
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    flex: 1
                  }}
                >
                  {highlight}
                </span>
              </div>
            ))}
          </div>
        ) : disabled ? (
          <div
            style={{
              display: 'flex',
              borderLeft: '2px solid #e5e5e5',
              paddingLeft: 24
            }}
          >
            <div
              style={{
                fontSize: 28 * scale,
                lineHeight: 1.4,
                color: '#525252',
                whiteSpace: 'normal',
                overflowWrap: 'anywhere'
              }}
            >
              The original is no longer publicly available. Its saved
              conversation and preview have been disabled.
            </div>
          </div>
        ) : null}
      </div>
      <div
        className='social-card-footer'
        style={{
          position: 'absolute',
          display: 'flex',
          bottom: 36,
          left: 64,
          right: 64,
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 20,
          borderTop: '1px solid #e5e5e5',
          color: '#737373',
          fontSize: 16
        }}
      >
        <span>{footerText(data)}</span>
      </div>
    </div>
  )
}

type SummaryCardData = Extract<CardData, { highlights: string[] }>

function HighlightMarker({
  template,
  index,
  scale
}: {
  template: SocialTemplate
  index: number
  scale: number
}) {
  const { marker } = template.layout
  const color = template.colors.accent
  return (
    <div
      style={{
        display: 'flex',
        width: marker === 'number' ? 25 : 13,
        height:
          template.layout.highlightSize *
          scale *
          template.layout.highlightLineHeight,
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontFamily: cardFontFamily('Inter'),
        fontSize: 15 * scale,
        fontWeight: 500
      }}
    >
      {marker === 'number' ? (
        <span>{String(index + 1).padStart(2, '0')}</span>
      ) : marker === 'star' ? (
        <svg
          width='12'
          height='12'
          style={{ width: 12, height: 12, flexShrink: 0 }}
          viewBox='0 0 12 12'
        >
          <path
            d='M6 0L7.4 4.6 12 6 7.4 7.4 6 12 4.6 7.4 0 6 4.6 4.6Z'
            fill={color}
          />
        </svg>
      ) : (
        <span
          style={{
            display: 'block',
            width: marker === 'dash' ? 13 : 6,
            height: marker === 'dash' ? 2 : 6,
            borderRadius: marker === 'circle' ? 10 : 0,
            background: color
          }}
        />
      )}
    </div>
  )
}

function TemplateCard({
  data,
  template,
  background,
  scale
}: {
  data: SummaryCardData
  template: SocialTemplate
  background: string
  scale: number
}) {
  const { layout, colors, font } = template
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 630,
        boxSizing: 'border-box',
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: 'left',
        whiteSpace: 'normal',
        overflow: 'hidden',
        background: colors.background,
        color: colors.text,
        fontFamily: cardFontFamily('Inter')
      }}
    >
      <img
        src={background}
        alt=''
        width={1200}
        height={630}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          maxWidth: 'none',
          objectFit: 'cover'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 630,
          background: layout.scrim
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: layout.headerTop,
          left: layout.copy.left,
          width: layout.copy.width,
          height: 31,
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: '-0.8px'
          }}
        >
          <span
            style={{ display: 'flex', width: 30, height: 30, flexShrink: 0 }}
          >
            <BrandMark
              size={30}
              color={colors.text}
              style={{ width: 30, height: 30, flexShrink: 0 }}
            />
          </span>
          <span>{brand.name}</span>
        </div>
        {data.example ? (
          <span style={{ fontSize: 17, color: colors.muted }}>
            Example passage
          </span>
        ) : null}
      </div>
      <div
        className='social-card-copy'
        style={{
          display: 'flex',
          position: 'absolute',
          left: layout.copy.left,
          top: layout.copy.top,
          width: layout.copy.width,
          flexDirection: 'column',
          gap: layout.gap * scale,
          flexShrink: 0
        }}
      >
        <div
          className='social-card-title'
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textWrap: 'balance',
            fontFamily: cardFontFamily(font.title.family),
            fontWeight: font.title.weight,
            fontSize: layout.titleSize * scale,
            lineHeight: layout.titleLineHeight,
            letterSpacing: layout.titleLetterSpacing * scale,
            overflowWrap: 'anywhere'
          }}
        >
          {data.title}
        </div>
        {data.highlights.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: layout.highlightGap * scale
            }}
          >
            <span
              style={{
                fontFamily: cardFontFamily('Inter'),
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '1.6px',
                color: colors.accent,
                marginBottom: 2
              }}
            >
              HIGHLIGHTS
            </span>
            {data.highlights.map((highlight, index) => (
              <div
                key={index}
                style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}
              >
                <HighlightMarker
                  template={template}
                  index={index}
                  scale={scale}
                />
                <span
                  style={{
                    fontFamily: cardFontFamily(font.body.family),
                    fontWeight: font.body.weight,
                    fontSize: layout.highlightSize * scale,
                    lineHeight: layout.highlightLineHeight,
                    color: colors.muted,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    flex: 1
                  }}
                >
                  {highlight}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className='social-card-footer'
        style={{
          position: 'absolute',
          display: 'flex',
          top: layout.footerTop,
          left: layout.copy.left,
          width: layout.footerWidth,
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 17,
          borderTop: `1px solid ${colors.rule}`,
          color: colors.muted,
          fontSize: layout.footerSize
        }}
      >
        <span>{footerText(data)}</span>
      </div>
    </div>
  )
}

/** The single template tree used by HTML previews, the picker, and social images. */
export function SocialCard({
  data,
  appearance,
  scale = 1,
  background
}: {
  data: CardData
  appearance?: CardAppearance
  scale?: number
  background?: string
}) {
  const filtered = data.disabled
    ? data
    : { ...data, highlights: data.highlights.filter((text) => text.trim()) }
  if (filtered.disabled || !appearance)
    return <Card data={filtered} scale={scale} />
  const template = getSocialTemplate(appearance.templateId)
  return (
    <TemplateCard
      data={filtered}
      template={template}
      background={background ?? template.backgroundImage}
      scale={scale}
    />
  )
}

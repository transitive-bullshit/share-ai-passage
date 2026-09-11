import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'

import type { CardAppearance } from './card-appearance'
import { cardFonts } from './card-fonts'
import { providerNames, type Provider } from './domain'
import { privateHeaders } from './http'
import { getSocialTemplate, type SocialTemplate } from './social-templates'

export type CardData =
  | { disabled: true }
  | {
      title: string
      highlights: string[]
      provider: Provider
      example?: boolean
      disabled?: false
    }

function footerText(data: CardData) {
  return data.disabled
    ? 'Original unavailable'
    : `A passage from ${providerNames[data.provider]} worth sharing`
}

function Card({ data, scale = 1 }: { data: CardData; scale?: number }) {
  const disabled = data.disabled
  const title = disabled ? 'This conversation is unavailable' : data.title
  const highlights = disabled ? null : data.highlights
  return (
    <div
      style={{
        display: 'flex',
        width: 1200,
        height: 630,
        background: '#ffffff',
        color: '#171717',
        padding: '46px 64px 38px',
        fontFamily: 'Inter',
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
            fontWeight: 500,
            letterSpacing: '-0.8px',
            color: '#171717'
          }}
        >
          <svg width='30' height='30' viewBox='0 0 32 32' fill='none'>
            <rect
              x='3'
              y='8'
              width='15'
              height='20'
              rx='3'
              stroke='#171717'
              strokeWidth='1.8'
            />
            <rect
              x='12'
              y='3'
              width='15'
              height='20'
              rx='3'
              stroke='#171717'
              strokeWidth='1.8'
            />
          </svg>
          <span>Passage</span>
        </div>
        {disabled ? (
          <span>Saved conversation</span>
        ) : data.example ? (
          <span>Example conversation</span>
        ) : null}
      </div>
      <div
        id='card-copy'
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 38,
          gap: 28 * scale,
          flexShrink: 0
        }}
      >
        <div
          style={{
            fontSize: 60 * scale,
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: '-2.5px',
            overflowWrap: 'anywhere'
          }}
        >
          {title}
        </div>
        {highlights ? (
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
              AI SUMMARY
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
        ) : (
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
        )}
      </div>
      <div
        id='card-footer'
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
        fontFamily: 'Inter',
        fontSize: 15 * scale,
        fontWeight: 500
      }}
    >
      {marker === 'number' ? (
        <span>{String(index + 1).padStart(2, '0')}</span>
      ) : marker === 'star' ? (
        <svg width='12' height='12' viewBox='0 0 12 12'>
          <path
            d='M6 0L7.4 4.6 12 6 7.4 7.4 6 12 4.6 7.4 0 6 4.6 4.6Z'
            fill={color}
          />
        </svg>
      ) : (
        <span
          style={{
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
        overflow: 'hidden',
        background: colors.background,
        color: colors.text,
        fontFamily: 'Inter'
      }}
    >
      <img
        src={background}
        alt=''
        width={1200}
        height={630}
        style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
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
            fontWeight: 500,
            letterSpacing: '-0.8px'
          }}
        >
          <svg width='30' height='30' viewBox='0 0 32 32' fill='none'>
            <rect
              x='3'
              y='8'
              width='15'
              height='20'
              rx='3'
              stroke={colors.text}
              strokeWidth='1.8'
            />
            <rect
              x='12'
              y='3'
              width='15'
              height='20'
              rx='3'
              stroke={colors.text}
              strokeWidth='1.8'
            />
          </svg>
          <span>Passage</span>
        </div>
        {data.example ? (
          <span style={{ fontSize: 17, color: colors.muted }}>
            Example conversation
          </span>
        ) : null}
      </div>
      <div
        id='card-copy'
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
          style={{
            fontFamily: font.title.family,
            fontWeight: font.title.weight,
            fontSize: layout.titleSize * scale,
            lineHeight: layout.titleLineHeight,
            letterSpacing: layout.titleLetterSpacing * scale,
            overflowWrap: 'anywhere'
          }}
        >
          {data.title}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: layout.highlightGap * scale
          }}
        >
          <span
            style={{
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '1.6px',
              color: colors.accent,
              marginBottom: 2
            }}
          >
            AI SUMMARY
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
                  fontFamily: font.body.family,
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
      </div>
      <div
        id='card-footer'
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
          fontSize: 14
        }}
      >
        <span>{footerText(data)}</span>
      </div>
    </div>
  )
}

const backgroundImages = new Map<string, Promise<string>>()

function cardBackground(template: SocialTemplate) {
  let background = backgroundImages.get(template.id)
  if (!background) {
    background = readFile(
      join(process.cwd(), 'public', template.backgroundImage)
    )
      .then((data) => `data:image/jpeg;base64,${data.toString('base64')}`)
      .catch((err: unknown) => {
        backgroundImages.delete(template.id)
        throw err
      })
    backgroundImages.set(template.id, background)
  }
  return background
}

export async function renderCard(data: CardData, appearance?: CardAppearance) {
  const text = data.disabled
    ? 'This conversation is unavailable The original is no longer publicly available. Its saved conversation and preview have been disabled. Saved conversation Original unavailable Passage'
    : `${data.title} AI SUMMARY ${data.highlights.join(' ')} ${data.example ? 'Example conversation ' : ''}${footerText(data)} Passage`
  // Keep unthemed publications and disabled cards on the original layout.
  const template =
    appearance && !data.disabled
      ? getSocialTemplate(appearance.templateId)
      : undefined
  const [fonts, background] = await Promise.all([
    cardFonts(
      template?.layout.marker === 'number' && !data.disabled
        ? `${text} ${data.highlights.map((_, index) => String(index + 1).padStart(2, '0')).join(' ')}`
        : text,
      template ? [template.font.title, template.font.body] : undefined
    ),
    template ? cardBackground(template) : Promise.resolve('')
  ])
  const maxHeight = template?.layout.copy.maxHeight ?? 407
  let scale = 1
  let svg = ''
  // Fit every highlight, including wide glyphs and long words.
  // Keep the layout identical for draft previews and public PNGs.
  for (let attempt = 0; attempt < 8; attempt++) {
    let copyHeight = 0
    const card = template ? (
      <TemplateCard
        data={data as SummaryCardData}
        template={template}
        background={background}
        scale={scale}
      />
    ) : (
      <Card data={data} scale={scale} />
    )
    svg = await satori(card, {
      width: 1200,
      height: 630,
      fonts,
      onNodeDetected(node) {
        if (node.props.id === 'card-copy') copyHeight = node.height
      }
      // Deliberately no loadAdditionalAsset: fonts and emoji remain local.
    })
    if (copyHeight <= maxHeight) break
    scale *= Math.min(0.92, (maxHeight - 17) / copyHeight)
  }
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } })
    .render()
    .asPng()
  return new Response(new Uint8Array(png), {
    headers: { ...privateHeaders, 'Content-Type': 'image/png' }
  })
}

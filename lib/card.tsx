import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { renderToReadableStream } from 'react-dom/server.edge'
import { render, type MeasuredNode, type Node } from 'takumi-js'
import { fromJsx } from 'takumi-js/helpers/jsx'
import { Renderer } from 'takumi-js/node'

import { brand } from './brand'
import type { CardAppearance } from './card-appearance'
import type { ResolvedCardDesign } from './paid-design'
import { cardFonts, type CardFont } from './card-fonts'
import {
  cardTextIsReadable,
  cardTextReadabilityMessage,
  initialCardTextFit,
  nextCardTextFit
} from './card-text-fit'
import { AppError } from './errors'
import { privateHeaders } from './http'
import { SocialCard, footerText, type CardData } from './social-card'
import { getSocialTemplate, type SocialTemplate } from './social-templates'

export type { CardData } from './social-card'

// Native caches contain only bundled fonts/artwork, never request-specific layout.
const renderer = new Renderer()
const registeredFonts = new Map<string, Promise<unknown>>()
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

async function registerFonts(fonts: CardFont[]) {
  await Promise.all(
    fonts.map((font) => {
      let registered = registeredFonts.get(font.name)
      if (!registered) {
        registered = renderer.registerFont(font).catch((err: unknown) => {
          registeredFonts.delete(font.name)
          throw err
        })
        registeredFonts.set(font.name, registered)
      }
      return registered
    })
  )
}

function copyLayout(
  node: Node,
  measured: MeasuredNode
): MeasuredNode | undefined {
  if (node.className === 'social-card-copy') return measured
  if ('children' in node) {
    for (const [index, child] of (node.children ?? []).entries()) {
      const found = copyLayout(child, measured.children[index]!)
      if (found) return found
    }
  }
}

export type CardArtwork = { background?: string; logo?: string }
export type CardRenderOptions = { requireReadableText?: boolean }
async function prepareCard(
  data: CardData,
  appearance?: CardAppearance,
  design?: ResolvedCardDesign,
  artwork: CardArtwork = {},
  policy: CardRenderOptions & { measureOnly?: boolean } = {}
) {
  if (
    !policy.measureOnly &&
    !data.disabled &&
    design?.background.kind === 'asset' &&
    !artwork.background
  )
    throw new Error('The selected card background is missing')
  if (
    !policy.measureOnly &&
    !data.disabled &&
    design?.branding.mode === 'custom' &&
    !artwork.logo
  )
    throw new Error('The selected card logo is missing')
  for (const value of Object.values(artwork))
    if (value && !value.startsWith('data:image/webp;base64,'))
      throw new Error('Card artwork must be trusted normalized image bytes')
  const text = data.disabled
    ? 'This passage is unavailable The original is no longer publicly available. Its saved conversation and preview have been disabled. Saved passage Original unavailable Passage'
    : `${data.title} … HIGHLIGHTS ${data.highlights.join(' ')} ${data.example ? 'Example passage ' : ''}${footerText(data, design?.branding)} ${design?.branding.mode === 'custom' ? (design.branding.name ?? '') : brand.name} 01 02 03`
  const template =
    !data.disabled && (design || appearance)
      ? (design?.template ?? getSocialTemplate(appearance!.templateId))
      : undefined
  const [fonts, background] = await Promise.all([
    cardFonts(
      text,
      template ? [template.font.title, template.font.body] : undefined
    ),
    template && !policy.measureOnly
      ? design?.background.kind === 'asset'
        ? Promise.resolve(artwork.background!)
        : cardBackground(template)
      : Promise.resolve('')
  ])
  await registerFonts(fonts)
  // Pin fallbacks per render so earlier requests cannot change glyph selection.
  const options = {
    width: 1200,
    height: 630,
    fontFamilies: [...new Set(fonts.map((font) => font.subsetOf))]
  }
  const maxHeight = template?.layout.copy.maxHeight ?? 407
  let fit = initialCardTextFit()
  let fitted:
    | {
        element: ReturnType<typeof SocialCard>
        node: Node
        css: string[]
        fonts: CardFont[]
        options: typeof options
      }
    | undefined
  // Measure without encoding. Search for the largest fitting text size; a single
  // height ratio over-shrinks wrapped copy because line counts also change.
  while (!fit.done) {
    const element = (
      <SocialCard
        data={data}
        appearance={appearance}
        background={background}
        scale={fit.scale}
        design={design}
        logo={artwork.logo}
      />
    )
    const { node, css } = await fromJsx(element)
    const measured = await renderer.measure(node, { ...options, css })
    const copy = copyLayout(node, measured)
    if (!copy) throw new Error('Social card is missing its copy layout')
    if (copy.height <= maxHeight) {
      fitted = { element, node, css, fonts, options }
    }
    fit = nextCardTextFit(fit, copy.height <= maxHeight)
  }
  if (
    policy.requireReadableText &&
    !data.disabled &&
    !cardTextIsReadable(fit.scale, template?.layout.highlightSize ?? 28)
  )
    throw new AppError(cardTextReadabilityMessage, 400)
  if (fitted) return fitted
  throw new Error('Social card text could not fit within its template')
}

export async function renderCard(
  data: CardData,
  appearance?: CardAppearance,
  design?: ResolvedCardDesign,
  artwork?: CardArtwork,
  policy?: CardRenderOptions
) {
  const { node, css, options } = await prepareCard(
    data,
    appearance,
    design,
    artwork,
    policy
  )
  const webp = await render(node, {
    ...options,
    css,
    renderer,
    emoji: 'from-font',
    format: 'webp',
    quality: 90,
    lossless: false
  })
  return new Response(new Uint8Array(webp), {
    headers: { ...privateHeaders, 'Content-Type': 'image/webp' }
  })
}

function fontCss(font: CardFont) {
  const ranges = font.ranges
    .map(([start, end]) => `U+${start.toString(16)}-${end.toString(16)}`)
    .join(',')
  return `@font-face{font-family:"${font.subsetOf}";font-style:normal;font-weight:${font.weight};src:url(data:font/woff;base64,${font.data.toString('base64')}) format("woff");unicode-range:${ranges}}`
}

/** Same fitted JSX and bundled assets, with browser layout and no image encoding. */
export async function renderCardPreview(
  data: CardData,
  appearance?: CardAppearance,
  design?: ResolvedCardDesign,
  artwork?: CardArtwork,
  policy?: CardRenderOptions
) {
  const { element, fonts } = await prepareCard(
    data,
    appearance,
    design,
    artwork,
    policy
  )
  const html = await renderToReadableStream(
    <html lang='en'>
      <head>
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <meta
          httpEquiv='Content-Security-Policy'
          content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"
        />
        <title>Social card preview</title>
        <style>{`${fonts.map(fontCss).join('\n')}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body>div{transform-origin:top left;transform:scale(calc(100vw / 1200px))}`}</style>
      </head>
      <body>{element}</body>
    </html>
  )
  await html.allReady
  return new Response(html, {
    headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' }
  })
}

/** Validate new work without encoding an image or reading any private artwork. */
export async function assertReadableCardText(
  data: CardData,
  appearance: CardAppearance,
  design?: ResolvedCardDesign
) {
  await prepareCard(
    data,
    appearance,
    design,
    {},
    {
      requireReadableText: true,
      measureOnly: true
    }
  )
}

import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render, type MeasuredNode, type Node } from 'takumi-js'
import { fromJsx } from 'takumi-js/helpers/jsx'
import { Renderer } from 'takumi-js/node'

import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { brand } from '@/lib/brand'
import { renderCard, renderCardPreview } from '@/lib/card'
import { cardFonts } from '@/lib/card-fonts'
import { cardFontFamily } from '@/lib/social-card'
import { socialTemplates } from '@/lib/social-templates'
import { webpDimensions } from '@/lib/webp'

type Layout = {
  node: Node
  left: number
  top: number
  width: number
  height: number
}
const layouts = new Map<Node, Layout[]>()
// oxlint-disable-next-line typescript/unbound-method -- call preserves the renderer receiver.
const measure = Renderer.prototype.measure

function flattenLayout(
  node: Node,
  measured: MeasuredNode,
  left = 0,
  top = 0
): Layout[] {
  left += measured.transform[4]
  top += measured.transform[5]
  return [
    {
      node,
      left,
      top,
      width: measured.width,
      height: measured.height
    },
    ...('children' in node ? (node.children ?? []) : []).flatMap(
      (child, index) =>
        flattenLayout(child, measured.children[index]!, left, top)
    )
  ]
}

function renderedLayout() {
  const node = vi.mocked(render).mock.lastCall![0] as Node
  return layouts.get(node)!
}

function layoutText(nodes = renderedLayout()) {
  return nodes.flatMap(({ node }) => (node.type === 'text' ? [node.text] : []))
}

vi.mock('takumi-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('takumi-js')>()
  return { ...actual, render: vi.fn<typeof render>(actual.render) }
})

vi.mock('takumi-js/helpers/jsx', { spy: true })

beforeEach(() => {
  vi.spyOn(Renderer.prototype, 'measure').mockImplementation(
    async function (this: Renderer, node, options) {
      const measured = await measure.call(this, node, options)
      layouts.set(node, flattenLayout(node, measured))
      return measured
    }
  )
  vi.mocked(render).mockClear()
  vi.mocked(fromJsx).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  layouts.clear()
})

const titleFonts = [
  ...new Map(
    socialTemplates.map(({ font }) => [font.title.family, font.title])
  ).values()
]

it.each(titleFonts)(
  'keeps mixed-script $family titles within the selected bundled font stack',
  async (font) => {
    const text = 'Καλημέρα Привет 你好 🌱'
    const fonts = await cardFonts(text, [font])
    const families = Array.from(
      cardFontFamily(font.family).matchAll(/"([^"]+)"/gu),
      (match) => match[1]
    )
    const missing = Array.from(text).filter((character) => {
      const point = character.codePointAt(0)!
      return !fonts.some(
        ({ subsetOf, ranges }) =>
          families.includes(subsetOf) &&
          ranges.some(([start, end]) => point >= start && point <= end)
      )
    })
    expect(missing).toEqual([])
  }
)

it('covers Chinese copy with uniquely registered bundled font subsets', async () => {
  const text = 'Python 在容器中的線索：有幾種方法可以在運行時檢測環境。你好世界'
  const fonts = await cardFonts(text)
  expect(new Set(fonts.map(({ name }) => name)).size).toBe(fonts.length)
  expect(
    fonts.filter(({ subsetOf }) => subsetOf === 'Noto Sans SC').length
  ).toBeGreaterThan(1)
  const missing = Array.from(text).filter((character) => {
    const point = character.codePointAt(0)!
    return !fonts.some(({ ranges }) =>
      ranges.some(([start, end]) => point >= start && point <= end)
    )
  })
  expect(missing).toEqual([])
  await renderCard({
    title: text,
    highlights: ['你好世界'],
    provider: 'chatgpt'
  })
  expect(layoutText()).toContain(text)
})

it('renders the legacy layout as a private 1200 × 630 WebP offline', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    throw new Error('Card rendering must be offline')
  })
  vi.stubGlobal('fetch', fetch)
  const data = {
    title: 'Small ideas, big possibilities 🌱',
    highlights: [
      'A thoughtful question can change the conversation.',
      '你好世界 — Καλημέρα — Привет. Keep asking.'
    ],
    provider: 'claude' as const
  }
  const first = await renderCard(data)
  const bytes = Buffer.from(await first.arrayBuffer())
  expect(first.headers.get('content-type')).toBe('image/webp')
  expect(first.headers.get('cache-control')).toContain('no-store')
  expect(webpDimensions(bytes)).toEqual({ width: 1200, height: 630 })
  expect(fetch).not.toHaveBeenCalled()
  const text = layoutText()
  expect(text).toEqual(
    expect.arrayContaining([
      'HIGHLIGHTS',
      ...data.highlights,
      'A passage from Claude worth sharing'
    ])
  )
  expect(text).not.toContain('Read the passage')
})

const wideCharacterCopy = {
  name: 'wide characters',
  title: '你好世界'.repeat(15),
  highlights: ['界'.repeat(100), '你'.repeat(100), '好'.repeat(100)]
}

const fullLengthCopyCases = [
  wideCharacterCopy,
  {
    name: 'unbroken words',
    title: 'W'.repeat(60),
    highlights: ['W'.repeat(100), 'M'.repeat(100), 'B'.repeat(100)]
  },
  {
    name: 'emoji and mixed scripts',
    title: '🌱你好'.repeat(20),
    highlights: ['🌱'.repeat(100), '你🌱'.repeat(50), '界á'.repeat(50)]
  }
]

it.each(fullLengthCopyCases)(
  'fits every summary highlight above the footer with $name',
  async (data) => {
    await renderCard({ ...data, provider: 'chatgpt' })
    const nodes = renderedLayout()
    const copy = nodes.find(
      (node) => node.node.className === 'social-card-copy'
    )!
    const footer = nodes.find(
      (node) => node.node.className === 'social-card-footer'
    )!
    expect(copy.height).toBeLessThanOrEqual(407)
    expect(copy.top + copy.height).toBeLessThan(footer.top)
    expect(layoutText(nodes)).toEqual(
      expect.arrayContaining([
        data.title,
        ...data.highlights,
        'A passage from ChatGPT worth sharing'
      ])
    )
  }
)

it('uses the same generic disabled card regardless of saved appearance', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request')
    })
  )
  const disabled = await renderCard({ disabled: true })
  const disabledText = layoutText()
  expect(disabledText).toContain('This passage is unavailable')
  expect(disabledText).toContain('Original unavailable')
  expect(disabledText.join(' ')).not.toMatch(/ChatGPT|Claude|A passage from/u)
  expect(disabledText).not.toContain('HIGHLIGHTS')
  expect(disabled.headers.get('cache-control')).toContain('no-store')
  const themed = await renderCard(
    { disabled: true },
    { templateId: 'midnight-observatory' }
  )
  expect(Buffer.from(await themed.arrayBuffer())).toEqual(
    Buffer.from(await disabled.arrayBuffer())
  )
})

// Each design has different fonts and geometry. Exercise all text risks in one render per design.
it.each(socialTemplates)(
  'renders $name assets offline and fits every full-length highlight',
  async (template) => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      throw new Error('Template rendering must not depend on the network')
    })
    vi.stubGlobal('fetch', fetch)
    const data = {
      title: '🌱你W'.repeat(20),
      highlights: ['界'.repeat(100), 'W'.repeat(100), '🌱'.repeat(100)],
      provider: 'claude' as const
    }
    const response = await renderCard(data, { templateId: template.id })
    const bytes = Buffer.from(await response.arrayBuffer())
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(webpDimensions(bytes)).toEqual({ width: 1200, height: 630 })
    expect(fetch).not.toHaveBeenCalled()
    const nodes = renderedLayout()
    expect(layoutText(nodes)).toEqual(
      expect.arrayContaining([
        data.title,
        ...data.highlights,
        'Passage',
        'HIGHLIGHTS',
        'A passage from Claude worth sharing'
      ])
    )
    expect(layoutText(nodes)).not.toContain('Read the passage')
    const copy = nodes.find(
      (node) => node.node.className === 'social-card-copy'
    )!
    const footer = nodes.find(
      (node) => node.node.className === 'social-card-footer'
    )!
    expect(copy.height).toBeLessThanOrEqual(template.layout.copy.maxHeight)
    expect(copy.top + copy.height).toBeLessThan(footer.top)
    expect(copy.left + copy.width).toBeLessThanOrEqual(1200)
    const artwork = nodes.find(
      ({ node }) =>
        node.type === 'image' &&
        typeof node.src === 'string' &&
        node.src.startsWith('data:image/jpeg;')
    )!
    expect(artwork).toBeDefined()
    const fonts = await cardFonts(data.title, [
      template.font.title,
      template.font.body
    ])
    for (const face of [
      template.font.title,
      template.font.body,
      { family: 'Inter', weight: 600 }
    ]) {
      expect(
        fonts.some(
          (font) => font.subsetOf === face.family && font.weight === face.weight
        )
      ).toBe(true)
    }
  }
)

// The numbered layout has the narrowest copy box and smallest height allowance.
it('paints an ellipsis on a two-line title without shortening the saved title', async () => {
  const template = socialTemplates.find(({ id }) => id === 'makers-workbench')!
  const fullTitle =
    'Release verified search accessibility fixes; defer the rest'
  const data = {
    title: fullTitle,
    highlights: ['Keep untested panels on the backlog.'],
    provider: 'chatgpt' as const
  }
  const response = await renderCard(data, { templateId: template.id })
  const withEllipsis = Buffer.from(await response.arrayBuffer())
  const title = renderedLayout().find(
    ({ node }) => node.className === 'social-card-title'
  )!
  const lineHeight = template.layout.titleSize * template.layout.titleLineHeight

  expect(title.height).toBeCloseTo(lineHeight * 2, 0)
  expect(title.width).toBeLessThanOrEqual(template.layout.copy.width)
  expect(layoutText()).toContain(fullTitle)
  expect(data.title).toBe(fullTitle)

  // Height alone passes even when Takumi silently clips without painting dots.
  const [tree, options] = vi.mocked(render).mock.lastCall!
  title.node.style = { ...title.node.style, textOverflow: 'clip' }
  const withoutEllipsis = await render(tree, options)
  expect(withEllipsis).not.toEqual(Buffer.from(withoutEllipsis))
})

// The numbered layout has the narrowest copy box and smallest height allowance.
it('fits three maximum-length wide highlights while using the tightest template’s available space', async () => {
  const template = socialTemplates.find(({ id }) => id === 'makers-workbench')!
  await renderCard(
    { ...wideCharacterCopy, provider: 'chatgpt' },
    { templateId: template.id }
  )
  const nodes = renderedLayout()
  const copy = nodes.find((node) => node.node.className === 'social-card-copy')!
  const footer = nodes.find(
    (node) => node.node.className === 'social-card-footer'
  )!
  expect(copy.height).toBeLessThanOrEqual(template.layout.copy.maxHeight)
  expect(copy.height).toBeGreaterThan(template.layout.copy.maxHeight / 2)
  expect(copy.top + copy.height).toBeLessThan(footer.top)
  expect(layoutText(nodes)).toEqual(
    expect.arrayContaining([
      wideCharacterCopy.title,
      ...wideCharacterCopy.highlights
    ])
  )
})

it('previews the same fitted template as escaped HTML with bundled assets and no image encoding', async () => {
  const data = {
    title: '<script>alert("hi")</script> ' + '界'.repeat(40),
    highlights: ['界'.repeat(100), 'W'.repeat(100), '🌱'.repeat(100)],
    provider: 'claude' as const,
    example: true
  }
  const appearance = { templateId: 'makers-workbench' as const }
  await renderCard(data, appearance)
  const imageTree = renderedLayout()[0]!.node
  const fittedIndex = vi
    .mocked(fromJsx)
    .mock.settledResults.findIndex(
      (result) => result.type === 'fulfilled' && result.value.node === imageTree
    )
  const fittedElement = vi.mocked(fromJsx).mock.calls[
    fittedIndex
  ]![0] as ReactElement
  const expectedBody = renderToStaticMarkup(fittedElement)
  vi.mocked(render).mockClear()
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    throw new Error('Preview assets must be offline')
  })
  vi.stubGlobal('fetch', fetch)
  const response = await renderCardPreview(data, appearance)
  const html = await response.text()
  expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(html.match(/<body>([\s\S]*)<\/body>/u)?.[1]).toBe(expectedBody)
  expect(html).toContain('&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('data:image/jpeg;base64,')
  expect(html).toContain('@font-face')
  expect(html).toContain('data:font/woff;base64,')
  expect(html).toContain('unicode-range:')
  expect(html).toContain('transform:scale(calc(100vw / 1200px))')
  expect(html).toContain('class="social-card-copy"')
  expect(html).toContain('Example passage')
  expect(html).toContain('HIGHLIGHTS')
  expect(html).not.toContain('Read the passage')
  expect(html).toContain(brand.mantra)
  expect(html).not.toContain('A passage from')
  expect(render).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

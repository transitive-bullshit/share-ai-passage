import { createHash } from 'node:crypto'
import { createElement } from 'react'
import satori, { type SatoriNode } from 'satori'

import { afterEach, expect, it, vi } from 'vitest'

import { renderCard } from '@/lib/card'
import { cardFonts } from '@/lib/card-fonts'
import { socialTemplates } from '@/lib/social-templates'

const layouts = vi.hoisted(() => [] as SatoriNode[][])

vi.mock('satori', async (importOriginal) => {
  const actual = await importOriginal<typeof import('satori')>()
  return {
    ...actual,
    default: ((element, options) => {
      const nodes: SatoriNode[] = []
      layouts.push(nodes)
      return actual.default(element, {
        ...options,
        onNodeDetected(node) {
          nodes.push(node)
          options.onNodeDetected?.(node)
        }
      })
    }) satisfies typeof satori
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  layouts.length = 0
})

it('finds every glyph across bundled Chinese font subsets', async () => {
  const text = 'Python 在容器中的線索：有幾種方法可以在運行時檢測環境。你好世界'
  const missing: string[] = []
  await satori(
    createElement(
      'div',
      { style: { fontFamily: 'Inter', fontSize: 30 } },
      text
    ),
    {
      width: 1200,
      height: 200,
      fonts: await cardFonts(text),
      async loadAdditionalAsset(_language, characters) {
        missing.push(characters)
        return []
      }
    }
  )
  expect(missing).toEqual([])
})

it('renders a deterministic 1200 × 630 PNG without remote fonts or emoji', async () => {
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
  const second = Buffer.from(await (await renderCard(data)).arrayBuffer())
  expect(first.headers.get('content-type')).toBe('image/png')
  expect(first.headers.get('cache-control')).toContain('no-store')
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(bytes.readUInt32BE(16)).toBe(1200)
  expect(bytes.readUInt32BE(20)).toBe(630)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    createHash('sha256').update(second).digest('hex')
  )
  expect(fetch).not.toHaveBeenCalled()
  const text = layouts.at(-1)!.flatMap((node) => node.textContent ?? [])
  expect(text).toEqual(
    expect.arrayContaining([
      'AI SUMMARY',
      ...data.highlights,
      'A passage from Claude worth sharing'
    ])
  )
  expect(text.join(' ')).not.toContain('A conversation with')
  expect(text).not.toContain('A passage worth sharing')
  expect(text).not.toContain('The conversation, kept in context.')
})

const fullLengthCopyCases = [
  {
    name: 'wide characters',
    title: '你好世界'.repeat(15),
    highlights: ['界'.repeat(100), '你'.repeat(100), '好'.repeat(100)]
  },
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
    const response = await renderCard({ ...data, provider: 'chatgpt' })
    const nodes = layouts.at(-1)!
    const copy = nodes.find((node) => node.props.id === 'card-copy')!
    const footer = nodes.find((node) => node.props.id === 'card-footer')!
    expect(copy.height).toBeLessThanOrEqual(407)
    expect(copy.top + copy.height).toBeLessThan(footer.top)
    expect(nodes.flatMap((node) => node.textContent ?? [])).toEqual(
      expect.arrayContaining([
        data.title,
        ...data.highlights,
        'A passage from ChatGPT worth sharing'
      ])
    )
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(5000)
  }
)

it('preserves legacy excerpt cards and uses a generic disabled card', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Unexpected network request')
    })
  )
  const full = await renderCard({
    title: '你好世界'.repeat(15),
    excerpt: '这是一个值得分享的对话。'.repeat(20),
    provider: 'chatgpt',
    speaker: 'user'
  })
  const legacyNodes = layouts.at(-1)!
  const legacyText = legacyNodes.flatMap((node) => node.textContent ?? [])
  expect(legacyText).toContain('Human')
  expect(legacyText).toContain('A passage from ChatGPT worth sharing')
  expect(legacyText.join(' ')).not.toContain('A conversation with')
  expect(legacyText).not.toContain('AI SUMMARY')
  const disabled = await renderCard({ disabled: true })
  const disabledText = layouts.at(-1)!.flatMap((node) => node.textContent ?? [])
  expect(disabledText).toContain('This conversation is unavailable')
  expect(disabledText).toContain('Original unavailable')
  expect(disabledText.join(' ')).not.toMatch(/ChatGPT|Claude|A passage from/u)
  expect(disabledText).not.toContain('AI SUMMARY')
  expect((await full.arrayBuffer()).byteLength).toBeGreaterThan(5000)
  expect(disabled.headers.get('cache-control')).toContain('no-store')
  expect((await disabled.arrayBuffer()).byteLength).toBeGreaterThan(5000)
})

it.each(socialTemplates)(
  'embeds $name artwork and fonts offline with deterministic copy',
  async (template) => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      throw new Error('Template rendering must not depend on the network')
    })
    vi.stubGlobal('fetch', fetch)
    const data = {
      title: 'Small ideas, big possibilities 🌱',
      highlights: [
        'A thoughtful question can change the conversation.',
        '你好世界 — Καλημέρα — Привет. Keep asking.',
        'Useful ideas become better when we share them.'
      ],
      provider: 'claude' as const
    }
    const appearance = { templateId: template.id }
    const first = await renderCard(data, appearance)
    const bytes = Buffer.from(await first.arrayBuffer())
    const second = Buffer.from(
      await (await renderCard(data, appearance)).arrayBuffer()
    )
    expect(first.headers.get('content-type')).toBe('image/png')
    expect(bytes.readUInt32BE(16)).toBe(1200)
    expect(bytes.readUInt32BE(20)).toBe(630)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex')
    )
    expect(bytes.byteLength).toBeGreaterThan(20_000)
    expect(fetch).not.toHaveBeenCalled()
    const nodes = layouts.at(-1)!
    expect(nodes.flatMap((node) => node.textContent ?? [])).toEqual(
      expect.arrayContaining([
        data.title,
        ...data.highlights,
        'Passage',
        'AI SUMMARY',
        'A passage from Claude worth sharing'
      ])
    )
    const visibleText = nodes.flatMap((node) => node.textContent ?? [])
    expect(visibleText.join(' ')).not.toContain('A conversation with')
    expect(visibleText).not.toContain('A passage worth sharing')
    expect(visibleText).not.toContain('The conversation, kept in context.')
    const artwork = nodes.find((node) => typeof node.props.src === 'string')!
    expect(artwork.props.src).toMatch(/^data:image\/jpeg;base64,/u)
    const fonts = await cardFonts(data.title, [
      template.font.title,
      template.font.body
    ])
    for (const face of [template.font.title, template.font.body]) {
      expect(
        fonts.some(
          (font) => font.name === face.family && font.weight === face.weight
        )
      ).toBe(true)
    }
  }
)

it.each(
  socialTemplates.flatMap((template) =>
    fullLengthCopyCases.map((data) => ({ template, ...data }))
  )
)('fits $name copy within $template.name', async ({ template, ...data }) => {
  const response = await renderCard(
    { ...data, provider: 'chatgpt' },
    { templateId: template.id }
  )
  const nodes = layouts.at(-1)!
  const copy = nodes.find((node) => node.props.id === 'card-copy')!
  const footer = nodes.find((node) => node.props.id === 'card-footer')!
  expect(copy.height).toBeLessThanOrEqual(template.layout.copy.maxHeight)
  expect(copy.top + copy.height).toBeLessThan(footer.top)
  expect(copy.left + copy.width).toBeLessThanOrEqual(1200)
  expect(nodes.flatMap((node) => node.textContent ?? [])).toEqual(
    expect.arrayContaining([
      data.title,
      ...data.highlights,
      'A passage from ChatGPT worth sharing'
    ])
  )
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(20_000)
})

it('does not apply an appearance to disabled or legacy excerpt cards', async () => {
  for (const data of [
    { disabled: true as const },
    {
      title: 'An existing conversation',
      excerpt: 'An unchanged passage.',
      speaker: 'user' as const,
      provider: 'chatgpt' as const
    }
  ]) {
    const plain = Buffer.from(await (await renderCard(data)).arrayBuffer())
    const themed = Buffer.from(
      await (
        await renderCard(data, { templateId: 'midnight-observatory' })
      ).arrayBuffer()
    )
    expect(themed.equals(plain)).toBe(true)
  }
})

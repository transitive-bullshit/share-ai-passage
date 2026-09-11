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

it('renders the legacy layout as a private 1200 × 630 PNG offline', async () => {
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
  expect(first.headers.get('content-type')).toBe('image/png')
  expect(first.headers.get('cache-control')).toContain('no-store')
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(bytes.readUInt32BE(16)).toBe(1200)
  expect(bytes.readUInt32BE(20)).toBe(630)
  expect(fetch).not.toHaveBeenCalled()
  const text = layouts.at(-1)!.flatMap((node) => node.textContent ?? [])
  expect(text).toEqual(
    expect.arrayContaining([
      'AI SUMMARY',
      ...data.highlights,
      'A passage from Claude worth sharing'
    ])
  )
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
  const disabledText = layouts.at(-1)!.flatMap((node) => node.textContent ?? [])
  expect(disabledText).toContain('This conversation is unavailable')
  expect(disabledText).toContain('Original unavailable')
  expect(disabledText.join(' ')).not.toMatch(/ChatGPT|Claude|A passage from/u)
  expect(disabledText).not.toContain('AI SUMMARY')
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
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16)).toBe(1200)
    expect(bytes.readUInt32BE(20)).toBe(630)
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
    const copy = nodes.find((node) => node.props.id === 'card-copy')!
    const footer = nodes.find((node) => node.props.id === 'card-footer')!
    expect(copy.height).toBeLessThanOrEqual(template.layout.copy.maxHeight)
    expect(copy.top + copy.height).toBeLessThan(footer.top)
    expect(copy.left + copy.width).toBeLessThanOrEqual(1200)
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

// The numbered layout has the narrowest copy box and smallest height allowance.
it('fits three maximum-length wide highlights in the tightest template', async () => {
  const template = socialTemplates.find(({ id }) => id === 'makers-workbench')!
  await renderCard(
    { ...wideCharacterCopy, provider: 'chatgpt' },
    { templateId: template.id }
  )
  const nodes = layouts.at(-1)!
  const copy = nodes.find((node) => node.props.id === 'card-copy')!
  const footer = nodes.find((node) => node.props.id === 'card-footer')!
  expect(copy.height).toBeLessThanOrEqual(template.layout.copy.maxHeight)
  expect(copy.top + copy.height).toBeLessThan(footer.top)
  expect(nodes.flatMap((node) => node.textContent ?? [])).toEqual(
    expect.arrayContaining([
      wideCharacterCopy.title,
      ...wideCharacterCopy.highlights
    ])
  )
})

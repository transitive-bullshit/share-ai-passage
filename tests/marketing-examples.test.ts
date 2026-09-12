import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { GET as exampleImage } from '@/app/examples/[exampleId]/image/route'
import ExamplePage, { generateMetadata } from '@/app/examples/[exampleId]/page'
import { renderCard } from '@/lib/card'
import { getMarketingExample } from '@/lib/marketing-examples'

const missing = vi.hoisted(() => new Error('Example not found'))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw missing
  }
}))
vi.mock('@/lib/card', () => ({ renderCard: vi.fn<typeof renderCard>() }))

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_TARGET_ENV', 'production')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'passage.example')
  vi.mocked(renderCard)
    .mockReset()
    .mockResolvedValue(new Response('example card'))
})

afterEach(() => vi.unstubAllEnvs())

it.each([
  ['share-your-ai-chats', 'margin-notes'],
  ['share-your-ai-chats-after-dark', 'midnight-observatory']
])(
  'links %s metadata to its fixed card style',
  async (exampleId, templateId) => {
    const params = Promise.resolve({ exampleId })
    const example = getMarketingExample(exampleId)!
    const url = `https://passage.example/examples/${exampleId}`
    const metadata = await generateMetadata({ params })
    expect(metadata).toMatchObject({
      title: example.title,
      openGraph: {
        url,
        title: example.title,
        images: [{ url: `${url}/image`, width: 1200, height: 630 }]
      },
      twitter: {
        card: 'summary_large_image',
        images: [{ url: `${url}/image` }]
      }
    })
    const response = await exampleImage(
      new Request(`${url}/image?template=friendly-lab`),
      { params }
    )
    expect(await response.text()).toBe('example card')
    expect(renderCard).toHaveBeenCalledExactlyOnceWith(
      {
        title: example.title,
        highlights: example.highlights,
        provider: 'chatgpt',
        example: true
      },
      { templateId }
    )
  }
)

it.each(['missing-example', 'toString'])(
  'returns not found for unsupported example %s without rendering a card',
  async (exampleId) => {
    const params = Promise.resolve({ exampleId })
    await expect(ExamplePage({ params })).rejects.toBe(missing)
    await expect(generateMetadata({ params })).rejects.toBe(missing)
    const response = await exampleImage(
      new Request(`https://passage.example/examples/${exampleId}/image`),
      { params }
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(renderCard).not.toHaveBeenCalled()
  }
)

it('clearly labels the authored conversation without a claimed provider source', async () => {
  const page = await ExamplePage({
    params: Promise.resolve({ exampleId: 'share-your-ai-chats' })
  })
  const html = renderToStaticMarkup(page)
  expect(html).toContain('Example passage')
  expect(html).toContain(
    'An illustrative conversation about sharing with Passage.'
  )
  expect(html).toContain('Copy passage link')
  expect(html).toContain('Create a passage')
  expect(html).not.toMatch(/href="https?:\/\/(?:chatgpt\.com|claude\.ai)/)
  expect(html).not.toContain('A conversation with')
})

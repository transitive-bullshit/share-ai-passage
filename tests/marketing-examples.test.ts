import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { GET as exampleImage } from '@/app/examples/[exampleId]/image/route'
import ExamplePage from '@/app/examples/[exampleId]/page'
import { renderCard } from '@/lib/card'
import { getMarketingExample } from '@/lib/marketing-examples'

const missing = vi.hoisted(() => new Error('Example not found'))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`Redirect: ${url}`)
  },
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
  'redirects %s to its publication and renders its fixed card style',
  async (exampleId, templateId) => {
    const params = Promise.resolve({ exampleId })
    const example = getMarketingExample(exampleId)!
    const url = `https://passage.example/examples/${exampleId}`
    await expect(ExamplePage({ params })).rejects.toThrow(
      `Redirect: ${example.shareUrl}`
    )
    const response = await exampleImage(
      new Request(`${url}/image?template=friendly-lab`),
      { params }
    )
    expect(await response.text()).toBe('example card')
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(response.headers.get('cdn-cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    )
    expect(response.headers.get('vercel-cdn-cache-control')).toBe(
      'public, max-age=31536000, immutable'
    )
    expect(renderCard).toHaveBeenCalledExactlyOnceWith(
      {
        title: example.title,
        highlights: example.highlights,
        provider: 'chatgpt'
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
    const response = await exampleImage(
      new Request(`https://passage.example/examples/${exampleId}/image`),
      { params }
    )
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(renderCard).not.toHaveBeenCalled()
  }
)

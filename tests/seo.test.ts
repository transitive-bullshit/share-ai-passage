import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as publicImage } from '@/app/[provider]/[publicationId]/image/route'
import ReaderPage, {
  generateMetadata
} from '@/app/[provider]/[publicationId]/page'
import { JsonLd } from '@/components/json-ld'
import { brand } from '@/lib/brand'
import { renderCard } from '@/lib/card'
import { appUrl, indexingEnabled } from '@/lib/config'
import { privateHeaders } from '@/lib/http'
import { homepageJsonLd, passageJsonLd, publicRobots } from '@/lib/seo'
import nextConfig from '../next.config'

const service = vi.hoisted(() => ({
  getPublication: vi.fn<() => Promise<ReturnType<typeof publication> | null>>(),
  checkAvailability: vi.fn<() => Promise<void>>()
}))
const missing = vi.hoisted(() => new Error('Passage not found'))
vi.mock('@/lib/service', () => service)
vi.mock('@/lib/card', () => ({ renderCard: vi.fn<typeof renderCard>() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw missing
  }
}))
vi.mock('next/server', () => ({ after: vi.fn<() => void>() }))

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('VERCEL_TARGET_ENV', '')
  vi.stubEnv('PASSAGE_PRODUCTION_LOCAL', '')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'passage.example')
  vi.stubEnv('VERCEL_BRANCH_URL', 'passage-git-feature.vercel.app')
  vi.stubEnv('VERCEL_URL', 'passage-deployment.vercel.app')
  service.getPublication.mockReset()
  vi.mocked(renderCard)
    .mockReset()
    .mockImplementation(
      async () =>
        new Response('card', {
          headers: { ...privateHeaders, 'Content-Type': 'image/webp' }
        })
    )
})

afterEach(() => vi.unstubAllEnvs())

describe('environment indexing policy', () => {
  it.each([
    { name: 'Vercel production', env: {}, expected: true },
    {
      name: 'explicit production target',
      env: { VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'production' },
      expected: true
    },
    {
      name: 'preview target overrides production',
      env: { VERCEL_TARGET_ENV: 'preview' },
      expected: false
    },
    {
      name: 'staging target overrides production',
      env: { VERCEL_TARGET_ENV: 'staging' },
      expected: false
    },
    {
      name: 'unknown target overrides production',
      env: { VERCEL_TARGET_ENV: 'unknown' },
      expected: false
    },
    {
      name: 'preview fallback',
      env: { VERCEL_ENV: 'preview' },
      expected: false
    },
    { name: 'missing environment', env: { VERCEL_ENV: '' }, expected: false },
    {
      name: 'unknown environment',
      env: { VERCEL_ENV: 'unknown' },
      expected: false
    },
    { name: 'local production build', env: { VERCEL: '' }, expected: false },
    {
      name: 'explicit local production wrapper',
      env: { PASSAGE_PRODUCTION_LOCAL: '1' },
      expected: false
    },
    {
      name: 'development with pulled production values',
      env: { NODE_ENV: 'development' },
      expected: false
    },
    { name: 'unit test runtime', env: { NODE_ENV: 'test' }, expected: false }
  ])(
    'uses matching HTML and global header rules for $name',
    async ({ env, expected }) => {
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value!)
      expect(indexingEnabled()).toBe(expected)
      expect(publicRobots()).toMatchObject({
        index: expected,
        follow: expected
      })
      const headers = await nextConfig.headers!()
      const global = headers.find(({ source }) => source === '/:path*')!
      expect(global.headers.some(({ key }) => key === 'X-Robots-Tag')).toBe(
        !expected
      )
      expect(global.headers).toContainEqual({
        key: 'X-Content-Type-Options',
        value: 'nosniff'
      })
      expect(
        headers.find(({ source }) => source === '/api/:path*')!.headers
      ).toContainEqual({
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow, noarchive'
      })
    }
  )
})

describe('structured data', () => {
  it('describes the actual application using the production canonical origin', () => {
    const data = homepageJsonLd()
    expect(data['@graph'].map((item) => item['@type'])).toEqual([
      'WebSite',
      'WebApplication'
    ])
    for (const entity of data['@graph']) {
      expect(entity).toMatchObject({
        name: brand.name,
        url: 'https://passage.example',
        description: brand.productDescription
      })
    }
  })

  it('keeps text intact without allowing an HTML script escape', () => {
    const title = '</script><img src=x onerror=alert(1)> & “你好”'
    const data = passageJsonLd({
      title,
      description: '<!-- unsafe text -->',
      url: 'https://passage.example/chatgpt/id',
      sourceUrl: 'https://chatgpt.com/share/source'
    })
    const html = renderToStaticMarkup(createElement(JsonLd, { data }))
    expect(html.match(/<script\b/g)).toHaveLength(1)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<!--')
    const encoded = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1]!
    expect(JSON.parse(encoded)).toMatchObject({
      name: title,
      mainEntity: { name: title, isBasedOn: 'https://chatgpt.com/share/source' }
    })
    expect(data).not.toHaveProperty('author')
    expect(data).not.toHaveProperty('inLanguage')
    expect(data.mainEntity).not.toHaveProperty('license')
    expect(data.mainEntity).not.toHaveProperty('text')
  })
})

const params = Promise.resolve({
  provider: 'chatgpt',
  publicationId: 'publication-id'
})
const savedTitle = 'A reviewed passage title'
const savedHighlight = 'A reviewed highlight.'
const transcript = 'SAVED_TRANSCRIPT_ONLY_IN_READER'
const sourceUrl = 'https://chatgpt.com/share/source-id'

function publication(disabled = false) {
  return {
    disabled,
    publication: { title: savedTitle, appearance: null },
    preview: { title: savedTitle, highlights: [savedHighlight] },
    source: { id: 'source-id', provider: 'chatgpt', canonicalUrl: sourceUrl },
    snapshot: {
      capturedAt: new Date('2026-09-12T00:00:00Z'),
      messages: [
        {
          id: 'message-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: transcript }]
        }
      ]
    }
  }
}

describe('public and unavailable reader metadata', () => {
  it('indexes an active production passage with its reviewed text and source, without duplicating the transcript', async () => {
    service.getPublication.mockResolvedValue(publication())
    const url = `${appUrl()}/chatgpt/publication-id`
    const metadata = await generateMetadata({ params })
    expect(metadata).toMatchObject({
      title: savedTitle,
      description: savedHighlight,
      robots: { index: true, follow: true },
      alternates: { canonical: url },
      openGraph: { title: savedTitle, url, images: [{ url: `${url}/image` }] },
      twitter: { title: savedTitle, images: [{ url: `${url}/image` }] }
    })
    const html = renderToStaticMarkup(await ReaderPage({ params }))
    const encoded = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    )![1]!
    expect(JSON.parse(encoded)).toMatchObject({
      name: savedTitle,
      description: savedHighlight,
      mainEntity: { isBasedOn: sourceUrl }
    })
    expect(encoded).not.toContain(transcript)
    expect(html).toContain(transcript)
  })

  it('keeps an active preview passage noindex and canonical to its preview origin', async () => {
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview')
    service.getPublication.mockResolvedValue(publication())
    expect(await generateMetadata({ params })).toMatchObject({
      robots: { index: false, follow: false, noarchive: true },
      alternates: {
        canonical:
          'https://passage-git-feature.vercel.app/chatgpt/publication-id'
      }
    })
  })

  it('removes all saved information and content JSON-LD when a production publication is disabled', async () => {
    service.getPublication.mockResolvedValue(publication(true))
    const metadata = await generateMetadata({ params })
    expect(metadata).toMatchObject({
      robots: { index: false, follow: false, noarchive: true },
      alternates: { canonical: null },
      openGraph: { title: 'This passage is unavailable', images: [] },
      twitter: {
        title: 'This passage is unavailable',
        card: 'summary',
        images: []
      }
    })
    const html = renderToStaticMarkup(await ReaderPage({ params }))
    const output = JSON.stringify(metadata) + html
    for (const text of [savedTitle, savedHighlight, transcript, sourceUrl])
      expect(output).not.toContain(text)
    expect(html).not.toContain('application/ld+json')
    expect(output).not.toContain('/brand/social-preview.png')
  })

  it('does not inherit homepage cards or indexing for a missing publication', async () => {
    service.getPublication.mockResolvedValue(null)
    expect(await generateMetadata({ params })).toMatchObject({
      robots: { index: false, follow: false },
      alternates: { canonical: null },
      openGraph: { title: 'Passage not found', images: [] },
      twitter: { title: 'Passage not found', images: [] }
    })
    await expect(ReaderPage({ params })).rejects.toBe(missing)
  })
})

describe('public card indexing without changing removal caching', () => {
  it.each(['production', 'preview', 'staging', 'unknown'])(
    'serves active cards with matching %s indexing and no-store',
    async (environment) => {
      vi.stubEnv('VERCEL_TARGET_ENV', environment)
      service.getPublication.mockResolvedValue(publication())
      const response = await publicImage(
        new Request('https://passage.example/chatgpt/publication-id/image'),
        { params }
      )
      expect(response.headers.get('x-robots-tag')).toBe(
        environment === 'production'
          ? 'index, follow, noarchive'
          : 'noindex, nofollow, noarchive'
      )
      expect(response.headers.get('cache-control')).toContain('no-store')
      expect(response.headers.get('content-type')).toBe('image/webp')
    }
  )

  it('keeps disabled and missing cards noindex on production', async () => {
    service.getPublication.mockResolvedValue(publication(true))
    const response = await publicImage(
      new Request('https://passage.example/chatgpt/publication-id/image'),
      { params }
    )
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(renderCard).toHaveBeenCalledExactlyOnceWith({ disabled: true })
    service.getPublication.mockResolvedValue(null)
    const missingResponse = await publicImage(
      new Request('https://passage.example/chatgpt/publication-id/image'),
      { params }
    )
    expect(missingResponse.status).toBe(404)
    expect(missingResponse.headers.get('x-robots-tag')).toContain('noindex')
  })
})

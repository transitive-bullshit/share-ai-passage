import type { Metadata } from 'next'

import { brand } from './brand'
import { appUrl, indexingEnabled } from './config'

export const noindex = { index: false, follow: false, noarchive: true } as const

export function publicRobots() {
  return indexingEnabled()
    ? { index: true, follow: true, noarchive: true }
    : noindex
}

type PageDescription = {
  title: string
  description: string
  url: string
  image: { url: string; type: string }
  type?: 'website' | 'article'
}

export function publicPageMetadata({
  title,
  description,
  url,
  image,
  type = 'article'
}: PageDescription): Metadata {
  const socialImage = { ...image, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: publicRobots(),
    openGraph: {
      title,
      description,
      type,
      siteName: brand.name,
      url,
      images: [socialImage]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [socialImage]
    }
  }
}

export function unavailableMetadata(
  title = 'Passage not found',
  description = 'This passage does not exist, or its link is incomplete.'
): Metadata {
  // Explicitly replace nested metadata; none may inherit a different page's card.
  return {
    title,
    description,
    robots: noindex,
    alternates: { canonical: null },
    openGraph: { title, description, type: 'website', images: [] },
    twitter: { title, description, card: 'summary', images: [] }
  }
}

type PublicImageCache = 'deployment' | 'publication'

const browserImageCache = 'public, max-age=0, must-revalidate'
const downstreamImageCache =
  'public, max-age=86400, stale-while-revalidate=604800'
const vercelImageCache = {
  deployment: 'public, max-age=31536000, immutable',
  publication: 'public, max-age=2592000'
} satisfies Record<PublicImageCache, string>

/** The renderer defaults to private draft headers; public routes opt into indexing and layered CDN caching. */
export function publicImageResponse(
  response: Response,
  {
    available = true,
    cache
  }: { available?: boolean; cache?: PublicImageCache } = {}
) {
  if (cache) {
    response.headers.set('Cache-Control', browserImageCache)
    response.headers.set('CDN-Cache-Control', downstreamImageCache)
    response.headers.set('Vercel-CDN-Cache-Control', vercelImageCache[cache])
  } else {
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.delete('CDN-Cache-Control')
    response.headers.delete('Vercel-CDN-Cache-Control')
  }
  response.headers.set(
    'X-Robots-Tag',
    available && indexingEnabled()
      ? 'index, follow, noarchive'
      : 'noindex, nofollow, noarchive'
  )
  return response
}

export function homepageJsonLd() {
  const url = appUrl()
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${url}/#website`,
        name: brand.name,
        url,
        description: brand.productDescription,
        about: { '@id': `${url}/#application` }
      },
      {
        '@type': 'WebApplication',
        '@id': `${url}/#application`,
        name: brand.name,
        url,
        description: brand.productDescription,
        applicationCategory: 'ProductivityApplication'
      }
    ]
  }
}

export function passageJsonLd({
  title,
  description,
  url,
  sourceUrl
}: {
  title: string
  description: string
  url: string
  sourceUrl?: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: { '@id': `${appUrl()}/#website` },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      contentUrl: `${url}/image`,
      width: 1200,
      height: 630,
      encodingFormat: 'image/webp'
    },
    mainEntity: {
      '@type': 'CreativeWork',
      '@id': `${url}#conversation`,
      name: title,
      description,
      genre: 'AI conversation',
      isBasedOn: sourceUrl
    }
  }
}

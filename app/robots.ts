import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Public production pages can be indexed. Other environments and unavailable
  // pages remain crawlable so search engines can read their noindex directives.
  return { rules: { userAgent: '*', allow: '/' } }
}

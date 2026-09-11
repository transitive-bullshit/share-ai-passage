import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  // Allow social crawlers to fetch metadata/images. Per-response noindex
  // directives prevent indexing; disallowing all would hide those directives.
  return { rules: { userAgent: '*', allow: '/' } }
}

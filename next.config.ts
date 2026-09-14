import type { NextConfig } from 'next'

import { appUrl, indexingEnabled } from './lib/config'

const config: NextConfig = {
  allowedDevOrigins:
    process.env.NODE_ENV === 'development' && process.env.PORTLESS_URL?.trim()
      ? [new URL(appUrl()).hostname]
      : undefined,
  // Explicit local production runs keep their build separate from development.
  distDir:
    process.env.PASSAGE_PRODUCTION_LOCAL === '1' ? '.next-prod' : '.next',
  // Externalize the entry point too so pnpm's transitive native loader is traced.
  serverExternalPackages: ['takumi-js', '@takumi-rs/core'],
  // The renderer reads catalog-selected files at runtime. Keep them in
  // production Node.js route bundles, including Vercel functions.
  outputFileTracingIncludes: {
    '/*': ['./assets/fonts/**/*', './public/social-templates/*/background.jpg']
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'passage.cultural-alignment.com',
        port: '',
        pathname: '/**',
        search: ''
      }
    ]
  },
  // Resolve metadata before the initial HTML for every crawler and browser.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          ...(indexingEnabled()
            ? []
            : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }]),
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }
        ]
      }
    ]
  }
}

export default config

import type { NextConfig } from 'next'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'

const fromSatori = createRequire(
  createRequire(import.meta.url).resolve('satori')
)
const shapingWasm = relative(
  process.cwd(),
  join(dirname(fromSatori.resolve('harfbuzzjs')), 'hb.wasm')
)

const config: NextConfig = {
  // Explicit local production runs keep their build separate from development.
  distDir:
    process.env.PASSAGE_PRODUCTION_LOCAL === '1' ? '.next-prod' : '.next',
  serverExternalPackages: ['@resvg/resvg-js', 'satori'],
  // The renderer reads catalog-selected files at runtime. Keep them in
  // production Node.js route bundles, including Vercel functions.
  outputFileTracingIncludes: {
    '/*': [
      './assets/fonts/**/*',
      './public/social-templates/*/background.jpg',
      shapingWasm
    ]
  },
  poweredByHeader: false,
  // Resolve metadata before the initial HTML for every crawler and browser.
  htmlLimitedBots: /.*/,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      }
    ]
  }
}

export default config

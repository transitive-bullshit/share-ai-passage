import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/next'

import { BrandMark } from '@/components/brand-mark'
import { Separator } from '@/components/ui/separator'
import { brand } from '@/lib/brand'
import { appUrl } from '@/lib/config'
import { noindex } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`
  },
  robots: noindex,
  applicationName: brand.name
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' data-scroll-behavior='smooth'>
      <body>
        <a className='skip-link' href='#main'>
          Skip to content
        </a>
        <div className='site-shell'>
          <header className='site-header'>
            <a href='/' className='wordmark' aria-label={`${brand.name} home`}>
              <BrandMark />
              {brand.name}
            </a>
            <nav className='header-nav' aria-label='Main navigation'>
              <a href='/#how-it-works'>How it works</a>
              <a href='/#for-agents'>For agents</a>
              <a className='header-cta' href='/'>
                {brand.cta} <span aria-hidden='true'>↗</span>
              </a>
            </nav>
          </header>
          {children}
          <footer className='site-footer'>
            <Separator />
            <div className='footer-row'>
              <a href='/' className='footer-brand'>
                <BrandMark /> {brand.name}
              </a>
              <span>{brand.mantra}</span>
              <a href='/'>
                {brand.cta} <span aria-hidden='true'>↗</span>
              </a>
            </div>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  )
}

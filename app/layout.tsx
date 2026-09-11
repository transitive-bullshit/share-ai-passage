import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { Separator } from '@/components/ui/separator'
import { appUrl } from '@/lib/config'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: 'Passage — Conversations worth sharing',
    template: '%s · Passage'
  },
  description:
    'Share a public ChatGPT, Codex, or Claude conversation with an automatically generated title, concise highlights, and a beautiful preview.',
  robots: { index: false, follow: false },
  applicationName: 'Passage'
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
            <a href='/' className='wordmark' aria-label='Passage home'>
              <BrandMark />
              Passage
            </a>
            <nav className='header-nav' aria-label='Main navigation'>
              <a href='/#how-it-works'>How it works</a>
              <a href='/#for-agents'>For agents</a>
              <a className='header-cta' href='/'>
                Create a passage <span aria-hidden='true'>↗</span>
              </a>
            </nav>
          </header>
          {children}
          <footer className='site-footer'>
            <Separator />
            <div className='footer-row'>
              <a href='/' className='footer-brand'>
                <BrandMark /> Passage
              </a>
              <span>Good conversations deserve to travel.</span>
              <a href='/'>
                Create a passage <span aria-hidden='true'>↗</span>
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}

import { ExternalLink } from 'lucide-react'

import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { brand } from '@/lib/brand'

const navigation = [
  {
    id: 'product',
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Help and FAQs', href: '/#help-heading' }
    ]
  },
  {
    id: 'account',
    title: 'Your account',
    links: [
      { label: 'My passages', href: '/passages' },
      { label: 'Templates', href: '/account/templates' },
      { label: 'Plans and billing', href: '/account/billing' },
      { label: 'Account settings', href: '/account' }
    ]
  },
  {
    id: 'developers',
    title: 'Developers',
    links: [
      { label: 'For agents', href: '/#for-agents' },
      { label: 'API keys', href: '/account/keys' },
      { label: 'Source code', href: brand.repositoryUrl }
    ]
  }
] as const

export function SiteFooter() {
  return (
    <footer className='site-footer'>
      <Separator />
      <div className='footer-main'>
        <div className='footer-intro'>
          <a
            href='/'
            className='footer-brand'
            aria-label={`${brand.name} home`}
          >
            <BrandMark /> {brand.name}
          </a>
          <p>{brand.description}</p>
          <Button asChild variant='outline' size='sm' className='rounded-full'>
            <a href='/create'>
              {brand.cta}
              <ExternalLink data-icon='inline-end' aria-hidden='true' />
            </a>
          </Button>
        </div>
        <nav className='footer-navigation' aria-label='Footer navigation'>
          {navigation.map((group) => (
            <section key={group.id} aria-labelledby={`footer-${group.id}`}>
              <h2 id={`footer-${group.id}`}>{group.title}</h2>
              <ul>
                {group.links.map(({ label, href }) => {
                  const external = href.startsWith('https://')
                  return (
                    <li key={href}>
                      <a
                        href={href}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noopener noreferrer' : undefined}
                        aria-label={
                          external ? `${label} (opens in a new tab)` : undefined
                        }
                      >
                        {label}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>
      </div>
      <div className='footer-bottom'>
        <p>{brand.mantra}</p>
        <nav className='flex items-center gap-1' aria-label='Social links'>
          <Button asChild variant='ghost' size='icon'>
            <a
              href='https://x.com/transitive_bs'
              target='_blank'
              rel='noopener noreferrer'
              aria-label='Travis Fischer on X (opens in a new tab)'
              title='X'
            >
              <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                <path d='M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933ZM17.61 20.644h2.039L6.486 3.24H4.298L17.61 20.644Z' />
              </svg>
            </a>
          </Button>
          <Button asChild variant='ghost' size='icon'>
            <a
              href={brand.repositoryUrl}
              target='_blank'
              rel='noopener noreferrer'
              aria-label='Passage on GitHub (opens in a new tab)'
              title='GitHub'
            >
              <svg viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
                <path d='M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z' />
              </svg>
            </a>
          </Button>
        </nav>
      </div>
    </footer>
  )
}

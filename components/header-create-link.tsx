'use client'

import { ExternalLink } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { brand } from '@/lib/brand'

export function HeaderCreateLink() {
  const pathname = usePathname()
  if (pathname === '/') return null

  return (
    <Button asChild variant='outline' className='header-cta rounded-full'>
      <a href='/'>
        {brand.cta}
        <ExternalLink data-icon='inline-end' aria-hidden='true' />
      </a>
    </Button>
  )
}

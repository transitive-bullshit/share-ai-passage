'use client'

import { usePathname } from 'next/navigation'

import { brand } from '@/lib/brand'

export function HeaderCreateLink() {
  const pathname = usePathname()
  if (pathname === '/') return null

  return (
    <a className='header-cta' href='/'>
      {brand.cta} <span aria-hidden='true'>↗</span>
    </a>
  )
}

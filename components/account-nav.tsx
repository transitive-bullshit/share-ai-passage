'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { Button } from '@/components/ui/button'
import { useAccountSession } from '@/components/account-session'
import { authHref } from '@/lib/auth-navigation'

function AccountNavContent() {
  const { data: session, isPending } = useAccountSession()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const returnTo = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`
  if (isPending)
    return <span className='account-nav-loading' aria-label='Loading account' />
  if (session?.user.emailVerified && !session.user.isAnonymous) {
    return (
      <span className='account-nav'>
        <a
          href='/passages'
          aria-current={pathname === '/passages' ? 'page' : undefined}
        >
          My passages
        </a>
        <Button asChild variant='outline' className='header-cta rounded-full'>
          <a
            href='/account'
            aria-current={pathname === '/account' ? 'page' : undefined}
          >
            Account
          </a>
        </Button>
      </span>
    )
  }
  return (
    <Button asChild variant='outline' className='header-cta rounded-full'>
      <a href={authHref('/sign-in', returnTo)}>Sign in</a>
    </Button>
  )
}

export function AccountNav() {
  return (
    <Suspense fallback={<span className='account-nav-loading' />}>
      <AccountNavContent />
    </Suspense>
  )
}

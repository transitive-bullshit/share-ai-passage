import type { Metadata } from 'next'

import { AuthForm } from '@/components/auth-form'
import { firstQueryValue, safeReturnTo } from '@/lib/auth-navigation'

export const metadata: Metadata = {
  title: 'Reset your password',
  referrer: 'no-referrer'
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: Props) {
  const query = await searchParams
  return (
    <AuthForm
      mode='forgot-password'
      returnTo={safeReturnTo(query.returnTo)}
      initialEmail={firstQueryValue(query.email)}
      token={firstQueryValue(query.token)}
      callbackError={firstQueryValue(query.error)}
      verified={query.verified === '1'}
      passwordReset={query.passwordReset === '1'}
    />
  )
}

import type { Metadata } from 'next'

import { AccountSettings } from '@/components/account-settings'
import { firstQueryValue } from '@/lib/auth-navigation'

export const metadata: Metadata = { title: 'Your account' }

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  return <AccountSettings callbackError={firstQueryValue(query.error)} />
}

import type { Metadata } from 'next'

import { BillingSettings } from '@/components/billing-settings'

export const metadata: Metadata = { title: 'Plans and billing' }

export default async function BillingPage({
  searchParams
}: {
  searchParams: Promise<{ interval?: string | string[] }>
}) {
  const { interval } = await searchParams
  return (
    <BillingSettings initialInterval={interval === 'year' ? 'year' : 'month'} />
  )
}

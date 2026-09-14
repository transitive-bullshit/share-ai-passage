import type { Metadata } from 'next'

import { BillingSettings } from '@/components/billing-settings'

export const metadata: Metadata = { title: 'Plans and billing' }

export default function BillingPage() {
  return <BillingSettings />
}

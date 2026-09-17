import type { Metadata } from 'next'

import { PricingPlans } from '@/components/pricing-plans'
import { billingConfiguration } from '@/lib/billing-config'
import { appUrl } from '@/lib/config'
import { publicPageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  const origin = appUrl()
  return publicPageMetadata({
    title: 'Pricing',
    description:
      'Start sharing for free. Compare Passage Free, Plus, and Pro for custom share cards, saved templates, and your own artwork. Save 20% with annual billing.',
    url: `${origin}/pricing`,
    image: { url: `${origin}/brand/social-preview.jpg`, type: 'image/jpeg' },
    type: 'website'
  })
}

export default function PricingPage() {
  return (
    <main id='main' className='flex flex-col gap-10 py-12 sm:gap-14 sm:py-20'>
      <div className='mx-auto flex max-w-2xl flex-col gap-5 text-center'>
        <h1 className='text-4xl leading-tight font-medium tracking-tight text-balance sm:text-5xl'>
          A little more room
          <br />
          <span className='text-muted-foreground'>for your best ideas.</span>
        </h1>
        <p className='text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg'>
          Start sharing for free. Make every passage feel like yours with custom
          share cards, saved templates, and your own artwork.
        </p>
      </div>
      <PricingPlans
        paidPlansAvailable={billingConfiguration().checkoutEnabled}
      />
    </main>
  )
}

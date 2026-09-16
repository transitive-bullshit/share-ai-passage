'use client'

import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAccountSession } from '@/components/account-session'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { authHref } from '@/lib/auth-navigation'
import type { BillingInterval } from '@/lib/billing-config'
import { imagePack, planCatalog, type PlanId } from '@/lib/plans'

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100)
}

const descriptions = {
  free: 'Keep the conversations worth sharing.',
  plus: 'Give your passages a style of their own.',
  pro: 'More room for a regular sharing habit.'
}

export function PricingPlans({
  paidPlansAvailable
}: {
  paidPlansAvailable: boolean
}) {
  const [interval, setInterval] = useState<BillingInterval>('month')
  const { data: session, isPending } = useAccountSession()
  const userId = session && !session.user.isAnonymous ? session.user.id : null
  const verifiedUserId = session?.user.emailVerified ? userId : null
  const [membership, setMembership] = useState<{
    userId: string
    plan: PlanId | null
  } | null>(null)
  const planPending =
    isPending ||
    Boolean(verifiedUserId && membership?.userId !== verifiedUserId)
  const currentPlan = userId
    ? verifiedUserId
      ? membership?.userId === userId
        ? membership.plan
        : null
      : 'free'
    : null
  const billingHref = `/account/billing?interval=${interval}`

  useEffect(() => {
    if (!verifiedUserId) return
    let active = true
    void fetch('/api/billing', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as {
          entitlements?: { plan?: PlanId }
        }
        const plan = data.entitlements?.plan
        if (!response.ok || !plan || !Object.hasOwn(planCatalog, plan))
          throw new Error('Your plan could not load.')
        if (active) setMembership({ userId: verifiedUserId, plan })
      })
      .catch(() => {
        if (active) setMembership({ userId: verifiedUserId, plan: null })
      })
    return () => {
      active = false
    }
  }, [verifiedUserId])

  return (
    <>
      <div className='flex flex-col items-center gap-4'>
        <ToggleGroup
          type='single'
          variant='outline'
          size='lg'
          value={interval}
          onValueChange={(value) => {
            if (value === 'month' || value === 'year') setInterval(value)
          }}
          aria-label='Billing interval'
        >
          <ToggleGroupItem value='month'>Monthly</ToggleGroupItem>
          <ToggleGroupItem value='year'>Annual · Save 20%</ToggleGroupItem>
        </ToggleGroup>
        <p className='text-center text-sm text-muted-foreground'>
          All prices in USD. Annual plans are billed upfront.
        </p>
        {!paidPlansAvailable ? (
          <p className='text-center text-sm text-muted-foreground'>
            Paid plans are coming soon. You can create a passage for free today.
          </p>
        ) : null}
      </div>
      <div className='grid gap-4 lg:grid-cols-3 lg:gap-y-0'>
        {(['free', 'plus', 'pro'] as const).map((id) => {
          const plan = planCatalog[id]
          const paid = id !== 'free'
          const current = currentPlan === id
          const monthlyCents =
            interval === 'year'
              ? plan.annualPriceCents / 12
              : plan.monthlyPriceCents
          const features = [
            `${plan.summaryGenerations} summary generations / month`,
            paid
              ? `${plan.imageGenerations} AI background generations / month`
              : 'Five curated share card styles',
            'Saved drafts and synced preferences',
            ...(paid
              ? [
                  'Remove or replace the share card watermark',
                  'Upload your own backgrounds and artwork',
                  'Save templates to guide future AI backgrounds',
                  'Use your default template from the CLI or an agent'
                ]
              : ['Passage branding on your share cards'])
          ]
          return (
            <section
              key={id}
              aria-labelledby={`pricing-${id}`}
              className='flex min-w-0 flex-col rounded-2xl border border-border p-6 lg:row-span-4 lg:grid lg:grid-rows-subgrid'
            >
              <div className='flex flex-col gap-2'>
                <h2 id={`pricing-${id}`} className='text-xl font-medium'>
                  {plan.name}
                </h2>
                <p className='text-sm leading-relaxed text-muted-foreground'>
                  {descriptions[id]}
                </p>
              </div>
              <div
                className='flex flex-col gap-2 py-6'
                aria-live='polite'
                aria-atomic='true'
              >
                <p className='text-4xl font-medium tracking-tight tabular-nums'>
                  {money(monthlyCents)}
                  <span className='text-sm font-normal tracking-normal text-muted-foreground'>
                    {' '}
                    / month
                  </span>
                </p>
                <p className='text-sm text-muted-foreground'>
                  {paid
                    ? interval === 'year'
                      ? `${money(plan.annualPriceCents)} billed annually`
                      : 'Billed monthly'
                    : 'Free with an account'}
                </p>
              </div>
              <ul className='mb-7 flex flex-col gap-3 text-sm leading-relaxed'>
                {features.map((feature) => (
                  <li key={feature} className='flex items-start gap-2'>
                    <Check
                      aria-hidden='true'
                      className='mt-1 size-4 shrink-0 text-muted-foreground'
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild={!planPending && !current}
                disabled={planPending || current}
                variant={current || !paid ? 'outline' : 'default'}
                size='lg'
                className='mt-auto w-full rounded-full lg:mt-0'
              >
                {planPending ? (
                  'Loading plan'
                ) : current ? (
                  <>
                    <Check data-icon='inline-start' />
                    Current plan
                  </>
                ) : (
                  <a
                    href={
                      paid || userId
                        ? billingHref
                        : authHref('/sign-up', '/passages')
                    }
                  >
                    {paid
                      ? paidPlansAvailable
                        ? `Choose ${plan.name}`
                        : `View ${plan.name} plan`
                      : userId
                        ? currentPlan
                          ? 'Switch to Free'
                          : 'Manage your plan'
                        : 'Create a free account'}
                  </a>
                )}
              </Button>
            </section>
          )
        })}
      </div>
      <div className='mx-auto flex max-w-2xl flex-col gap-3 text-center text-sm leading-relaxed text-muted-foreground'>
        <p>
          Plus and Pro include the same customization features. Choose the
          allowance that fits your sharing.
        </p>
        <p>
          Just trying it out?{' '}
          <a href='/' className='auth-text-link'>
            Create a passage
          </a>{' '}
          without an account, with up to 5 summary generations per browser each
          month.
        </p>
      </div>
      <section
        aria-labelledby='pricing-details'
        className='grid gap-8 py-4 lg:grid-cols-[1fr_2fr] lg:gap-16'
      >
        <div className='flex flex-col gap-3'>
          <h2
            id='pricing-details'
            className='text-2xl font-medium tracking-tight'
          >
            A few useful details.
          </h2>
          <p className='text-sm leading-relaxed text-muted-foreground'>
            Know what counts, what carries over, and how to make a little more
            room.
          </p>
          <a href='/account/billing' className='auth-text-link w-fit text-sm'>
            Manage your plan
          </a>
        </div>
        <dl className='grid gap-7 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>What counts as a generation?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              Each new AI summary or background counts, including regenerations
              and unpublished work. Reusing a saved result, editing, uploading,
              and publishing don’t. Technical failures without a usable result
              restore your allowance.
            </dd>
          </div>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>When do allowances renew?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              Every month, including on annual plans. Included generations don’t
              roll over. When you reach a limit, you can still edit and publish
              saved work. There are no automatic overage charges.
            </dd>
          </div>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>Need more AI backgrounds?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              Add {imagePack.generations} image generations for{' '}
              {money(imagePack.priceCents)} with a one-time pack on Plus or Pro.
              Included generations are used first. Purchased generations never
              expire; you need an active paid plan to use them.
            </dd>
          </div>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>What can I customize?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              Your share card’s branding, backgrounds, and reusable templates.
              Guide AI artwork with your own style. The reader keeps Passage’s
              interface and the original source attribution. Your upload library
              holds up to 1 GB, with a 10 MB limit per file.
            </dd>
          </div>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>Can I cancel or change plans?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              Yes. Cancellations and downgrades take effect at the end of your
              billing period. Review any prorated upgrade charge before
              confirming. Your published passages keep their original
              appearance.
            </dd>
          </div>
          <div className='flex flex-col gap-2'>
            <dt className='font-medium'>Do I need an account?</dt>
            <dd className='text-sm leading-relaxed text-muted-foreground'>
              You can create and read passages without one. A verified Free
              account gives you {planCatalog.free.summaryGenerations} summary
              generations a month, saved drafts, and preferences that follow you
              across devices.
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}

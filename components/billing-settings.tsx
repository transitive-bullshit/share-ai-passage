'use client'

import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAccountSession } from '@/components/account-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'
import type { BillingInterval } from '@/lib/billing-config'
import { planCatalog, type PlanId, type PaidPlanId } from '@/lib/plans'

type BillingView = {
  configuration: {
    configured: boolean
    mode: 'test' | 'live' | null
    checkoutEnabled: boolean
    packsEnabled: boolean
  }
  plans: typeof planCatalog
  imagePack: { priceCents: number; generations: number }
  entitlements: {
    plan: PlanId
    paidActions: boolean
    paidThrough: string | null
    allowanceWindow: { startsAt: string; endsAt: string }
    summaryLimit: number
    imageLimit: number
  }
  subscription: {
    status: string
    billingInterval: string | null
    periodEnd: string | null
    cancelAtPeriodEnd: boolean
    cancelAt: string | null
    pendingPlan: PlanId | null
    pendingBillingInterval: string | null
    pendingEffectiveAt: string | null
    hasCustomer: boolean
  } | null
  imageBalance: { included: number; purchased: number }
}

type Action =
  | { action: 'change'; plan: PaidPlanId; interval: BillingInterval }
  | { action: 'cancel' | 'restore' | 'portal' }
  | { action: 'pack'; requestKey: string }

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100)
}

function localDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : ''
}

export function BillingSettings() {
  const { data: session, isPending } = useAccountSession()
  const userId =
    session?.user.emailVerified && !session.user.isAnonymous
      ? session.user.id
      : null
  return (
    <BillingDetails
      key={userId || 'guest'}
      userId={userId}
      isPending={isPending}
    />
  )
}

function BillingDetails({
  userId,
  isPending
}: {
  userId: string | null
  isPending: boolean
}) {
  const [billing, setBilling] = useState<BillingView | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [interval, setInterval] = useState<BillingInterval>('month')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const pendingCancellation = Boolean(
    billing?.subscription?.cancelAtPeriodEnd || billing?.subscription?.cancelAt
  )

  useEffect(() => {
    if (!userId) return
    // Returning from Checkout ends this purchase attempt; only the webhook grants credits.
    if (new URL(window.location.href).searchParams.get('pack') === 'complete') {
      localStorage.removeItem(`passage:pack:${userId}`)
      window.history.replaceState(null, '', '/account/billing')
    }
    let active = true
    void fetch('/api/billing', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as BillingView & { error?: string }
        if (!active) return
        if (!response.ok)
          throw new Error(data.error || 'Billing couldn’t load.')
        setBilling(data)
        setError('')
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error ? err.message : 'Billing couldn’t load.'
          )
      })
    return () => {
      active = false
    }
  }, [userId, attempt])

  async function perform(action: Action) {
    if (pending) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/billing/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action)
      })
      const result = (await response.json()) as {
        url?: string
        error?: string
        message?: string
        alreadyPurchased?: boolean
        expired?: boolean
      }
      if (!response.ok)
        throw new Error(
          result.error ||
            result.message ||
            'Billing couldn’t complete that request.'
        )
      if (result.url) {
        window.location.assign(result.url)
        return
      }
      if (action.action === 'pack' && userId)
        localStorage.removeItem(`passage:pack:${userId}`)
      setNotice(
        result.expired
          ? 'That checkout expired. Choose Buy generations again to start a new purchase.'
          : result.alreadyPurchased
            ? 'This image pack has already been purchased. Its payment is being confirmed.'
            : 'Your request is saved. Billing will update after confirmation.'
      )
      setAttempt((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Billing couldn’t complete that request.'
      )
    } finally {
      setPending(false)
    }
  }

  function buyPack() {
    if (!userId) return
    const key = `passage:pack:${userId}`
    const requestKey = localStorage.getItem(key) || crypto.randomUUID()
    localStorage.setItem(key, requestKey)
    void perform({ action: 'pack', requestKey })
  }

  if (isPending)
    return (
      <main id='main' className='account-page'>
        <p className='auth-loading'>
          <Spinner />
          Loading billing…
        </p>
      </main>
    )
  if (!userId)
    return (
      <main id='main' className='account-page'>
        <div className='account-heading'>
          <h1>Plans and billing</h1>
          <p>Sign in to manage your plan and image generations.</p>
        </div>
        <Button asChild>
          <a href={authHref('/sign-in', '/account/billing')}>Sign in</a>
        </Button>
      </main>
    )

  return (
    <main id='main' className='account-page'>
      <a
        className='auth-text-link inline-flex items-center gap-2'
        href='/account'
      >
        <ArrowLeft size={16} />
        Your account
      </a>
      <div className='account-heading'>
        <h1>Plans and billing</h1>
        <p>Choose the room you need for your passages.</p>
      </div>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            {error}{' '}
            <button
              className='auth-text-link'
              onClick={() => setAttempt((value) => value + 1)}
            >
              Refresh billing
            </button>
          </AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {!billing ? (
        !error ? (
          <p className='auth-loading'>
            <Spinner />
            Loading your plan…
          </p>
        ) : null
      ) : (
        <>
          {!billing.configuration.checkoutEnabled ? (
            <Alert>
              <AlertDescription>
                Paid plans are not available yet. You can keep creating with
                Free.
              </AlertDescription>
            </Alert>
          ) : null}
          {billing.configuration.mode === 'test' ? (
            <p className='text-sm text-muted-foreground'>
              Test billing. No real payment is collected.
            </p>
          ) : null}
          <section className='account-section'>
            <div className='account-section-heading'>
              <h2>Your plan</h2>
              <p>{billing.plans[billing.entitlements.plan].name}</p>
            </div>
            <div className='account-section-content space-y-3'>
              <p>
                {billing.entitlements.summaryLimit} summary generations and{' '}
                {billing.entitlements.imageLimit} image generations per month.
              </p>
              <p className='text-sm text-muted-foreground'>
                Your next allowance starts{' '}
                {localDate(billing.entitlements.allowanceWindow.endsAt)}.
              </p>
              {pendingCancellation ? (
                <p>
                  Your plan ends{' '}
                  {localDate(
                    billing.subscription?.cancelAt ||
                      billing.subscription?.periodEnd
                  )}
                  . Your published passages and saved work remain.
                </p>
              ) : null}
              {billing.subscription?.pendingPlan ? (
                <p>
                  Your plan changes to{' '}
                  {billing.plans[billing.subscription.pendingPlan].name} on{' '}
                  {localDate(billing.subscription.pendingEffectiveAt)}.
                </p>
              ) : null}
              <div className='flex flex-wrap gap-2'>
                {billing.subscription?.hasCustomer ? (
                  <Button
                    variant='outline'
                    disabled={pending}
                    onClick={() => void perform({ action: 'portal' })}
                  >
                    Manage billing
                    <ArrowUpRight data-icon='inline-end' />
                  </Button>
                ) : null}
                {pendingCancellation || billing.subscription?.pendingPlan ? (
                  <Button
                    variant='outline'
                    disabled={pending}
                    onClick={() => void perform({ action: 'restore' })}
                  >
                    Keep current plan
                  </Button>
                ) : null}
                <Button
                  variant='ghost'
                  disabled={pending}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Refresh billing
                </Button>
              </div>
            </div>
          </section>
          <div
            className='flex items-center gap-2'
            role='group'
            aria-label='Billing interval'
          >
            <Button
              variant={interval === 'month' ? 'default' : 'outline'}
              aria-pressed={interval === 'month'}
              onClick={() => setInterval('month')}
            >
              Monthly
            </Button>
            <Button
              variant={interval === 'year' ? 'default' : 'outline'}
              aria-pressed={interval === 'year'}
              onClick={() => setInterval('year')}
            >
              Annual · Save 20%
            </Button>
          </div>
          <div className='grid gap-4 md:grid-cols-3'>
            {(['free', 'plus', 'pro'] as const).map((id) => {
              const plan = billing.plans[id]
              const current =
                billing.entitlements.plan === id &&
                (id === 'free' ||
                  billing.subscription?.billingInterval === interval)
              const downgrade =
                plan.summaryGenerations < billing.entitlements.summaryLimit
              const deferred =
                downgrade ||
                (billing.entitlements.paidActions &&
                  billing.subscription?.billingInterval !== interval)
              return (
                <section
                  key={id}
                  className='flex flex-col rounded-2xl border border-border p-5'
                >
                  <h2 className='text-lg font-medium'>{plan.name}</h2>
                  <p className='my-3 text-3xl font-medium'>
                    {money(
                      interval === 'year'
                        ? plan.annualPriceCents
                        : plan.monthlyPriceCents
                    )}
                    <span className='text-sm font-normal text-muted-foreground'>
                      /{interval === 'year' ? 'year' : 'month'}
                    </span>
                  </p>
                  <ul className='mb-6 space-y-2 text-sm'>
                    <li>{plan.summaryGenerations} summary generations/month</li>
                    <li>{plan.imageGenerations} image generations/month</li>
                    {id !== 'free' ? (
                      <>
                        <li>Custom branding and templates</li>
                        <li>Uploaded backgrounds and artwork</li>
                      </>
                    ) : (
                      <li>Curated card styles and saved drafts</li>
                    )}
                  </ul>
                  <Button
                    className='mt-auto'
                    variant={current ? 'outline' : 'default'}
                    disabled={
                      pending ||
                      current ||
                      !billing.configuration.checkoutEnabled
                    }
                    onClick={() =>
                      void perform(
                        id === 'free'
                          ? { action: 'cancel' }
                          : { action: 'change', plan: id, interval }
                      )
                    }
                  >
                    {current ? (
                      <>
                        <Check data-icon='inline-start' />
                        Current plan
                      </>
                    ) : id === 'free' ? (
                      'Switch to Free'
                    ) : (
                      `Choose ${plan.name}`
                    )}
                  </Button>
                  {!current && billing.entitlements.paidActions ? (
                    <p className='mt-3 text-xs text-muted-foreground'>
                      {deferred
                        ? `Changes at period end${billing.subscription?.periodEnd ? `, ${localDate(billing.subscription.periodEnd)}` : ''}.`
                        : 'Review the prorated charge before confirming.'}
                    </p>
                  ) : null}
                </section>
              )
            })}
          </div>
          <p className='text-sm text-muted-foreground'>
            Annual plans are paid upfront and refill monthly. Included
            generations do not roll over. Cached reuse, edits, and publishing do
            not use generations.
          </p>
          <section className='account-section'>
            <div className='account-section-heading'>
              <h2>Image generations</h2>
              <p>Extra room when you need it.</p>
            </div>
            <div className='account-section-content space-y-3'>
              <p>
                {billing.imageBalance.included} included and{' '}
                {billing.imageBalance.purchased} purchased generations
                available.
              </p>
              <p className='text-sm text-muted-foreground'>
                Included generations are used first. Purchased generations never
                expire and require an active paid plan to use.
              </p>
              <Button
                variant='outline'
                disabled={
                  pending ||
                  !billing.entitlements.paidActions ||
                  !billing.configuration.packsEnabled
                }
                onClick={buyPack}
              >
                Buy {billing.imagePack.generations} generations ·{' '}
                {money(billing.imagePack.priceCents)}
              </Button>
              <p className='text-sm text-muted-foreground'>
                One purchase. No automatic top-ups.
              </p>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

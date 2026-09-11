'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function ErrorPage({
  retry
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <main id='main' className='quiet-state'>
      <p className='eyebrow'>Something went wrong</p>
      <h1>We couldn’t load this page.</h1>
      <p>Something went wrong while loading. Please try again in a moment.</p>
      <div className='reader-actions'>
        <Button onClick={retry}>Try again</Button>
        <Button variant='outline' asChild>
          <Link href='/'>Back to Passage</Link>
        </Button>
      </div>
    </main>
  )
}

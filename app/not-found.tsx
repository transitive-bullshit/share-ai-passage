import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main id='main' className='quiet-state'>
      <p className='eyebrow'>404 / Page not found</p>
      <h1>This passage isn’t here.</h1>
      <p>The link may be incomplete, or this publication does not exist.</p>
      <Button asChild>
        <Link href='/'>Back to Passage</Link>
      </Button>
    </main>
  )
}

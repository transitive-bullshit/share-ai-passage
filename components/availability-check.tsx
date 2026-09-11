'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export function AvailabilityCheck({
  provider,
  publicationId
}: {
  provider: string
  publicationId: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function check() {
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, publicationId })
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result.error ||
            'The original could not be checked. Please try again later.'
        )
      setMessage(result.message)
      if (result.status === 'unavailable') router.refresh()
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'The original could not be checked. Please try again later.'
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className='availability-control'>
      <Button variant='outline' size='sm' onClick={check} disabled={pending}>
        {pending ? (
          <Spinner data-icon='inline-start' />
        ) : (
          <RefreshCw data-icon='inline-start' />
        )}
        {pending ? 'Checking the original…' : 'Check original availability'}
      </Button>
      <p role='status'>{message}</p>
    </div>
  )
}

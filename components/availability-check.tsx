'use client'

import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { clientErrorMessage, postJson } from '@/lib/client-request'

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
      const result = await postJson<{ message: string; status: string }>(
        '/api/check',
        { provider, publicationId }
      )
      setMessage(result.message)
      if (result.status === 'unavailable') router.refresh()
    } catch (err) {
      setMessage(clientErrorMessage(err))
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

'use client'

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'
import {
  ClientRequestError,
  clientErrorMessage,
  generationResetAt
} from '@/lib/client-request'
import {
  draftRequest,
  DraftRequestError,
  type DraftOperation,
  type SavedDraft
} from '@/lib/draft-client'
import type { GeneratedPreview } from '@/lib/domain'

type Result = {
  operationId: string
  status: DraftOperation['status']
  preview?: GeneratedPreview
  draft?: SavedDraft
  conflict?: boolean
}

export function DraftGenerationControls({
  draftId,
  preview,
  disabled,
  flush,
  onAccept,
  onBusy,
  registered
}: {
  draftId: string
  preview: GeneratedPreview
  disabled: boolean
  flush: () => Promise<number>
  onAccept: (draft: SavedDraft) => void
  onBusy: (busy: boolean) => void
  registered: boolean
}) {
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(0)
  const [quotaLimited, setQuotaLimited] = useState(false)
  const [operations, setOperations] = useState<DraftOperation[]>([])
  const [checking, setChecking] = useState(true)
  const [checkError, setCheckError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [checkAttempt, setCheckAttempt] = useState(0)
  const unfinished = operations.find((operation) =>
    ['reserved', 'running', 'uncertain'].includes(operation.status)
  )
  const available = operations.find(
    (operation) =>
      operation.status === 'succeeded' &&
      operation.result &&
      JSON.stringify(operation.result) !== JSON.stringify(preview)
  )

  useEffect(() => {
    if (!retryAt || now >= retryAt) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(retryAt - now, 60000)
    )
    return () => clearTimeout(timer)
  }, [retryAt, now])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const result = await draftRequest<{ operations: DraftOperation[] }>(
          `/api/drafts/${draftId}/operations`,
          'GET',
          undefined
        )
        if (!active) return
        setOperations(result.operations)
        setCheckError('')
        setChecking(false)
        if (
          result.operations.some((operation) =>
            ['reserved', 'running', 'uncertain'].includes(operation.status)
          )
        )
          timer = setTimeout(() => void load(), 5000)
      } catch {
        if (!active) return
        setCheckError(
          'Generation status couldn’t load. Check again before requesting new wording.'
        )
        setChecking(false)
      }
    }
    void load()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draftId, checkAttempt])

  function check() {
    setChecking(true)
    setCheckAttempt((value) => value + 1)
  }

  async function regenerate() {
    if (
      busy ||
      disabled ||
      unfinished ||
      checkError ||
      checking ||
      retryAt > now
    )
      return
    const key = requestKey ?? crypto.randomUUID()
    setRequestKey(key)
    setBusy(true)
    onBusy(true)
    setError('')
    let submitted = false
    try {
      const revision = await flush()
      submitted = true
      const result = await draftRequest<Result>(
        `/api/drafts/${draftId}/regenerate`,
        'POST',
        { revision, requestKey: key }
      )
      setUnknown(false)
      setRequestKey(null)
      if (result.status === 'succeeded' && result.draft && !result.conflict)
        onAccept(result.draft)
      if (result.conflict)
        setError(
          'This draft changed while new wording was being prepared. Your generated result is saved below; reload the draft before applying it.'
        )
      check()
    } catch (err) {
      if (!submitted) {
        setError(clientErrorMessage(err))
        return
      }
      if (err instanceof ClientRequestError && err.status === 429) {
        setNow(Date.now())
        setRetryAt(generationResetAt(err) ?? err.retryAt ?? Date.now() + 60000)
        setQuotaLimited(Boolean(generationResetAt(err)))
      }
      if (err instanceof DraftRequestError && err.status && err.status < 500) {
        setError(clientErrorMessage(err))
        if (err.status !== 409) setRequestKey(null)
      } else {
        setUnknown(true)
        setError(
          'We couldn’t confirm the result. Check its saved status, or retry this same request. Your allowance remains reserved while an uncertain result is checked.'
        )
      }
      check()
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  async function apply(operation: DraftOperation) {
    if (busy || disabled) return
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const revision = await flush()
      const result = await draftRequest<SavedDraft>(
        `/api/drafts/${draftId}/apply`,
        'POST',
        { revision, operationId: operation.id }
      )
      onAccept(result)
    } catch (err) {
      setError(clientErrorMessage(err))
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }

  return (
    <div className='draft-generation'>
      <div className='draft-generation-action'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={
            disabled ||
            busy ||
            Boolean(unfinished) ||
            Boolean(checkError) ||
            checking ||
            retryAt > now
          }
          onClick={() => void regenerate()}
        >
          {busy ? (
            <Spinner data-icon='inline-start' />
          ) : (
            <RefreshCw data-icon='inline-start' />
          )}
          {unknown && requestKey
            ? 'Retry the same request'
            : 'Generate new wording'}
        </Button>
        <span>Uses 1 summary generation</span>
      </div>
      {retryAt > now && (
        <p className='draft-status'>
          {quotaLimited
            ? 'Your summary allowance resets'
            : 'Try generating again'}{' '}
          after{' '}
          {new Date(retryAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
          . Your edits and publishing remain available.
          {quotaLimited && !registered && (
            <>
              {' '}
              <a
                className='auth-text-link'
                href={authHref('/sign-up', `/?draft=${draftId}`)}
              >
                Save your work with a free account
              </a>
              .
            </>
          )}
        </p>
      )}
      {unfinished && (
        <p role='status' className='draft-status'>
          {unfinished.status === 'uncertain'
            ? 'This generation’s outcome is still being checked. Its allowance remains reserved.'
            : 'New wording is being prepared. You can keep editing; the result will be saved separately.'}
        </p>
      )}
      {(checkError || unknown) && (
        <p className='draft-status'>
          {checkError}
          <button
            type='button'
            className='auth-text-link'
            disabled={checking}
            onClick={check}
          >
            {checking ? 'Checking…' : 'Check generation status'}
          </button>
        </p>
      )}
      {available?.result && (
        <div className='draft-generated-result'>
          <p className='account-eyebrow'>Saved generated wording</p>
          <strong>{available.result.title}</strong>
          <ul>
            {available.result.highlights.map((highlight, index) => (
              <li key={index}>{highlight}</li>
            ))}
          </ul>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={disabled || busy}
            onClick={() => void apply(available)}
          >
            Use this wording
          </Button>
        </div>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

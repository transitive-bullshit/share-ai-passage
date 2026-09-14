'use client'

import { useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'
import { clientErrorMessage } from '@/lib/client-request'
import {
  draftRequest,
  DraftRequestError,
  type DraftResult,
  type PendingDraft,
  type SavedDraft
} from '@/lib/draft-client'

export function DraftLoader({
  draftId,
  onReady,
  onBack,
  resetAt
}: {
  draftId: string
  onReady: (draft: SavedDraft) => void
  onBack: () => void
  resetAt?: number
}) {
  const [status, setStatus] = useState<
    'loading' | 'preparing' | 'blocked' | 'failed' | 'unauthorized' | 'error'
  >('loading')
  const [error, setError] = useState('')
  const resumeError = useRef('')
  const [generationBlock, setGenerationBlock] =
    useState<PendingDraft['generationBlock']>()
  const [attempt, setAttempt] = useState(0)
  const generationReset =
    generationBlock?.resetAt ?? (status === 'loading' ? resetAt : undefined)
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        const result = await draftRequest<DraftResult>(
          `/api/drafts/${encodeURIComponent(draftId)}`,
          'GET',
          undefined
        )
        if (!active) return
        if (result.status === 'ready') onReady(result)
        else {
          setStatus(result.generationBlock ? 'blocked' : result.status)
          setGenerationBlock(result.generationBlock)
          setError(result.errorMessage ?? resumeError.current)
          if (result.status === 'preparing' && !result.generationBlock)
            timer = setTimeout(() => void load(), 4000)
        }
      } catch (err) {
        if (!active) return
        setStatus(
          err instanceof DraftRequestError && err.status === 401
            ? 'unauthorized'
            : 'error'
        )
        setError(clientErrorMessage(err))
      }
    }
    void load()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draftId, attempt, onReady])
  async function resume() {
    resumeError.current = ''
    try {
      const result = await draftRequest<DraftResult>(
        `/api/drafts/${encodeURIComponent(draftId)}/resume`,
        'POST',
        {}
      )
      if (result.status === 'ready') onReady(result)
      else {
        setStatus(result.generationBlock ? 'blocked' : result.status)
        setGenerationBlock(result.generationBlock)
        setError(result.errorMessage ?? '')
        setAttempt((value) => value + 1)
      }
    } catch (err) {
      resumeError.current = clientErrorMessage(err)
      setError(resumeError.current)
      // Reload the owned status, including its current quota/reset information.
      // This also recognizes a response lost after preparation completed.
      setAttempt((value) => value + 1)
    }
  }
  return (
    <section className='draft-loading-page'>
      <h1>
        {status === 'blocked'
          ? 'New summaries are paused.'
          : status === 'preparing'
            ? 'Your passage is being prepared.'
            : status === 'loading'
              ? 'Opening your draft…'
              : status === 'unauthorized'
                ? 'Sign in to open this draft.'
                : 'Your draft needs attention.'}
      </h1>
      {(status === 'loading' || status === 'preparing') && (
        <p className='auth-loading'>
          <Spinner />
          {status === 'preparing'
            ? 'Its progress is saved. Refreshing this page won’t start another generation.'
            : 'Loading your saved text and card style…'}
        </p>
      )}
      {generationReset && (
        <p className='draft-status'>
          New summaries are available after{' '}
          {new Date(generationReset).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}
          . Cached passages and your saved work remain available.
        </p>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className='account-actions'>
        {(status === 'preparing' || status === 'blocked') && (
          <Button type='button' onClick={() => void resume()}>
            Resume preparation
          </Button>
        )}
        {status === 'blocked' && generationBlock?.canSignUp && (
          <Button asChild>
            <a href={authHref('/sign-up', `/?draft=${draftId}`)}>
              Create a free account
            </a>
          </Button>
        )}
        {status === 'unauthorized' ? (
          <Button asChild>
            <a href={authHref('/sign-in', `/?draft=${draftId}`)}>Sign in</a>
          </Button>
        ) : (
          <Button
            type='button'
            variant='outline'
            onClick={() => setAttempt((value) => value + 1)}
          >
            Check saved status
          </Button>
        )}
        <Button type='button' variant='ghost' onClick={onBack}>
          Create another passage
        </Button>
      </div>
    </section>
  )
}

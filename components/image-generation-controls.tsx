'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { ImagePlus, RotateCw } from 'lucide-react'
import {
  draftRequest,
  DraftRequestError,
  type SavedDraft
} from '@/lib/draft-client'
import type { DraftSaveSnapshot } from '@/lib/draft-autosave'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Spinner } from './ui/spinner'

type Job = {
  id: string
  draftId: string
  draftRevision: number
  status:
    | 'reserved'
    | 'dispatching'
    | 'running'
    | 'uncertain'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
  applied: boolean
  canApply: boolean
  error: string | null
  usage: {
    remaining: number
    included: number
    purchased: number
    active: boolean
    resetAt: string
  }
}
type PendingRequest = { requestKey: string; revision: number }
const activeStatuses = ['reserved', 'dispatching', 'running', 'uncertain']

export function ImageGenerationControls({
  draftId,
  initialJobId,
  initialError,
  hasImage,
  disabled,
  canGenerate,
  flush,
  getSave,
  onAccept
}: {
  draftId: string
  initialJobId?: string
  initialError?: string
  hasImage: boolean
  disabled: boolean
  canGenerate: boolean
  flush: () => Promise<number>
  getSave: () => DraftSaveSnapshot
  onAccept: (draft: SavedDraft) => void
}) {
  const [job, setJob] = useState<Job | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(initialError ?? '')
  const [reload, setReload] = useState(0)
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const acknowledged = useRef<string | null>(null)
  const currentJobId = useRef(initialJobId)
  const pendingRequest = useRef<PendingRequest | null>(null)
  const storageKey = `passage:image-request:${draftId}`
  const acceptCompleted = useEffectEvent(async (next: Job) => {
    if (!next.applied || acknowledged.current === next.id) return
    const save = getSave()
    if (save.status !== 'saved' || save.revision !== next.draftRevision) return
    const current = await draftRequest<SavedDraft>(`/api/drafts/${draftId}`)
    // Do not overwrite edits queued while the read was in flight.
    const latest = getSave()
    if (latest.status !== 'saved' || latest.revision !== save.revision) return
    acknowledged.current = next.id
    onAccept(current)
  })
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(
        window.sessionStorage.getItem(storageKey) || 'null'
      )
      if (
        raw &&
        typeof raw === 'object' &&
        'requestKey' in raw &&
        typeof raw.requestKey === 'string' &&
        /^[a-f\d-]{36}$/i.test(raw.requestKey) &&
        'revision' in raw &&
        Number.isInteger(raw.revision) &&
        Number(raw.revision) >= 0
      ) {
        pendingRequest.current = {
          requestKey: raw.requestKey,
          revision: Number(raw.revision)
        }
      }
    } catch {
      /* Database history still recovers accepted requests. */
    }
  }, [storageKey])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    async function load() {
      try {
        let id = currentJobId.current
        if (!id) {
          const history = await draftRequest<{ images: { id: string }[] }>(
            `/api/drafts/${draftId}/operations`
          )
          id = history.images?.[0]?.id
        }
        if (!id) return
        async function poll() {
          const next = await draftRequest<Job>(`/api/image-jobs/${id}`)
          if (!active) return
          setJob(next)
          await acceptCompleted(next)
          if (activeStatuses.includes(next.status))
            timer = setTimeout(
              () => {
                void poll().catch(failed)
              },
              next.status === 'uncertain' ? 15_000 : 2000
            )
        }
        await poll()
      } catch (err) {
        failed(err)
      }
    }
    function failed(err: unknown) {
      if (active)
        setError(
          err instanceof Error
            ? err.message
            : 'The saved image status could not load.'
        )
    }
    void load()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draftId, initialJobId, reload])
  function clearRequest() {
    pendingRequest.current = null
    setHasPendingRequest(false)
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch {
      /* Storage may be blocked. */
    }
  }
  async function generate() {
    setPending(true)
    setError('')
    try {
      const revision = await flush()
      const request = pendingRequest.current ?? {
        revision,
        requestKey: crypto.randomUUID()
      }
      pendingRequest.current = request
      setHasPendingRequest(true)
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(request))
      } catch {
        /* Keep in memory. */
      }
      const next = await draftRequest<Job>(
        `/api/drafts/${draftId}/image`,
        'POST',
        request
      )
      clearRequest()
      currentJobId.current = next.id
      setJob(next)
      setReload((value) => value + 1)
    } catch (err) {
      if (
        err instanceof DraftRequestError &&
        err.status &&
        err.status >= 400 &&
        err.status < 500
      )
        clearRequest()
      setError(
        err instanceof Error
          ? err.message
          : 'The image request could not be confirmed. Check the saved result before starting another.'
      )
    } finally {
      setPending(false)
    }
  }
  async function apply() {
    if (!job) return
    setPending(true)
    setError('')
    try {
      const revision = await flush()
      const result = await draftRequest<{ draft: SavedDraft }>(
        `/api/image-jobs/${job.id}/apply`,
        'POST',
        { revision }
      )
      acknowledged.current = job.id
      onAccept(result.draft)
      setReload((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'The saved image could not be applied.'
      )
    } finally {
      setPending(false)
    }
  }
  const running = Boolean(job && activeStatuses.includes(job.status))
  return (
    <div className='flex flex-col gap-3'>
      {running && (
        <p className='draft-status' role='status'>
          {job?.status === 'uncertain' ? (
            job.error
          ) : (
            <>
              <Spinner /> Creating your background. You can keep editing or
              return later.
            </>
          )}
        </p>
      )}
      {job?.status === 'failed' && (
        <p className='draft-status' role='status'>
          {job.error}
        </p>
      )}
      {job?.usage && (
        <p className='draft-status'>
          {job.usage.remaining} image generations available ·{' '}
          {job.usage.purchased} purchased credits
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={disabled || pending || running || !canGenerate}
          onClick={() => void generate()}
        >
          {pending ? (
            <Spinner data-icon='inline-start' />
          ) : hasImage ? (
            <RotateCw data-icon='inline-start' />
          ) : (
            <ImagePlus data-icon='inline-start' />
          )}
          {hasPendingRequest
            ? 'Check image request'
            : hasImage
              ? 'Regenerate image'
              : 'Generate image'}
        </Button>
        {job?.status === 'succeeded' && job.canApply && !job.applied && (
          <Button
            type='button'
            variant='outline'
            disabled={disabled || pending}
            onClick={() => void apply()}
          >
            Apply saved image
          </Button>
        )}
        <Button asChild variant='ghost' size='sm'>
          <a href='/account/billing'>Image credits</a>
        </Button>
      </div>
      {!canGenerate && (
        <p className='draft-status'>
          An active paid plan is required for new image generations. Your
          completed artwork is saved.
        </p>
      )}
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>
            {error}
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setError('')
                setReload((value) => value + 1)
              }}
            >
              Check saved status
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

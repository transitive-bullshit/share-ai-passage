'use client'

import { ArrowRight } from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'

import { DraftLoader } from '@/components/draft-loader'
import { PreviewReview, type PreparedDraft } from '@/components/preview-review'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'
import { authClient } from '@/lib/auth-client'
import { useAccountSession } from '@/components/account-session'
import type { CardAppearance } from '@/lib/card-appearance'
import {
  draftRequest,
  DraftRequestError,
  type DraftResult,
  type SavedDraft
} from '@/lib/draft-client'
import {
  preparationRecovery,
  parsePreparationRequest,
  type PreparationRequest
} from '@/lib/preparation-recovery'
import { brand } from '@/lib/brand'
import {
  CARD_PREFERENCES_KEY,
  createCardPreferencesStore
} from '@/lib/card-preferences'
import {
  ClientRequestError,
  clientErrorMessage,
  generationResetAt
} from '@/lib/client-request'

const cardPreferences = createCardPreferencesStore(() => window.localStorage)

function subscribeCardPreferences(onChange: () => void) {
  const unsubscribe = cardPreferences.subscribe(onChange)
  function syncPreferences(event: StorageEvent) {
    if (event.key !== CARD_PREFERENCES_KEY && event.key !== null) return
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    cardPreferences.refresh()
  }
  window.addEventListener('storage', syncPreferences)
  cardPreferences.refresh()
  return () => {
    unsubscribe()
    window.removeEventListener('storage', syncPreferences)
  }
}

async function loadAccountDefault(appearance: CardAppearance) {
  const preferences = await draftRequest<{
    appearance: CardAppearance
    saved: boolean
  }>('/api/account/preferences')
  if (preferences.saved) return preferences.appearance
  const initialized = await draftRequest<{
    appearance: CardAppearance
    saved: boolean
  }>('/api/account/preferences', 'PUT', { appearance, initializeOnly: true })
  return initialized.appearance
}

export function ShareFlow({
  children,
  initialDraftId,
  initialTemplateId
}: {
  children?: ReactNode
  initialDraftId?: string
  initialTemplateId?: string
}) {
  const { data: session } = useAccountSession()
  const registeredUserId =
    session?.user.emailVerified && !session.user.isAnonymous
      ? session.user.id
      : undefined
  const [loadingId, setLoadingId] = useState(initialDraftId ?? '')
  const [draftAppearance, setDraftAppearance] = useState<CardAppearance | null>(
    null
  )
  const [syncedAccountId, setSyncedAccountId] = useState<string | undefined>()
  const [preferenceError, setPreferenceError] = useState('')
  const preferenceQueue = useRef<Promise<void>>(Promise.resolve())
  const recoverySnapshot = useSyncExternalStore(
    preparationRecovery.subscribe,
    preparationRecovery.getSnapshot,
    preparationRecovery.getServerSnapshot
  )
  const recovery = useMemo(
    () => parsePreparationRequest(recoverySnapshot),
    [recoverySnapshot]
  )
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState<PreparedDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [generationReset, setGenerationReset] = useState<number | undefined>()
  const [retry, setRetry] = useState<{
    at: number
    url: string
    allSources: boolean
  } | null>(null)
  const [now, setNow] = useState(0)
  const retryAt =
    retry && (retry.allSources || retry.url === url.trim()) ? retry.at : 0
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const preferences = useSyncExternalStore(
    subscribeCardPreferences,
    cardPreferences.getSnapshot,
    cardPreferences.getServerSnapshot
  )

  useEffect(() => {
    if (!registeredUserId) return
    let active = true
    async function sync() {
      try {
        const appearance = await loadAccountDefault(
          cardPreferences.getSnapshot().appearance
        )
        if (!active) return
        cardPreferences.change(appearance)
        setPreferenceError('')
        setSyncedAccountId(registeredUserId)
      } catch {
        if (!active) return
        setPreferenceError(
          'Your account’s card preference couldn’t sync. Your current draft keeps its chosen style.'
        )
        setSyncedAccountId(registeredUserId)
      }
    }
    void sync()
    return () => {
      active = false
    }
  }, [registeredUserId])

  function changeAppearance(appearance: CardAppearance) {
    setDraftAppearance(appearance)
    cardPreferences.change(appearance)
    if (!registeredUserId) return
    preferenceQueue.current = preferenceQueue.current.then(async () => {
      try {
        await draftRequest('/api/account/preferences', 'PUT', { appearance })
        setPreferenceError('')
      } catch {
        setPreferenceError(
          'Your card style is saved with this draft, but the preference couldn’t sync to your account. Choose the style again to retry.'
        )
      }
    })
  }

  const showDraft = useCallback((result: SavedDraft) => {
    setDraftAppearance(result.appearance)
    setDraft(result)
    setLoadingId('')
    preparationRecovery.clear()
    window.history.replaceState(
      null,
      '',
      `/?draft=${encodeURIComponent(result.draftId)}`
    )
  }, [])

  function back() {
    setDraft(null)
    setDraftAppearance(null)
    setLoadingId('')
    preparationRecovery.clear()
    window.history.replaceState(null, '', '/')
  }

  useEffect(() => {
    if (!retry) return
    const interval = window.setInterval(() => {
      const now = Date.now()
      setNow(now)
      if (now >= retry.at) window.clearInterval(interval)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [retry])

  async function prepareRequest(
    request: PreparationRequest,
    resolveAccountDefault = false
  ) {
    if (pending) return
    setPending(true)
    setError('')
    setGenerationReset(undefined)
    try {
      const current = await authClient.getSession()
      if (current.error)
        throw new ClientRequestError(
          'Your session couldn’t be loaded. Please try again.'
        )
      if (!current.data) {
        const guest = await authClient.signIn.anonymous()
        if (guest.error)
          throw new ClientRequestError(
            'Your guest session couldn’t be started. Please try again.'
          )
      }
      let resolvedRequest = request
      if (
        resolveAccountDefault &&
        current.data?.user.emailVerified &&
        !current.data.user.isAnonymous
      ) {
        // The session hook and its preference effect may still be hydrating.
        // Resolve the real account default before freezing a new request.
        await preferenceQueue.current
        const appearance = await loadAccountDefault(request.appearance)
        resolvedRequest = { ...request, appearance }
        cardPreferences.change(appearance)
        setSyncedAccountId(current.data.user.id)
        setPreferenceError('')
      }
      if (initialTemplateId && !resolvedRequest.templateId)
        resolvedRequest = { ...resolvedRequest, templateId: initialTemplateId }
      preparationRecovery.save(resolvedRequest)
      const result = await draftRequest<DraftResult>(
        '/api/drafts',
        'POST',
        resolvedRequest
      )
      setRetry(null)
      if (result.status === 'ready') showDraft(result)
      else {
        setLoadingId(result.draftId)
        preparationRecovery.clear()
        window.history.replaceState(
          null,
          '',
          `/?draft=${encodeURIComponent(result.draftId)}`
        )
      }
    } catch (err) {
      setError(clientErrorMessage(err))
      const resetAt = generationResetAt(err)
      setGenerationReset(resetAt)
      if (resetAt) setRetry(null)
      if (
        err instanceof DraftRequestError &&
        typeof err.details?.draftId === 'string'
      ) {
        setLoadingId(err.details.draftId)
        preparationRecovery.clear()
        window.history.replaceState(
          null,
          '',
          `/?draft=${encodeURIComponent(err.details.draftId)}`
        )
      }
      if (err instanceof ClientRequestError && err.retryAt && !resetAt) {
        setNow(Date.now())
        setRetry({
          at: err.retryAt,
          url: request.url,
          allSources: err.status === 429
        })
      }
    } finally {
      setPending(false)
    }
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || retrySeconds > 0) return
    const sourceUrl = url.trim()
    const savedRequest = recovery?.url === sourceUrl ? recovery : null
    const request = savedRequest
      ? savedRequest
      : {
          url: sourceUrl,
          requestKey: crypto.randomUUID(),
          appearance: preferences.appearance
        }
    await prepareRequest(request, !savedRequest)
  }

  if (loadingId && !draft)
    return (
      <DraftLoader
        draftId={loadingId}
        onReady={showDraft}
        onBack={back}
        resetAt={generationReset}
      />
    )

  if (draft)
    return (
      <>
        {preferenceError && (
          <Alert>
            <AlertDescription>{preferenceError}</AlertDescription>
          </Alert>
        )}
        <PreviewReview
          key={draft.draftId ?? draft.draftToken}
          draft={draft}
          appearance={draftAppearance ?? preferences.appearance}
          onAppearanceChange={changeAppearance}
          preferencesReady={
            preferences.ready &&
            (!registeredUserId || syncedAccountId === registeredUserId)
          }
          preferencesAvailable={preferences.available}
          onBack={back}
          registered={Boolean(registeredUserId)}
        />
      </>
    )

  return (
    <>
      <section className='hero'>
        <div className='hero-copy'>
          <h1>
            {brand.headlineLines[0]}
            <br />
            <span>{brand.headlineLines[1]}</span>
          </h1>
          <p className='hero-description'>{brand.description}</p>
          {recovery && !pending && (
            <Alert>
              <AlertDescription>
                A previous preparation may still be finishing.{' '}
                <button
                  type='button'
                  className='auth-text-link'
                  disabled={pending}
                  onClick={() => void prepareRequest(recovery)}
                >
                  Check that preparation
                </button>
                .
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={prepare} className='source-form'>
            <FieldGroup>
              <Field data-invalid={Boolean(error)} data-disabled={pending}>
                <FieldLabel htmlFor='source-url' className='sr-only'>
                  Public conversation link
                </FieldLabel>
                <div className='source-input-row'>
                  <Input
                    id='source-url'
                    type='url'
                    name='url'
                    inputMode='url'
                    autoComplete='off'
                    autoCapitalize='none'
                    spellCheck={false}
                    required
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value)
                      setError('')
                    }}
                    placeholder='Paste a public chat link…'
                    disabled={pending}
                    aria-invalid={Boolean(error)}
                  />
                  <Button
                    type='submit'
                    size='lg'
                    disabled={pending || retrySeconds > 0 || !url.trim()}
                  >
                    {pending ? <Spinner data-icon='inline-start' /> : null}
                    {pending
                      ? 'Preparing…'
                      : retrySeconds > 0
                        ? `Retry in ${retrySeconds < 60 ? `${retrySeconds}s` : `${Math.ceil(retrySeconds / 60)}m`}`
                        : brand.cta}
                    {pending || retrySeconds > 0 ? null : (
                      <ArrowRight data-icon='inline-end' />
                    )}
                  </Button>
                </div>
              </Field>
            </FieldGroup>
            <div aria-live='polite' className='form-status'>
              {pending ? (
                <p>Reading the conversation and preparing your preview…</p>
              ) : null}
            </div>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {error}
                  {generationReset && (
                    <p>
                      New summaries are available after{' '}
                      {new Date(generationReset).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                      . You can still reuse cached passages.
                    </p>
                  )}
                  {generationReset && !registeredUserId && (
                    <a
                      className='auth-text-link'
                      href={authHref('/sign-up', '/')}
                    >
                      Save your work with a free account
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
          </form>
          <p className='public-note'>
            Preview first. Publish when you’re ready. No account needed.
          </p>
        </div>
      </section>
      {children}
    </>
  )
}

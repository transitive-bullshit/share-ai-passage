'use client'

import { ArrowRight, Link2 } from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
  useSyncExternalStore
} from 'react'

import { PreviewReview, type PreparedDraft } from '@/components/preview-review'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { brand } from '@/lib/brand'
import {
  CARD_PREFERENCES_KEY,
  createCardPreferencesStore
} from '@/lib/card-preferences'
import {
  ClientRequestError,
  clientErrorMessage,
  postJson
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

export function ShareFlow({ children }: { children?: ReactNode }) {
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState<PreparedDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
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
    if (!retry) return
    const interval = window.setInterval(() => {
      const now = Date.now()
      setNow(now)
      if (now >= retry.at) window.clearInterval(interval)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [retry])

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || retrySeconds > 0) return
    setPending(true)
    setError('')
    try {
      const result = await postJson<PreparedDraft>('/api/prepare', {
        url: url.trim()
      })
      setRetry(null)
      setDraft(result)
    } catch (err) {
      setError(clientErrorMessage(err))
      if (err instanceof ClientRequestError && err.retryAt) {
        setNow(Date.now())
        setRetry({
          at: err.retryAt,
          url: url.trim(),
          allSources: err.status === 429
        })
      }
    } finally {
      setPending(false)
    }
  }

  if (draft)
    return (
      <PreviewReview
        key={draft.draftToken}
        draft={draft}
        appearance={preferences.appearance}
        onAppearanceChange={cardPreferences.change}
        preferencesReady={preferences.ready}
        preferencesAvailable={preferences.available}
        onBack={() => setDraft(null)}
      />
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
                    aria-describedby='source-help'
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
                <FieldDescription id='source-help'>
                  ChatGPT, Codex &amp; Claude. No account needed.{' '}
                  <a href='#public-link-help'>How to get a public link</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
            <div aria-live='polite' className='form-status'>
              {pending ? (
                <p>Reading the conversation and preparing your preview…</p>
              ) : null}
            </div>
            {error ? (
              <Alert variant='destructive'>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
          <p className='public-note'>
            <Link2 size={14} aria-hidden='true' />
            Preview first. Publish when you’re ready.
          </p>
        </div>
      </section>
      {children}
    </>
  )
}

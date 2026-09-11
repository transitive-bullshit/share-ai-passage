'use client'

import { ArrowRight, Link2 } from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
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
import {
  CARD_PREFERENCES_KEY,
  createCardPreferencesStore
} from '@/lib/card-preferences'

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
  const preferences = useSyncExternalStore(
    subscribeCardPreferences,
    cardPreferences.getSnapshot,
    cardPreferences.getServerSnapshot
  )

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(
          result.error ||
            'We could not open that conversation. Please try again.'
        )
      setDraft(result)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not connect. Please try again.'
      )
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
          <p className='hero-announcement'>
            <span className='status-dot' aria-hidden='true' />
            A little more context. A much better link.
          </p>
          <h1>
            Good conversations.
            <br />
            <span>Beautifully shared.</span>
          </h1>
          <p className='hero-description'>
            Turn a public AI chat into a thoughtful preview,
            <br className='desktop-break' /> with the highlights up front and
            the full conversation behind it.
          </p>
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
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder='Paste a public link…'
                    disabled={pending}
                    aria-invalid={Boolean(error)}
                    aria-describedby='source-help'
                  />
                  <Button
                    type='submit'
                    size='lg'
                    disabled={pending || !url.trim()}
                  >
                    {pending ? <Spinner data-icon='inline-start' /> : null}
                    {pending ? 'Preparing…' : 'Go'}
                    {pending ? null : <ArrowRight data-icon='inline-end' />}
                  </Button>
                </div>
                <FieldDescription id='source-help'>
                  ChatGPT, Codex &amp; Claude. No account needed.
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

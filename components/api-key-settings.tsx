'use client'

import { ArrowLeft, Copy, KeyRound, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { useAccountSession } from '@/components/account-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'

type SavedKey = {
  id: string
  name: string | null
  start: string | null
  createdAt: string
  lastRequest: string | null
}

export function ApiKeySettings() {
  const { data: session, isPending } = useAccountSession()
  const userId =
    session?.user.emailVerified && !session.user.isAnonymous
      ? session.user.id
      : null
  return (
    <ApiKeyDetails
      key={userId || 'guest'}
      userId={userId}
      isPending={isPending}
    />
  )
}

function ApiKeyDetails({
  userId,
  isPending
}: {
  userId: string | null
  isPending: boolean
}) {
  const [keys, setKeys] = useState<SavedKey[] | null>(null)
  const [name, setName] = useState('')
  const [created, setCreated] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    void fetch('/api/account/keys', {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok)
          throw new Error(result.error || 'API keys couldn’t load.')
        setKeys(result.keys)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : 'API keys couldn’t load.'
          )
      })
    return () => controller.abort()
  }, [userId, revision])

  async function change(
    method: 'POST' | 'DELETE',
    body: { name: string } | { id: string }
  ) {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/account/keys', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || 'That request could not complete.')
      if (result.key) {
        setCreated(result.key)
        setCopied(false)
        setName('')
      }
      setRevision((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'That request could not complete.'
      )
    } finally {
      setPending(false)
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    void change('POST', { name })
  }

  return (
    <main id='main' className='account-page'>
      <a
        className='auth-text-link inline-flex items-center gap-2'
        href='/account'
      >
        <ArrowLeft size={16} />
        Your account
      </a>
      <div className='account-heading'>
        <h1>API keys</h1>
        <p>
          Create passages from your CLI using your account’s saved style and
          allowances.
        </p>
      </div>
      {isPending ? (
        <p className='auth-loading'>
          <Spinner />
          Loading your account…
        </p>
      ) : !userId ? (
        <Button asChild>
          <a href={authHref('/sign-in', '/account/keys')}>Sign in</a>
        </Button>
      ) : (
        <>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {error}{' '}
                <button
                  className='auth-text-link'
                  onClick={() => {
                    setError('')
                    setRevision((value) => value + 1)
                  }}
                >
                  Try again
                </button>
              </AlertDescription>
            </Alert>
          ) : null}
          {created ? (
            <section
              className='rounded-2xl border border-border p-5 space-y-3'
              aria-label='New API key'
            >
              <h2 className='font-medium'>Copy your new API key</h2>
              <p className='text-sm text-muted-foreground'>
                It is shown only here. Save it privately as PASSAGE_API_KEY; set
                PASSAGE_URL to your Passage server.
              </p>
              <Input
                aria-label='New API key'
                readOnly
                value={created}
                autoComplete='off'
                spellCheck={false}
              />
              <Button
                variant='outline'
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created)
                    setCopied(true)
                  } catch {
                    setError('Select the key and copy it manually.')
                  }
                }}
              >
                <Copy data-icon='inline-start' />
                {copied ? 'Copied' : 'Copy key'}
              </Button>
              <Button variant='ghost' onClick={() => setCreated('')}>
                I’ve saved it
              </Button>
            </section>
          ) : null}
          <section className='account-section'>
            <div className='account-section-heading'>
              <h2>Create an API key</h2>
              <p>Give each tool or device its own key.</p>
            </div>
            <form
              className='account-section-content space-y-3'
              onSubmit={create}
            >
              <label htmlFor='key-name' className='text-sm font-medium'>
                Key name
              </label>
              <Input
                id='key-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={64}
                placeholder='My laptop'
              />
              <Button type='submit' disabled={pending || !name.trim()}>
                <KeyRound data-icon='inline-start' />
                Create key
              </Button>
            </form>
          </section>
          <p className='text-sm text-muted-foreground'>
            Keys can create and edit your drafts, publish, run generation jobs,
            and read usage and default style. Account settings and billing
            require browser sign-in. Revoke a key to stop future requests.
          </p>
          {keys === null ? (
            <p className='auth-loading'>
              <Spinner />
              Loading API keys…
            </p>
          ) : keys.length === 0 ? (
            <p className='text-muted-foreground'>
              You haven’t created any API keys.
            </p>
          ) : (
            <ul className='divide-y divide-border'>
              {keys.map((key) => (
                <li
                  key={key.id}
                  className='flex items-center justify-between gap-4 py-4'
                >
                  <div>
                    <p className='font-medium'>{key.name}</p>
                    <p className='text-sm text-muted-foreground'>
                      {key.start}… ·{' '}
                      {key.lastRequest
                        ? `Last used ${new Date(key.lastRequest).toLocaleDateString()}`
                        : 'Not used yet'}
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    disabled={pending}
                    aria-label={`Revoke ${key.name}`}
                    onClick={() => void change('DELETE', { id: key.id })}
                  >
                    <Trash2 data-icon='inline-start' />
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}

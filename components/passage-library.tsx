'use client'

import {
  ArrowRight,
  ExternalLink,
  FileText,
  Library,
  Plus,
  Trash2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { CopyLink } from '@/components/copy-link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useAccountSession } from '@/components/account-session'
import { authHref } from '@/lib/auth-navigation'
import {
  ClientRequestError,
  clientErrorMessage,
  postJson
} from '@/lib/client-request'

type LibraryDraft = {
  id: string
  title: string
  status: 'preparing' | 'ready' | 'failed'
  updatedAt: string
  errorMessage: string | null
  revision: number
}

type LibraryPassage = {
  id: string
  title: string
  provider: string
  shareUrl: string
  createdAt: string
}

type LibraryPage = {
  drafts: LibraryDraft[]
  passages: LibraryPassage[]
  usage: {
    allowance: number
    used: number
    reserved: number
    remaining: number
    resetAt: string
  }
  nextDraftCursor: string | null
  nextPublicationCursor: string | null
}

type Removal = { kind: 'drafts' | 'passages'; id: string; title: string }

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

async function libraryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init
  })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      result &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : 'Your passages couldn’t load. Please try again.'
    throw new ClientRequestError(message, response.status)
  }
  if (result === null && init?.method !== 'DELETE') {
    throw new ClientRequestError(
      'The response could not be read. Please try again.',
      response.status
    )
  }
  return result as T
}

function LibraryAccess({
  verify = false,
  email
}: {
  verify?: boolean
  email?: string
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <Library aria-hidden='true' />
        </EmptyMedia>
        <EmptyTitle>
          {verify
            ? 'Verify your email to save your place'
            : 'A home for your passages'}
        </EmptyTitle>
        <EmptyDescription>
          {verify
            ? 'Finish setting up your account to find your saved drafts and shared passages here.'
            : 'Sign in to find your drafts and shared passages on any device.'}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link
            href={
              verify
                ? authHref('/verify-email', '/passages', email ? { email } : {})
                : authHref('/sign-in', '/passages')
            }
          >
            {verify ? 'Verify email' : 'Sign in'}
            <ArrowRight data-icon='inline-end' aria-hidden='true' />
          </Link>
        </Button>
        <Link href='/create'>
          You can still create a passage without an account.
        </Link>
      </EmptyContent>
    </Empty>
  )
}

export function PassageLibrary() {
  const { data: session, isPending, error, refetch } = useAccountSession()
  return (
    <main id='main' className='passage-library'>
      <header className='library-heading'>
        <div>
          <p className='account-eyebrow'>Your workspace</p>
          <h1>My passages</h1>
          <p>Pick up a draft or revisit something you shared.</p>
        </div>
        <Button asChild className='rounded-full'>
          <Link href='/create'>
            <Plus data-icon='inline-start' aria-hidden='true' />
            Create a passage
          </Link>
        </Button>
      </header>
      {isPending ? (
        <p className='library-loading' role='status'>
          <Spinner />
          Loading your passages…
        </p>
      ) : error ? (
        <Alert variant='destructive'>
          <AlertDescription>
            Your account couldn’t load.
            <Button variant='link' onClick={() => void refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : !session || session.user.isAnonymous ? (
        <LibraryAccess />
      ) : !session.user.emailVerified ? (
        <LibraryAccess verify email={session.user.email} />
      ) : (
        <LibraryEntries key={session.user.id} />
      )}
    </main>
  )
}

function LibraryEntries() {
  const router = useRouter()
  const [data, setData] = useState<LibraryPage | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [access, setAccess] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState<'drafts' | 'passages' | null>(
    null
  )
  const [pending, setPending] = useState<string | null>(null)
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [notice, setNotice] = useState('')
  const revisionKeys = useRef(new Map<string, string>())

  useEffect(() => {
    const controller = new AbortController()
    void libraryRequest<LibraryPage>('/api/passages', {
      signal: controller.signal
    })
      .then((page) => {
        if (!controller.signal.aborted) {
          setData(page)
          setError('')
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (
          err instanceof ClientRequestError &&
          (err.status === 401 || err.status === 403)
        )
          setAccess(err.status)
        else setError(clientErrorMessage(err))
      })
    return () => controller.abort()
  }, [attempt])

  async function loadMore(kind: 'drafts' | 'passages') {
    if (!data || loadingMore || pending) return
    const cursor =
      kind === 'drafts' ? data.nextDraftCursor : data.nextPublicationCursor
    if (!cursor) return
    setLoadingMore(kind)
    setError('')
    try {
      const query = new URLSearchParams({
        [kind === 'drafts' ? 'draftCursor' : 'publicationCursor']: cursor
      })
      const page = await libraryRequest<LibraryPage>(`/api/passages?${query}`)
      setData((current) => {
        if (!current) return current
        const seen = new Set(current[kind].map((entry) => entry.id))
        return kind === 'drafts'
          ? {
              ...current,
              usage: page.usage,
              drafts: [
                ...current.drafts,
                ...page.drafts.filter((entry) => !seen.has(entry.id))
              ],
              nextDraftCursor: page.nextDraftCursor
            }
          : {
              ...current,
              usage: page.usage,
              passages: [
                ...current.passages,
                ...page.passages.filter((entry) => !seen.has(entry.id))
              ],
              nextPublicationCursor: page.nextPublicationCursor
            }
      })
    } catch (err) {
      if (
        err instanceof ClientRequestError &&
        (err.status === 401 || err.status === 403)
      ) {
        setData(null)
        setAccess(err.status)
      } else setError(clientErrorMessage(err))
    } finally {
      setLoadingMore(null)
    }
  }

  async function revise(passage: LibraryPassage) {
    if (pending || loadingMore) return
    const requestKey =
      revisionKeys.current.get(passage.id) ?? crypto.randomUUID()
    revisionKeys.current.set(passage.id, requestKey)
    setPending(`revise:${passage.id}`)
    setError('')
    setNotice('')
    try {
      const result = await postJson<{ draftId: string }>(
        `/api/passages/${encodeURIComponent(passage.id)}/revise`,
        { requestKey }
      )
      router.push(`/create?passage=${encodeURIComponent(result.draftId)}`)
    } catch (err) {
      if (err instanceof ClientRequestError && err.status === 401) {
        setData(null)
        setAccess(401)
      } else setError(clientErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    if (!removal || pending || loadingMore) return
    const target = removal
    setPending(`delete:${target.id}`)
    setError('')
    setNotice('')
    try {
      await libraryRequest(
        `/api/${target.kind}/${encodeURIComponent(target.id)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      )
      setData((current) =>
        current
          ? {
              ...current,
              drafts:
                target.kind === 'drafts'
                  ? current.drafts.filter((entry) => entry.id !== target.id)
                  : current.drafts,
              passages:
                target.kind === 'passages'
                  ? current.passages.filter((entry) => entry.id !== target.id)
                  : current.passages
            }
          : current
      )
      setRemoval(null)
      setNotice(
        target.kind === 'drafts'
          ? 'Draft deleted.'
          : 'Passage deleted. Its shared link is no longer available.'
      )
    } catch (err) {
      if (err instanceof ClientRequestError && err.status === 401) {
        setData(null)
        setAccess(401)
      } else setError(clientErrorMessage(err))
    } finally {
      setPending(null)
    }
  }

  if (access) return <LibraryAccess verify={access === 403} />
  if (!data)
    return error ? (
      <Alert variant='destructive'>
        <AlertDescription>
          {error}
          <Button
            variant='link'
            onClick={() => {
              setError('')
              setAttempt((value) => value + 1)
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <p className='library-loading' role='status'>
        <Spinner />
        Loading your passages…
      </p>
    )
  const busy = Boolean(pending || loadingMore)
  const confirmation = removal ? (
    <Alert>
      <AlertDescription>
        <strong>Delete “{removal.title || 'Untitled draft'}”?</strong>
        <p>
          {removal.kind === 'drafts'
            ? 'Your saved draft will be removed. Any passage you already published stays available.'
            : 'This passage and its shared link will no longer be available.'}{' '}
          Deleting doesn’t restore used generations.
        </p>
        <div className='library-confirm-actions'>
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() => void remove()}
          >
            {pending === `delete:${removal.id}` ? (
              <Spinner data-icon='inline-start' />
            ) : null}
            Delete {removal.kind === 'drafts' ? 'draft' : 'passage'}
          </Button>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => setRemoval(null)}
          >
            Keep it
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  ) : null

  return (
    <>
      <section className='library-usage' aria-label='Summary usage'>
        <div>
          <strong>
            {data.usage.remaining} of {data.usage.allowance}
          </strong>
          <span>summary generations left this month</span>
        </div>
        <p>
          {data.usage.reserved ? `${data.usage.reserved} pending · ` : ''}Resets{' '}
          {dateLabel(data.usage.resetAt)}. Cached summaries, edits and
          publishing don’t use generations.
        </p>
      </section>
      {error ? (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p className='library-notice' role='status' aria-live='polite'>
        {notice}
      </p>
      <section className='library-section' aria-labelledby='library-published'>
        <div className='library-section-heading'>
          <h2 id='library-published'>Published</h2>
          <p>
            Revising creates a new draft and leaves your shared link unchanged.
          </p>
        </div>
        {data.passages.length ? (
          <ul className='library-list'>
            {data.passages.map((passage) => (
              <li className='library-row' key={passage.id}>
                <div className='library-entry'>
                  <a className='library-title' href={passage.shareUrl}>
                    {passage.title}
                  </a>
                  <p>
                    {passage.provider === 'claude'
                      ? 'Claude'
                      : passage.provider === 'gemini'
                        ? 'Gemini'
                        : passage.provider === 'codex'
                          ? 'Codex'
                          : 'ChatGPT'}{' '}
                    · Published {dateLabel(passage.createdAt)}
                  </p>
                  <a className='library-read' href={passage.shareUrl}>
                    Read the passage
                    <ExternalLink aria-hidden='true' />
                  </a>
                </div>
                <div className='library-row-actions'>
                  <CopyLink url={passage.shareUrl} />
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => void revise(passage)}
                  >
                    {pending === `revise:${passage.id}` ? (
                      <Spinner data-icon='inline-start' />
                    ) : null}
                    Revise
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={`Delete passage: ${passage.title}`}
                    disabled={busy}
                    onClick={() =>
                      setRemoval({
                        kind: 'passages',
                        id: passage.id,
                        title: passage.title
                      })
                    }
                  >
                    <Trash2 aria-hidden='true' />
                  </Button>
                </div>
                {removal?.kind === 'passages' && removal.id === passage.id
                  ? confirmation
                  : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Library aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>Good conversations deserve to travel</EmptyTitle>
              <EmptyDescription>
                When you publish your first passage, it will appear here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant='outline'>
                <Link href='/create'>
                  Create a passage
                  <ArrowRight data-icon='inline-end' aria-hidden='true' />
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}
        {data.nextPublicationCursor ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => void loadMore('passages')}
          >
            {loadingMore === 'passages' ? (
              <Spinner data-icon='inline-start' />
            ) : null}
            Load more passages
          </Button>
        ) : null}
      </section>
      <section className='library-section' aria-labelledby='library-drafts'>
        <div className='library-section-heading'>
          <h2 id='library-drafts'>Drafts</h2>
          <p>Private until you publish.</p>
        </div>
        {data.drafts.length ? (
          <ul className='library-list'>
            {data.drafts.map((draft) => (
              <li className='library-row' key={draft.id}>
                <div className='library-entry'>
                  <Link
                    className='library-title'
                    href={`/create?passage=${encodeURIComponent(draft.id)}`}
                  >
                    {draft.title || 'Untitled draft'}
                  </Link>
                  <p>
                    <span>
                      {draft.status === 'ready'
                        ? 'Ready to review'
                        : draft.status === 'preparing'
                          ? 'Preparing'
                          : 'Needs attention'}
                    </span>{' '}
                    · Updated {dateLabel(draft.updatedAt)}
                  </p>
                  {draft.errorMessage ? <p>{draft.errorMessage}</p> : null}
                </div>
                <div className='library-row-actions'>
                  <Button asChild variant='outline'>
                    <Link
                      href={`/create?passage=${encodeURIComponent(draft.id)}`}
                    >
                      Resume
                      <ArrowRight data-icon='inline-end' aria-hidden='true' />
                    </Link>
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label={`Delete draft: ${draft.title || 'Untitled draft'}`}
                    disabled={busy}
                    onClick={() =>
                      setRemoval({
                        kind: 'drafts',
                        id: draft.id,
                        title: draft.title
                      })
                    }
                  >
                    <Trash2 aria-hidden='true' />
                  </Button>
                </div>
                {removal?.kind === 'drafts' && removal.id === draft.id
                  ? confirmation
                  : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileText aria-hidden='true' />
              </EmptyMedia>
              <EmptyTitle>No drafts yet</EmptyTitle>
              <EmptyDescription>
                Your work is saved here as you create a passage.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {data.nextDraftCursor ? (
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => void loadMore('drafts')}
          >
            {loadingMore === 'drafts' ? (
              <Spinner data-icon='inline-start' />
            ) : null}
            Load more drafts
          </Button>
        ) : null}
      </section>
    </>
  )
}

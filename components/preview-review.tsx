'use client'

import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react'
import Link from 'next/link'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'

import { DraftGenerationControls } from '@/components/draft-generation-controls'
import { CopyLink } from '@/components/copy-link'
import {
  SocialCardPreview,
  type CardPreviewStatus
} from '@/components/social-card-preview'
import { SocialTemplatePicker } from '@/components/social-template-picker'
import { SummaryEditor } from '@/components/summary-editor'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { authHref } from '@/lib/auth-navigation'
import {
  createDraftAutosave,
  type DraftSaveSnapshot
} from '@/lib/draft-autosave'
import { draftRequest, saveDraft, type SavedDraft } from '@/lib/draft-client'
import type { CardAppearance } from '@/lib/card-appearance'
import { clientErrorMessage, postJson } from '@/lib/client-request'
import { parseGeneratedPreview } from '@/lib/summary'
import {
  type GeneratedPreview,
  type Provider,
  providerNames
} from '@/lib/domain'

const legacySaveSnapshot: DraftSaveSnapshot = {
  status: 'saved',
  revision: 0,
  error: ''
}
const legacySaveSubscribe = () => () => {}
const getLegacySaveSnapshot = () => legacySaveSnapshot

export type PreparedDraft = {
  draftId?: string
  revision?: number
  status?: 'ready'
  /** Capability to publish this reviewed snapshot and preview. */
  draftToken: string
  /** Service hosting the original conversation. */
  provider: Provider
  /** Public URL of the original share. */
  sourceUrl: string
  /** Generated title and highlights shown for review. */
  preview: GeneratedPreview
  /** Saved style when preparing an existing passage. */
  appearance?: CardAppearance
}

export function PreviewReview({
  draft,
  appearance,
  onAppearanceChange,
  preferencesReady,
  preferencesAvailable,
  onBack,
  registered = false
}: {
  draft: PreparedDraft
  appearance: CardAppearance
  onAppearanceChange: (appearance: CardAppearance) => void
  preferencesReady: boolean
  preferencesAvailable: boolean
  onBack: () => void
  registered?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(draft.preview)
  const [generating, setGenerating] = useState(false)
  const [autosave] = useState(() =>
    draft.draftId && draft.revision !== undefined
      ? createDraftAutosave(
          { preview: draft.preview, appearance, revision: draft.revision },
          (revision, content) => saveDraft(draft.draftId!, revision, content)
        )
      : null
  )
  const save = useSyncExternalStore(
    autosave?.subscribe ?? legacySaveSubscribe,
    autosave?.getSnapshot ?? getLegacySaveSnapshot,
    autosave?.getSnapshot ?? getLegacySaveSnapshot
  )
  const editingDisabled = pending || generating

  const validation = useMemo(() => parseGeneratedPreview(preview), [preview])
  const cardPreview = validation.success ? validation.data : preview
  const [card, setCard] = useState<CardPreviewStatus | null>(null)
  const [cardAttempt, setCardAttempt] = useState(0)
  const [shareUrl, setShareUrl] = useState('')
  const [lockedAppearance, setLockedAppearance] =
    useState<CardAppearance | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Keep the approved style fixed through publishing, including preference
  // changes arriving from another tab.
  const activeAppearance = lockedAppearance ?? appearance
  const templateId = activeAppearance.templateId
  const currentCard =
    card?.appearance === activeAppearance && card.attempt === cardAttempt
      ? card
      : null
  const currentCardError = currentCard?.error || ''
  const cardReady = Boolean(
    preferencesReady && currentCard?.loaded && !currentCardError
  )
  const publishReady = cardReady && validation.success

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [shareUrl])

  useEffect(() => {
    if (!autosave || save.status === 'saved') return
    function protectUnsaved(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [autosave, save.status])

  useEffect(() => () => autosave?.dispose(), [autosave])

  async function back() {
    if (editingDisabled) return
    try {
      await autosave?.flush()
      onBack()
    } catch (err) {
      setError(clientErrorMessage(err))
    }
  }

  function changeAppearance(next: CardAppearance) {
    if (editingDisabled || shareUrl) return
    onAppearanceChange(next)
    autosave?.change({ preview, appearance: next })
  }

  function acceptDraft(next: SavedDraft) {
    setPreview(next.preview)
    onAppearanceChange(next.appearance)
    autosave?.accept(next)
    setCardAttempt((attempt) => attempt + 1)
    setError('')
  }

  function retryCard() {
    setCardAttempt((attempt) => attempt + 1)
  }

  function changePreview(next: GeneratedPreview) {
    if (editingDisabled || shareUrl) return
    setPreview(next)
    autosave?.change({ preview: next, appearance: activeAppearance })
    setCardAttempt((attempt) => attempt + 1)
    setError('')
  }

  async function publish() {
    if (!publishReady || !validation.success || editingDisabled || shareUrl)
      return
    setLockedAppearance(activeAppearance)
    setPending(true)
    setError('')
    try {
      const revision = await autosave?.flush()
      const result = draft.draftId
        ? await draftRequest<{ shareUrl: string }>(
            `/api/drafts/${draft.draftId}/publish`,
            'POST',
            { revision }
          )
        : await postJson<{ shareUrl: string }>('/api/publish', {
            draftToken: draft.draftToken,
            appearance: activeAppearance,
            preview: validation.data
          })
      setShareUrl(result.shareUrl)
    } catch (err) {
      setLockedAppearance(null)
      setError(clientErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  if (shareUrl) {
    return (
      <section className='published-state'>
        <p className='eyebrow'>
          <Check size={16} aria-hidden='true' /> Published successfully
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          Your passage is published.
        </h1>
        <p>
          One link for the highlights and the saved conversation. Copy it below
          and share it wherever the conversation continues.
        </p>
        <div className='published-preview'>
          <SocialCardPreview
            preview={cardPreview}
            provider={draft.provider}
            appearance={activeAppearance}
          />
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='published-url'>Your passage link</FieldLabel>
            <Input
              id='published-url'
              value={shareUrl}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </Field>
        </FieldGroup>
        <div className='published-actions'>
          <CopyLink url={shareUrl} />
          <Button asChild>
            <Link href={shareUrl}>
              Read the passage
              <ArrowUpRight data-icon='inline-end' />
            </Link>
          </Button>
        </div>
        <Button variant='ghost' onClick={() => void back()}>
          Create another passage
        </Button>
      </section>
    )
  }

  return (
    <section className='review-section'>
      <div className='review-navigation'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => void back()}
          disabled={editingDisabled}
        >
          <ArrowLeft data-icon='inline-start' />
          Back
        </Button>
        <span>Preview &amp; publish</span>
        {autosave && (
          <span className='draft-status' role='status'>
            {save.status === 'saved'
              ? 'Saved'
              : save.status === 'waiting' || save.status === 'saving'
                ? 'Saving…'
                : save.status === 'conflict'
                  ? 'Newer draft available'
                  : 'Changes not saved'}
          </span>
        )}
      </div>
      <div className='review-heading'>
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Review your passage
          </h1>
        </div>
        <a
          className='text-link'
          href={draft.sourceUrl}
          target='_blank'
          rel='noopener noreferrer'
        >
          Open in {providerNames[draft.provider]}{' '}
          <ArrowUpRight size={16} aria-hidden='true' />
        </a>
      </div>
      <div className='review-grid'>
        <div className='review-content'>
          <SummaryEditor
            preview={preview}
            issues={validation.error?.issues ?? []}
            disabled={editingDisabled}
            onChange={changePreview}
          />

          {draft.draftId && autosave && (
            <DraftGenerationControls
              draftId={draft.draftId}
              preview={preview}
              disabled={pending || save.status === 'conflict'}
              flush={autosave.flush}
              onAccept={acceptDraft}
              onBusy={setGenerating}
              registered={registered}
            />
          )}
          {autosave &&
            (save.status === 'error' || save.status === 'conflict') && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {save.status === 'conflict'
                    ? 'This draft was changed in another tab or device. Your edits are still here. Copy anything you want to keep before reloading the saved draft.'
                    : 'Your latest changes haven’t been saved yet.'}
                  <div className='account-actions'>
                    {save.status === 'conflict' ? (
                      <Button asChild size='sm' variant='outline'>
                        <a href={`/?draft=${draft.draftId}`}>
                          Reload saved draft
                        </a>
                      </Button>
                    ) : (
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => void autosave.flush().catch(() => {})}
                      >
                        Try saving again
                      </Button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          {draft.draftId && !registered && (
            <p className='draft-status'>
              Your draft is saved for this browser.{' '}
              <a
                className='auth-text-link'
                href={authHref('/sign-up', `/?draft=${draft.draftId}`)}
              >
                Create an account
              </a>{' '}
              to keep your passages together.
            </p>
          )}
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className='publish-control'>
            <Button
              size='lg'
              onClick={publish}
              disabled={
                !publishReady || editingDisabled || save.status === 'conflict'
              }
            >
              {pending ? <Spinner data-icon='inline-start' /> : null}
              {pending ? 'Publishing…' : 'Publish passage'}
              {pending ? null : <ArrowUpRight data-icon='inline-end' />}
            </Button>
          </div>
        </div>
        <aside className='review-preview' aria-label='Social card preview'>
          <div
            className='live-card'
            aria-busy={!cardReady && !currentCardError}
          >
            {preferencesReady ? (
              <SocialCardPreview
                key={`${draft.draftToken}:${templateId}:${cardAttempt}`}
                preview={cardPreview}
                provider={draft.provider}
                appearance={activeAppearance}
                attempt={cardAttempt}
                onStatusChange={setCard}
              />
            ) : (
              <div className='card-loading'>
                {currentCardError ? null : <Spinner />}
                {currentCardError
                  ? 'Preview unavailable'
                  : 'Preparing your card…'}
              </div>
            )}
          </div>
          {currentCardError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {currentCardError}
                <Button type='button' variant='outline' onClick={retryCard}>
                  Try preview again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <SocialTemplatePicker
            appearance={activeAppearance}
            provider={draft.provider}
            onChange={changeAppearance}
            disabled={editingDisabled || !preferencesReady}
            preferencesAvailable={preferencesAvailable}
          />
        </aside>
      </div>
    </section>
  )
}

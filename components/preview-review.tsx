'use client'

import { ArrowLeft, ArrowUpRight, Check } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'

import { ImageGenerationControls } from '@/components/image-generation-controls'
import { useDesignArtwork } from '@/components/template-recipe-editor'
import {
  defaultTemplateRecipe,
  draftDesignSchema,
  resolveCardDesign,
  type DraftDesign,
  type ResolvedCardDesign
} from '@/lib/paid-design'
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

const DraftDesignControls = dynamic(() =>
  import('@/components/draft-design-controls').then(
    (module) => module.DraftDesignControls
  )
)

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
  design?: DraftDesign | null
  resolvedDesign?: ResolvedCardDesign | null
  artwork?: { background?: string; logo?: string }
  canCustomize?: boolean
  imageJobId?: string
  imageGenerationError?: string
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
  const [design, setDesign] = useState<DraftDesign | null>(draft.design ?? null)
  const [frozenDesign, setFrozenDesign] = useState<ResolvedCardDesign | null>(
    draft.resolvedDesign ?? null
  )
  const [autosave] = useState(() =>
    draft.draftId && draft.revision !== undefined
      ? createDraftAutosave(
          {
            preview: draft.preview,
            appearance,
            design: draft.design ?? null,
            revision: draft.revision
          },
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
  const validDesign = design ? draftDesignSchema.safeParse(design) : null
  const resolvedDesign = useMemo(() => {
    if (!design) return null
    const parsed = draftDesignSchema.safeParse(design)
    return parsed.success
      ? (frozenDesign ?? resolveCardDesign(activeAppearance, parsed.data))
      : null
  }, [design, frozenDesign, activeAppearance])
  const media = useDesignArtwork(
    design?.recipe ?? defaultTemplateRecipe(templateId),
    design?.generatedImage?.assetId
  )
  const backgroundPending =
    design?.recipe.background.mode === 'generated' && !design.generatedImage
  const currentCard =
    card?.appearance === activeAppearance && card.attempt === cardAttempt
      ? card
      : null
  const currentCardError = currentCard?.error || ''
  const cardReady = Boolean(
    preferencesReady &&
    currentCard?.loaded &&
    !currentCardError &&
    !media.loading &&
    !media.error
  )
  const publishReady =
    cardReady &&
    validation.success &&
    (!validDesign || validDesign.success) &&
    !backgroundPending &&
    (!design || draft.canCustomize === true)

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
    setDesign(null)
    setFrozenDesign(null)
    autosave?.change({ preview, appearance: next, design: null })
  }

  function acceptDraft(next: SavedDraft) {
    setPreview(next.preview)
    setDesign(next.design ?? null)
    setFrozenDesign(next.resolvedDesign ?? null)
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
    autosave?.change({ preview: next, appearance: activeAppearance, design })
    setCardAttempt((attempt) => attempt + 1)
    setError('')
  }

  function changeDesign(next: DraftDesign | null) {
    if (editingDisabled || shareUrl) return
    const nextAppearance = next
      ? { templateId: next.recipe.baseStyle }
      : activeAppearance
    setDesign(next)
    setFrozenDesign(null)
    onAppearanceChange(nextAppearance)
    autosave?.change({ preview, appearance: nextAppearance, design: next })
    setCardAttempt((value) => value + 1)
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
            resolvedDesign={resolvedDesign ?? undefined}
            artwork={media.artwork}
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
          {draft.draftId &&
            autosave &&
            design?.recipe.background.mode === 'generated' && (
              <ImageGenerationControls
                draftId={draft.draftId}
                initialJobId={draft.imageJobId}
                initialError={draft.imageGenerationError}
                hasImage={Boolean(design.generatedImage)}
                disabled={pending || generating || save.status === 'conflict'}
                canGenerate={draft.canCustomize === true}
                flush={autosave.flush}
                getSave={autosave.getSnapshot}
                onAccept={acceptDraft}
              />
            )}
          {backgroundPending && (
            <p className='draft-status' role='status'>
              Your text is ready. Generate a background or choose a curated or
              uploaded image before publishing.
            </p>
          )}
          {design && !draft.canCustomize && (
            <Alert>
              <AlertDescription>
                Your custom design and artwork are saved.{' '}
                <a className='auth-text-link' href='/account/billing'>
                  Choose a paid plan
                </a>{' '}
                to publish with this design, or{' '}
                <button
                  className='auth-text-link'
                  type='button'
                  onClick={() => changeDesign(null)}
                >
                  switch this draft to a Free card style
                </button>
                .
              </AlertDescription>
            </Alert>
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
            {preferencesReady && !media.loading && !media.error ? (
              <SocialCardPreview
                key={`${draft.draftToken}:${templateId}:${cardAttempt}`}
                preview={cardPreview}
                provider={draft.provider}
                appearance={activeAppearance}
                resolvedDesign={resolvedDesign ?? undefined}
                artwork={media.artwork}
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
                {currentCard?.retryable !== false && (
                  <Button type='button' variant='outline' onClick={retryCard}>
                    Try preview again
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {!design && (
            <SocialTemplatePicker
              appearance={activeAppearance}
              provider={draft.provider}
              onChange={changeAppearance}
              disabled={editingDisabled || !preferencesReady}
              preferencesAvailable={preferencesAvailable}
            />
          )}
          {registered && draft.draftId && draft.canCustomize && (
            <DraftDesignControls
              design={design}
              appearance={activeAppearance}
              disabled={editingDisabled || save.status === 'conflict'}
              onChange={changeDesign}
            />
          )}
          {registered && !draft.canCustomize && !design && (
            <p className='draft-status'>
              <a className='auth-text-link' href='/account/billing'>
                Customize your brand
              </a>{' '}
              with uploaded artwork, saved templates and image generation.
            </p>
          )}
          {media.error && (
            <Alert variant='destructive'>
              <AlertDescription>
                {media.error}
                <Button type='button' variant='outline' onClick={media.retry}>
                  Reload artwork
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </aside>
      </div>
    </section>
  )
}

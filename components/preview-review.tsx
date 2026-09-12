'use client'

import { ArrowLeft, ArrowUpRight, BookOpen, Check } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

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
import type { CardAppearance } from '@/lib/card-appearance'
import { clientErrorMessage, postJson } from '@/lib/client-request'
import { getSocialTemplate } from '@/lib/social-templates'
import { parseGeneratedPreview } from '@/lib/summary'
import {
  type GeneratedPreview,
  type Provider,
  providerNames
} from '@/lib/domain'

export type PreparedDraft = {
  /** Capability to publish this reviewed snapshot and preview. */
  draftToken: string
  /** Service hosting the original conversation. */
  provider: Provider
  /** Public URL of the original share. */
  sourceUrl: string
  /** Generated title and highlights shown for review. */
  preview: GeneratedPreview
}

export function PreviewReview({
  draft,
  appearance,
  onAppearanceChange,
  preferencesReady,
  preferencesAvailable,
  onBack
}: {
  draft: PreparedDraft
  appearance: CardAppearance
  onAppearanceChange: (appearance: CardAppearance) => void
  preferencesReady: boolean
  preferencesAvailable: boolean
  onBack: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(draft.preview)
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

  function retryCard() {
    setCardAttempt((attempt) => attempt + 1)
  }

  function changePreview(next: GeneratedPreview) {
    if (pending || shareUrl) return
    setPreview(next)
    setCardAttempt((attempt) => attempt + 1)
    setError('')
  }

  async function publish() {
    if (!publishReady || !validation.success || pending || shareUrl) return
    setLockedAppearance(activeAppearance)
    setPending(true)
    setError('')
    try {
      const result = await postJson<{ shareUrl: string }>('/api/publish', {
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
        <Button variant='ghost' onClick={onBack}>
          Create another passage
        </Button>
      </section>
    )
  }

  return (
    <section className='review-section'>
      <div className='review-navigation'>
        <Button variant='ghost' size='sm' onClick={onBack} disabled={pending}>
          <ArrowLeft data-icon='inline-start' />
          Back
        </Button>
        <span>Preview &amp; publish</span>
      </div>
      <div className='review-heading'>
        <div>
          <p className='eyebrow'>Ready when you are</p>
          <h1 ref={headingRef} tabIndex={-1}>
            Review your passage.
          </h1>
          <p className='review-description'>
            Fine-tune the title and highlights, then choose a style.
          </p>
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
            disabled={pending}
            onChange={changePreview}
          />
          <p className='review-note'>
            Keep the wording true to the conversation. Your edits will appear on
            the card and above the saved conversation.
          </p>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className='publish-control'>
            <Button
              size='lg'
              onClick={publish}
              disabled={!publishReady || pending}
            >
              {pending ? <Spinner data-icon='inline-start' /> : null}
              {pending ? 'Publishing…' : 'Publish passage'}
              {pending ? null : <ArrowUpRight data-icon='inline-end' />}
            </Button>
            <p>
              Creates a public link to your preview
              <br />
              and the saved conversation.
            </p>
          </div>
        </div>
        <aside className='review-preview' aria-label='Social card preview'>
          <div className='preview-heading'>
            <span className='eyebrow'>Your social card</span>
            <span role='status'>
              {!validation.success
                ? 'Check your text'
                : cardReady
                  ? 'Ready to publish'
                  : currentCardError
                    ? 'Preview unavailable'
                    : preferencesReady
                      ? 'Preparing…'
                      : 'Loading your preference…'}
            </span>
          </div>
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
          <p className='preview-note'>
            {getSocialTemplate(templateId).name} · How your link will appear
            when you share it.
          </p>
          <SocialTemplatePicker
            appearance={activeAppearance}
            provider={draft.provider}
            onChange={onAppearanceChange}
            disabled={pending || !preferencesReady}
            preferencesAvailable={preferencesAvailable}
          />
          <div className='reader-promise'>
            <BookOpen size={18} aria-hidden='true' />
            <p>
              <strong>The saved conversation, included.</strong>
              <br />
              Read the saved conversation text, with known omissions marked and
              a link to the original on {providerNames[draft.provider]}.
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

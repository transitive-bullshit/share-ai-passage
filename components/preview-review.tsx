'use client'

import { ArrowLeft, ArrowUpRight, BookOpen, Check } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { CopyLink } from '@/components/copy-link'
import { SocialTemplatePicker } from '@/components/social-template-picker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { CardAppearance } from '@/lib/card-appearance'
import { clientErrorMessage, postBlob, postJson } from '@/lib/client-request'
import { getSocialTemplate } from '@/lib/social-templates'
import {
  type GeneratedPreview,
  type Provider,
  providerNames
} from '@/lib/domain'

export type PreparedDraft = {
  draftToken: string
  provider: Provider
  sourceUrl: string
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
  const [card, setCard] = useState<{
    url: string
    appearance: CardAppearance
    attempt: number
    loaded: boolean
    error?: string
  } | null>(null)
  const [cardError, setCardError] = useState<{
    appearance: CardAppearance
    attempt: number
    message: string
  } | null>(null)
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
  const currentCardError =
    (cardError?.appearance === activeAppearance &&
    cardError.attempt === cardAttempt
      ? cardError.message
      : '') ||
    currentCard?.error ||
    ''
  const cardReady = Boolean(
    preferencesReady && currentCard?.loaded && !currentCardError
  )
  const cardAlt = `${draft.preview.title}: ${draft.preview.highlights.join(' ')}`

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [shareUrl])

  useEffect(() => {
    if (!preferencesReady) return
    const controller = new AbortController()
    let objectUrl: string | undefined

    async function loadCard() {
      try {
        const blob = await postBlob(
          '/api/card',
          {
            draftToken: draft.draftToken,
            appearance: activeAppearance
          },
          controller.signal
        )
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setCard({
          url: objectUrl,
          appearance: activeAppearance,
          attempt: cardAttempt,
          loaded: false
        })
      } catch (err) {
        if (!controller.signal.aborted)
          setCardError({
            appearance: activeAppearance,
            attempt: cardAttempt,
            message: clientErrorMessage(err)
          })
      }
    }

    void loadCard()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [draft.draftToken, cardAttempt, activeAppearance, preferencesReady])

  function retryCard() {
    setCardAttempt((attempt) => attempt + 1)
  }

  async function publish() {
    if (!cardReady || pending || shareUrl) return
    setLockedAppearance(activeAppearance)
    setPending(true)
    setError('')
    try {
      const result = await postJson<{ shareUrl: string }>('/api/publish', {
        draftToken: draft.draftToken,
        appearance: activeAppearance
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
          One link for the highlights and the full conversation. Copy it below
          and share it wherever the conversation continues.
        </p>
        <div className='published-preview'>
          {currentCard ? (
            <img
              src={currentCard.url}
              width={1200}
              height={630}
              alt={cardAlt}
            />
          ) : null}
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='published-url'>Your share link</FieldLabel>
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
              View passage
              <ArrowUpRight data-icon='inline-end' />
            </Link>
          </Button>
        </div>
        <Button variant='ghost' onClick={onBack}>
          Share another conversation
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
            A clear introduction to a conversation worth sharing.
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
          <div className='generated-summary' aria-labelledby='generated-title'>
            <p className='eyebrow'>AI summary</p>
            <h2 id='generated-title'>{draft.preview.title}</h2>
            <ul>
              {draft.preview.highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          </div>
          <p className='review-note'>
            This title and these highlights will introduce your saved
            conversation. Take a moment to review them before publishing.
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
              disabled={!cardReady || pending}
            >
              {pending ? <Spinner data-icon='inline-start' /> : null}
              {pending ? 'Publishing…' : 'Publish passage'}
              {pending ? null : <ArrowUpRight data-icon='inline-end' />}
            </Button>
            <p>
              Creates a public link to your preview
              <br />
              and the full saved conversation.
            </p>
          </div>
        </div>
        <aside className='review-preview' aria-label='Social card preview'>
          <div className='preview-heading'>
            <span className='eyebrow'>Your social card</span>
            <span role='status'>
              {cardReady
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
            {currentCard ? (
              <img
                key={currentCard.url}
                src={currentCard.url}
                width={1200}
                height={630}
                alt={cardAlt}
                onLoad={() =>
                  setCard((latest) =>
                    latest?.url === currentCard.url &&
                    latest.appearance === activeAppearance &&
                    latest.attempt === cardAttempt
                      ? { ...latest, loaded: true }
                      : latest
                  )
                }
                onError={() =>
                  setCard((latest) =>
                    latest?.url === currentCard.url &&
                    latest.appearance === activeAppearance &&
                    latest.attempt === cardAttempt
                      ? {
                          ...latest,
                          error: 'The card preview could not be displayed.'
                        }
                      : latest
                  )
                }
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
              <strong>The full conversation, included.</strong>
              <br />
              Every message is saved as it appeared, with a link back to the
              original on {providerNames[draft.provider]}.
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}

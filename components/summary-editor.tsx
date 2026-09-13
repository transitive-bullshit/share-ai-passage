'use client'

import { X } from 'lucide-react'

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  type GeneratedPreview,
  limits,
  summaryRecommendations
} from '@/lib/domain'
import { normalizeSummaryText } from '@/lib/summary'

type ValidationIssue = { path: readonly PropertyKey[]; message: string }

function SummaryTextField({
  id,
  label,
  value,
  recommendation,
  wordCount = false,
  onRemove,
  error,
  groupError,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  recommendation: number
  wordCount?: boolean
  onRemove?: () => void
  error?: string
  groupError?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const normalized = normalizeSummaryText(value)
  const count = wordCount
    ? normalized
      ? normalized.split(/\s+/u).length
      : 0
    : Array.from(normalized).length
  const unit = wordCount ? (count === 1 ? 'word' : 'words') : 'characters'
  const invalid = Boolean(error || groupError)
  return (
    <Field data-invalid={invalid} data-disabled={disabled}>
      <div className='summary-field-heading'>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span
          id={`${id}-count`}
          className='summary-character-count'
          data-over-limit={count > recommendation}
          aria-label={`${count} ${unit}; ${recommendation} or fewer recommended`}
        >
          {count} {unit} · {wordCount ? '~' : ''}
          {recommendation} recommended
        </span>
        {onRemove ? (
          <Button
            type='button'
            variant='ghost'
            size='icon-xs'
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <X />
          </Button>
        ) : null}
      </div>
      <Textarea
        id={id}
        name={id}
        value={value}
        rows={2}
        className='resize-none'
        required={id === 'summary-title'}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={[
          `${id}-count`,
          error ? `${id}-error` : '',
          groupError ? 'summary-error' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        onChange={(event) => onChange(event.target.value)}
      />

      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}

export function SummaryEditor({
  preview,
  issues,
  disabled,
  onChange
}: {
  preview: GeneratedPreview
  issues: readonly ValidationIssue[]
  disabled: boolean
  onChange: (preview: GeneratedPreview) => void
}) {
  const groupError = issues.find((issue) => issue.path.length === 0)?.message
  return (
    <div className='summary-editor'>
      <FieldGroup>
        <SummaryTextField
          id='summary-title'
          label='Title'
          value={preview.title}
          recommendation={summaryRecommendations.titleWords}
          wordCount
          error={issues.find((issue) => issue.path[0] === 'title')?.message}
          disabled={disabled}
          onChange={(title) => onChange({ ...preview, title })}
        />
        {preview.highlights.map((highlight, index) => (
          <SummaryTextField
            key={index}
            id={`summary-highlight-${index + 1}`}
            label={`Highlight ${index + 1}`}
            value={highlight}
            recommendation={summaryRecommendations.highlight}
            error={
              issues.find(
                (issue) =>
                  issue.path[0] === 'highlights' && issue.path[1] === index
              )?.message
            }
            onRemove={() =>
              onChange({
                ...preview,
                highlights: preview.highlights.filter(
                  (_, position) => position !== index
                )
              })
            }
            groupError={groupError}
            disabled={disabled}
            onChange={(text) =>
              onChange({
                ...preview,
                highlights: preview.highlights.map((value, position) =>
                  position === index ? text : value
                )
              })
            }
          />
        ))}
        {preview.highlights.length < limits.highlights ? (
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() =>
              onChange({ ...preview, highlights: [...preview.highlights, ''] })
            }
          >
            Add highlight
          </Button>
        ) : null}
        {groupError ? (
          <FieldError id='summary-error'>{groupError}</FieldError>
        ) : null}
      </FieldGroup>
    </div>
  )
}

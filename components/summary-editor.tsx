'use client'

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { type GeneratedPreview, limits } from '@/lib/domain'
import { normalizeSummaryText } from '@/lib/summary'

type ValidationIssue = { path: readonly PropertyKey[]; message: string }

function SummaryTextField({
  id,
  label,
  value,
  limit,
  error,
  groupError,
  disabled,
  onChange
}: {
  id: string
  label: string
  value: string
  limit: number
  error?: string
  groupError?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const count = Array.from(normalizeSummaryText(value)).length
  const invalid = Boolean(error || groupError)
  return (
    <Field data-invalid={invalid} data-disabled={disabled}>
      <div className='summary-field-heading'>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span
          id={`${id}-count`}
          className='summary-character-count'
          data-over-limit={count > limit}
          aria-label={`${count} of ${limit} characters`}
        >
          {count} / {limit}
        </span>
      </div>
      <Textarea
        id={id}
        name={id}
        value={value}
        rows={2}
        className='resize-none'
        required
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
          limit={limits.title}
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
            limit={limits.highlight}
            error={
              issues.find(
                (issue) =>
                  issue.path[0] === 'highlights' && issue.path[1] === index
              )?.message
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
        {groupError ? (
          <FieldError id='summary-error'>{groupError}</FieldError>
        ) : null}
      </FieldGroup>
    </div>
  )
}

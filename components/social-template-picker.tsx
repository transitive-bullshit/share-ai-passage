'use client'

import { Check } from 'lucide-react'

import { SocialTemplateThumbnail } from '@/components/social-template-thumbnail'

import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldTitle
} from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type CardAppearance, parseCardAppearance } from '@/lib/card-appearance'
import type { Provider } from '@/lib/domain'
import { socialTemplates } from '@/lib/social-templates'

export function SocialTemplatePicker({
  appearance,
  provider,
  onChange,
  disabled,
  preferencesAvailable
}: {
  appearance: CardAppearance
  provider: Provider
  onChange: (appearance: CardAppearance) => void
  disabled: boolean
  preferencesAvailable: boolean
}) {
  return (
    <FieldGroup className='social-template-picker'>
      <Field data-disabled={disabled}>
        <FieldTitle id='social-template-label'>
          Choose your card style
        </FieldTitle>

        <ToggleGroup
          type='single'
          variant='outline'
          spacing={2}
          value={appearance.templateId}
          onValueChange={(templateId) => {
            const next = parseCardAppearance({ templateId })
            if (next && next.templateId !== appearance.templateId)
              onChange(next)
          }}
          disabled={disabled}
          aria-labelledby='social-template-label'
          aria-describedby={
            preferencesAvailable ? undefined : 'social-template-memory'
          }
          className='social-template-options'
        >
          {socialTemplates.map((template) => (
            <ToggleGroupItem
              key={template.id}
              value={template.id}
              className='social-template-option'
              aria-label={template.name}
            >
              <span className='social-template-thumbnail'>
                <SocialTemplateThumbnail
                  template={template}
                  provider={provider}
                />
                <span className='social-template-check' aria-hidden='true'>
                  <Check />
                </span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!preferencesAvailable ? (
          <FieldDescription id='social-template-memory' role='status'>
            Used for this visit. This browser couldn’t save your preference.
          </FieldDescription>
        ) : null}
      </Field>
    </FieldGroup>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { draftRequest } from '@/lib/draft-client'
import {
  defaultTemplateRecipe,
  type DraftDesign,
  type TemplateRecipe
} from '@/lib/paid-design'
import type { CardAppearance } from '@/lib/card-appearance'
import { TemplateRecipeEditor } from './template-recipe-editor'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Spinner } from './ui/spinner'

type Template = {
  id: string
  name: string
  revision: number
  recipe: TemplateRecipe
}
export function DraftDesignControls({
  design,
  appearance,
  disabled,
  onChange
}: {
  design: DraftDesign | null
  appearance: CardAppearance
  disabled: boolean
  onChange: (design: DraftDesign | null) => void
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('My passage style')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void draftRequest<{ templates: Template[] }>('/api/templates')
      .then((result) => {
        if (active) setTemplates(result.templates)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  async function save() {
    if (!design) return
    setPending(true)
    setError('')
    try {
      const { template } = await draftRequest<{ template: Template }>(
        '/api/templates',
        'POST',
        { name, recipe: design.recipe }
      )
      setTemplates((current) => [template, ...current])
      setNotice(
        'Template saved. Set it as your default in Your templates to use it for future passages.'
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The template could not be saved.'
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <details className='mt-6 flex flex-col gap-4'>
      <summary className='auth-text-link cursor-pointer'>
        Customize this passage
      </summary>
      <div className='flex flex-col gap-5 pt-4'>
        {templates.length > 0 && (
          <div
            className='flex flex-wrap gap-2'
            aria-label='Apply a saved template'
          >
            {templates.slice(0, 10).map((template) => (
              <Button
                key={template.id}
                type='button'
                size='sm'
                variant='outline'
                disabled={disabled || pending}
                onClick={() =>
                  onChange({
                    version: 1,
                    recipe: template.recipe,
                    fromTemplate: {
                      id: template.id,
                      revision: template.revision
                    }
                  })
                }
              >
                Use {template.name}
              </Button>
            ))}
          </div>
        )}
        {design ? (
          <>
            <TemplateRecipeEditor
              recipe={design.recipe}
              showPreview={false}
              disabled={disabled || pending}
              onChange={(recipe) => onChange({ ...design, recipe })}
            />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='draft-template-name'>
                  Save this style as a template
                </FieldLabel>
                <Input
                  id='draft-template-name'
                  value={name}
                  maxLength={80}
                  disabled={disabled || pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className='flex flex-wrap gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={disabled || pending || !name.trim()}
                onClick={() => void save()}
              >
                {pending && <Spinner data-icon='inline-start' />}Save as new
                template
              </Button>
              <Button
                type='button'
                variant='ghost'
                disabled={disabled || pending}
                onClick={() => onChange(null)}
              >
                Use a Free card style
              </Button>
            </div>
          </>
        ) : (
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() =>
              onChange({
                version: 1,
                recipe: defaultTemplateRecipe(appearance.templateId),
                fromTemplate: null
              })
            }
          >
            Customize colors, artwork and branding
          </Button>
        )}
        <a className='auth-text-link' href='/account/templates'>
          Manage all templates and your default
        </a>
        {notice && (
          <p className='draft-status' role='status'>
            {notice}
          </p>
        )}
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </details>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'

import { authHref } from '@/lib/auth-navigation'
import { draftRequest } from '@/lib/draft-client'
import {
  defaultTemplateRecipe,
  templateRecipeSchema,
  type TemplateRecipe
} from '@/lib/paid-design'
import { useAccountSession } from './account-session'
import { TemplateRecipeEditor } from './template-recipe-editor'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Separator } from './ui/separator'
import { Spinner } from './ui/spinner'

type TemplateSaveInput = {
  name: string
  recipe: TemplateRecipe
  revision?: number
}
type SavedTemplate = {
  id: string
  name: string
  revision: number
  recipe: TemplateRecipe
}
type TemplateList = {
  templates: SavedTemplate[]
  defaultTemplateId: string | null
  nextCursor: string | null
  canCustomize: boolean
}
export function TemplateEditor() {
  const session = useAccountSession()
  const [data, setData] = useState<TemplateList | null>(null)
  const [selected, setSelected] = useState<SavedTemplate | null>(null)
  const [name, setName] = useState('My personal style')
  const [recipe, setRecipe] = useState(defaultTemplateRecipe)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reload, setReload] = useState(0)
  const user = session.data?.user
  const registered = Boolean(user && !user.isAnonymous && user.emailVerified)
  useEffect(() => {
    if (!registered) return
    let active = true
    void draftRequest<TemplateList>('/api/templates').then(
      (result) => {
        if (active) {
          setData(result)
          setError('')
        }
      },
      (err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : 'Your templates could not load.'
          )
      }
    )
    return () => {
      active = false
    }
  }, [registered, user?.id, reload])
  const dirty =
    !selected ||
    name !== selected.name ||
    JSON.stringify(recipe) !== JSON.stringify(selected.recipe)
  async function run(action: string, work: () => Promise<void>) {
    setPending(action)
    setError('')
    setNotice('')
    try {
      await work()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The change could not be saved.'
      )
    } finally {
      setPending(null)
    }
  }
  function open(template: SavedTemplate | null) {
    setSelected(template)
    setName(template?.name ?? 'My personal style')
    setRecipe(template?.recipe ?? defaultTemplateRecipe())
    setConfirmDelete(false)
    setError('')
    setNotice('')
  }
  async function save(asNew: boolean) {
    if (!templateRecipeSchema.safeParse(recipe).success) {
      setError('Choose valid colors and images before saving.')
      return
    }
    await run('save', async () => {
      const body: TemplateSaveInput = { name, recipe }
      if (!asNew && selected) body.revision = selected.revision
      const { template } = await draftRequest<{ template: SavedTemplate }>(
        asNew || !selected ? '/api/templates' : `/api/templates/${selected.id}`,
        asNew || !selected ? 'POST' : 'PATCH',
        body
      )
      setSelected(template)
      setName(template.name)
      setRecipe(template.recipe)
      setData((current) =>
        current
          ? {
              ...current,
              templates: [
                template,
                ...current.templates.filter((item) => item.id !== template.id)
              ]
            }
          : current
      )
      setNotice(
        'Template saved. Existing drafts and shared passages keep their current design.'
      )
    })
  }
  if (session.isPending)
    return (
      <main id='main' className='account-page'>
        <p role='status'>
          <Spinner /> Loading your templates…
        </p>
      </main>
    )
  if (!registered)
    return (
      <main id='main' className='account-page'>
        <div className='account-heading'>
          <h1>Your signature style.</h1>
          <p>
            Sign in to save templates and keep a consistent look across your
            passages.
          </p>
        </div>
        <Button asChild>
          <a href={authHref('/sign-in', '/account/templates')}>Sign in</a>
        </Button>
      </main>
    )
  return (
    <main
      id='main'
      className='mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12'
    >
      <div className='account-heading'>
        <h1>Your signature style.</h1>
        <p>Give every passage a look that feels like you.</p>
      </div>
      <div className='flex flex-wrap gap-3'>
        <Button asChild variant='outline'>
          <a href='/account'>Your account</a>
        </Button>
        <Button asChild variant='outline'>
          <a href='/'>Create a passage</a>
        </Button>
      </div>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role='status'>
          <Check aria-hidden='true' />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {!data ? (
        <div>
          <p>Loading your templates…</p>
          {error && (
            <Button
              type='button'
              variant='outline'
              onClick={() => setReload((value) => value + 1)}
            >
              Try again
            </Button>
          )}
        </div>
      ) : (
        <>
          {!data.canCustomize && (
            <Alert>
              <AlertDescription>
                Custom card branding and saved templates are included with Plus
                and Pro. Your saved designs remain here when your plan ends.{' '}
                <a className='auth-text-link' href='/account/billing'>
                  View plans
                </a>
              </AlertDescription>
            </Alert>
          )}
          <section aria-label='Saved templates' className='flex flex-col gap-4'>
            <div className='flex flex-wrap gap-3'>
              <Button
                type='button'
                variant='outline'
                disabled={Boolean(pending)}
                onClick={() => open(null)}
              >
                <Plus data-icon='inline-start' /> New template
              </Button>
              {data.templates.map((template) => (
                <Button
                  key={template.id}
                  type='button'
                  variant={
                    selected?.id === template.id ? 'secondary' : 'outline'
                  }
                  disabled={Boolean(pending)}
                  onClick={() => open(template)}
                >
                  {template.name}
                  {data.defaultTemplateId === template.id ? ' · Default' : ''}
                </Button>
              ))}
            </div>
            {data.templates.length === 0 && (
              <p className='text-sm text-muted-foreground'>
                Start with one of the five layouts, then make its colors, type
                and branding your own.
              </p>
            )}
            {data.nextCursor && (
              <Button
                type='button'
                variant='outline'
                disabled={Boolean(pending)}
                onClick={() =>
                  void run('more', async () => {
                    const next = await draftRequest<TemplateList>(
                      `/api/templates?cursor=${data.nextCursor}`
                    )
                    setData({
                      ...next,
                      templates: [...data.templates, ...next.templates]
                    })
                  })
                }
              >
                Load more templates
              </Button>
            )}
          </section>
          <Separator />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void save(false)
            }}
            className='flex flex-col gap-8'
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor='template-name'>Template name</FieldLabel>
                <Input
                  id='template-name'
                  value={name}
                  maxLength={80}
                  required
                  disabled={!data.canCustomize || Boolean(pending)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <TemplateRecipeEditor
              key={selected?.id ?? 'new'}
              recipe={recipe}
              onChange={setRecipe}
              disabled={!data.canCustomize || Boolean(pending)}
            />
            <div className='flex flex-wrap gap-3'>
              <Button
                type='submit'
                disabled={
                  !data.canCustomize ||
                  Boolean(pending) ||
                  !dirty ||
                  !templateRecipeSchema.safeParse(recipe).success
                }
              >
                {pending === 'save' && <Spinner data-icon='inline-start' />}
                {selected ? 'Update template' : 'Save template'}
              </Button>
              {selected && data.canCustomize && !dirty && !pending && (
                <Button asChild variant='outline'>
                  <a href={`/?template=${selected.id}`}>Try with a passage</a>
                </Button>
              )}
              {selected && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={!data.canCustomize || Boolean(pending)}
                  onClick={() => void save(true)}
                >
                  Save as new
                </Button>
              )}
              {selected && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={
                    !data.canCustomize ||
                    Boolean(pending) ||
                    dirty ||
                    data.defaultTemplateId === selected.id
                  }
                  onClick={() =>
                    void run('default', async () => {
                      await draftRequest('/api/templates/default', 'PUT', {
                        templateId: selected.id
                      })
                      setData({ ...data, defaultTemplateId: selected.id })
                      setNotice(
                        'This template is now your default for new passages from the web, CLI and skill.'
                      )
                    })
                  }
                >
                  Use as default
                </Button>
              )}
              {data.defaultTemplateId && (
                <Button
                  type='button'
                  variant='ghost'
                  disabled={!data.canCustomize || Boolean(pending)}
                  onClick={() =>
                    void run('default', async () => {
                      await draftRequest('/api/templates/default', 'PUT', {
                        templateId: null
                      })
                      setData({ ...data, defaultTemplateId: null })
                      setNotice(
                        'New passages will use your curated account style.'
                      )
                    })
                  }
                >
                  Use curated account default
                </Button>
              )}
            </div>
            {dirty && selected && (
              <p className='text-sm text-muted-foreground'>
                Save these changes before setting this template as your default.
              </p>
            )}
          </form>
          {selected && (
            <section
              className='flex flex-col gap-3'
              aria-label='Remove template'
            >
              <p className='text-sm text-muted-foreground'>
                Removing a template keeps the designs already saved in your
                drafts and shared passages.
              </p>
              {confirmDelete ? (
                <div className='flex gap-3'>
                  <Button
                    type='button'
                    variant='destructive'
                    disabled={Boolean(pending)}
                    onClick={() =>
                      void run('delete', async () => {
                        await draftRequest(
                          `/api/templates/${selected.id}`,
                          'DELETE',
                          {}
                        )
                        setData({
                          ...data,
                          templates: data.templates.filter(
                            (item) => item.id !== selected.id
                          ),
                          defaultTemplateId:
                            data.defaultTemplateId === selected.id
                              ? null
                              : data.defaultTemplateId
                        })
                        open(null)
                        setNotice('Template removed.')
                      })
                    }
                  >
                    Remove this template
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={Boolean(pending)}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep template
                  </Button>
                </div>
              ) : (
                <div>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={Boolean(pending)}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 data-icon='inline-start' /> Remove template
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  )
}

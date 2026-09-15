'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'

import type { AssetDescriptor, UploadPurpose } from '@/lib/assets'
import type { CardArtwork } from '@/lib/card'
import { draftRequest } from '@/lib/draft-client'
import {
  defaultTemplateRecipe,
  fontPairingIds,
  resolveCardDesign,
  templateRecipeSchema,
  type TemplateRecipe
} from '@/lib/paid-design'
import { socialTemplates } from '@/lib/social-templates'
import { SocialCardPreview } from './social-card-preview'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Spinner } from './ui/spinner'
import { Textarea } from './ui/textarea'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

type Library = {
  assets: AssetDescriptor[]
  nextCursor: string | null
  uploadsAvailable: boolean
  usage: { usedBytes: number; reservedBytes: number; limitBytes: number }
}
const sample = {
  title: 'A calmer way to build with AI',
  highlights: [
    'Start with a clear question.',
    'Make the tradeoffs visible.',
    'Keep the reasoning close.'
  ]
}
export function useDesignArtwork(
  recipe: TemplateRecipe,
  generatedAssetId?: string
) {
  const backgroundId =
    recipe.background.mode === 'uploaded'
      ? recipe.background.assetId
      : recipe.background.mode === 'generated'
        ? (generatedAssetId ?? null)
        : null
  const logoId =
    recipe.branding.mode === 'custom' ? recipe.branding.assetId : null
  const [result, setResult] = useState<{
    ids: string
    artwork: { background?: string; logo?: string }
    error?: string
  }>({ ids: '', artwork: {} })
  const [retry, setRetry] = useState(0)
  const ids = `${backgroundId ?? ''}:${logoId ?? ''}`
  useEffect(() => {
    let active = true
    const artwork: CardArtwork = {}
    void Promise.all(
      (
        [
          ['background', backgroundId],
          ['logo', logoId]
        ] as const
      ).map(async ([slot, id]) => {
        if (!id) return
        const access = await draftRequest<{ url: string }>(
          `/api/assets/${id}/access`
        )
        artwork[slot] = access.url
      })
    ).then(
      () => {
        if (active) setResult({ ids, artwork })
      },
      (err: unknown) => {
        if (active)
          setResult({
            ids,
            artwork: {},
            error:
              err instanceof Error ? err.message : 'The image could not load.'
          })
      }
    )
    return () => {
      active = false
    }
  }, [backgroundId, logoId, ids, retry])
  return {
    artwork: result.ids === ids ? result.artwork : {},
    error: result.ids === ids ? result.error : undefined,
    loading: result.ids !== ids,
    retry: () => setRetry((value) => value + 1)
  }
}
export function TemplateRecipeEditor({
  recipe,
  onChange,
  disabled: externallyDisabled = false,
  showPreview = true
}: {
  recipe: TemplateRecipe
  onChange: (recipe: TemplateRecipe) => void
  disabled?: boolean
  showPreview?: boolean
}) {
  const [library, setLibrary] = useState<Library | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const disabled = externallyDisabled || Boolean(pending)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [uploadRecovery, setUploadRecovery] = useState<{
    id: string
    purpose: UploadPurpose
  } | null>(null)
  const [revision, setRevision] = useState(0)
  const media = useDesignArtwork(recipe)
  const parsed = useMemo(() => templateRecipeSchema.safeParse(recipe), [recipe])
  const resolved = useMemo(
    () =>
      parsed.success
        ? resolveCardDesign(
            { templateId: recipe.baseStyle },
            {
              version: 1,
              recipe: parsed.data,
              fromTemplate: null,
              generatedImage: null
            }
          )
        : null,
    [parsed, recipe.baseStyle]
  )
  useEffect(() => {
    let active = true
    void draftRequest<Library>('/api/assets').then(
      (data) => {
        if (active) setLibrary(data)
      },
      (err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : 'The image library could not load.'
          )
      }
    )
    return () => {
      active = false
    }
  }, [revision])
  function chooseAsset(purpose: UploadPurpose, id: string) {
    if (!mounted.current) return
    if (purpose === 'background')
      onChange({ ...recipe, background: { mode: 'uploaded', assetId: id } })
    else if (purpose === 'reference')
      onChange({ ...recipe, referenceAssetId: id })
    else
      onChange({
        ...recipe,
        branding: {
          mode: 'custom',
          assetId: id,
          name:
            recipe.branding.mode === 'custom' ? recipe.branding.name : undefined
        }
      })
  }
  async function finalize(id: string, purpose: UploadPurpose) {
    const { asset } = await draftRequest<{ asset: AssetDescriptor }>(
      `/api/assets/${id}/finalize`,
      'POST',
      {}
    )
    if (!mounted.current) return
    setLibrary((current) =>
      current
        ? {
            ...current,
            assets: [
              asset,
              ...current.assets.filter((item) => item.id !== asset.id)
            ]
          }
        : current
    )
    chooseAsset(purpose, asset.id)
    setUploadRecovery(null)
    setRevision((value) => value + 1)
  }
  async function upload(file: File, purpose: UploadPurpose) {
    setError('')
    setPending(purpose)
    try {
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        !file.size ||
        file.size > 10_000_000
      )
        throw new Error('Choose a PNG, JPEG or WebP image up to 10 MB.')
      const reservation = await draftRequest<{
        assetId: string
        status: 'pending' | 'processing' | 'ready'
        uploadUrl?: string
        headers?: Record<string, string>
      }>('/api/assets/uploads', 'POST', {
        requestKey: crypto.randomUUID(),
        purpose,
        contentType: file.type,
        byteSize: file.size
      })
      setUploadRecovery({ id: reservation.assetId, purpose })
      if (reservation.status === 'pending' && reservation.uploadUrl) {
        const response = await fetch(reservation.uploadUrl, {
          method: 'PUT',
          headers: reservation.headers,
          body: file,
          credentials: 'omit',
          referrerPolicy: 'no-referrer'
        })
        if (!response.ok && response.status !== 412)
          throw new Error(
            'The image could not upload. Check your connection, then choose the file again.'
          )
      }
      await finalize(reservation.assetId, purpose)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The image could not upload.'
      )
    } finally {
      setPending(null)
    }
  }
  function fileField(
    purpose: UploadPurpose,
    title: string,
    selectedId: string | null
  ) {
    const options =
      library?.assets.filter((asset) => asset.purpose === purpose) ?? []
    return (
      <Field>
        <FieldLabel htmlFor={`template-${purpose}`}>{title}</FieldLabel>
        <select
          id={`template-${purpose}`}
          className='h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm'
          value={selectedId ?? ''}
          disabled={disabled || Boolean(pending)}
          onChange={(event) => chooseAsset(purpose, event.target.value)}
        >
          <option value='' disabled>
            Choose an uploaded image
          </option>
          {selectedId && !options.some((asset) => asset.id === selectedId) && (
            <option value={selectedId}>Saved image</option>
          )}
          {options.map((asset, index) => (
            <option key={asset.id} value={asset.id}>
              {title} {index + 1} · {asset.width} × {asset.height}
            </option>
          ))}
        </select>
        <FieldLabel htmlFor={`upload-${purpose}`}>
          <Upload aria-hidden='true' /> Upload{' '}
          {purpose === 'reference'
            ? 'a style reference'
            : purpose === 'logo'
              ? 'a logo or avatar'
              : 'a background'}
        </FieldLabel>
        <Input
          id={`upload-${purpose}`}
          type='file'
          accept='image/png,image/jpeg,image/webp'
          disabled={disabled || Boolean(pending) || !library?.uploadsAvailable}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file, purpose)
          }}
        />
        {pending === purpose && (
          <FieldDescription>
            <Spinner /> Checking your image…
          </FieldDescription>
        )}
      </Field>
    )
  }
  return (
    <div className='grid min-w-0 gap-8 lg:grid-cols-2'>
      <div className='min-w-0'>
        <FieldGroup>
          <Field>
            <FieldLabel>Base layout</FieldLabel>
            <ToggleGroup
              type='single'
              variant='outline'
              className='flex-wrap'
              value={recipe.baseStyle}
              disabled={disabled}
              onValueChange={(value) => {
                const style = socialTemplates.find((item) => item.id === value)
                if (style) onChange({ ...recipe, baseStyle: style.id })
              }}
            >
              {socialTemplates.map((style) => (
                <ToggleGroupItem key={style.id} value={style.id}>
                  {style.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>Colors</FieldLabel>
            <div className='grid grid-cols-3 gap-3'>
              {(['surface', 'text', 'accent'] as const).map((color) => (
                <Field key={color}>
                  <FieldLabel htmlFor={`color-${color}`}>
                    {color[0]!.toUpperCase() + color.slice(1)}
                  </FieldLabel>
                  <Input
                    type='color'
                    id={`color-${color}`}
                    value={recipe.colors[color]}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...recipe,
                        colors: {
                          ...recipe.colors,
                          [color]: event.target.value
                        }
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <FieldDescription>
              Colors style your text and overlay. They do not recolor existing
              artwork.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Typography</FieldLabel>
            <ToggleGroup
              type='single'
              variant='outline'
              value={recipe.fontPairing}
              disabled={disabled}
              onValueChange={(value) => {
                if (fontPairingIds.some((id) => id === value))
                  onChange({
                    ...recipe,
                    fontPairing: value as TemplateRecipe['fontPairing']
                  })
              }}
            >
              <ToggleGroupItem value='newsreader-inter'>
                Editorial
              </ToggleGroupItem>
              <ToggleGroupItem value='dm-sans-inter'>Modern</ToggleGroupItem>
              <ToggleGroupItem value='dm-sans'>Soft sans</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel>Card branding</FieldLabel>
            <ToggleGroup
              type='single'
              variant='outline'
              value={recipe.branding.mode}
              disabled={disabled}
              onValueChange={(value) => {
                if (value === 'passage' || value === 'none')
                  onChange({ ...recipe, branding: { mode: value } })
                else if (value === 'custom')
                  onChange({
                    ...recipe,
                    branding: { mode: 'custom', assetId: '' }
                  })
              }}
            >
              <ToggleGroupItem value='passage'>Passage</ToggleGroupItem>
              <ToggleGroupItem value='none'>None</ToggleGroupItem>
              <ToggleGroupItem value='custom'>Your brand</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              The card always credits the original conversation platform.
            </FieldDescription>
          </Field>
          {recipe.branding.mode === 'custom' && (
            <>
              {fileField('logo', 'Logo or avatar', recipe.branding.assetId)}
              <Field>
                <FieldLabel htmlFor='brand-name'>
                  Brand name (optional)
                </FieldLabel>
                <Input
                  id='brand-name'
                  value={recipe.branding.name ?? ''}
                  maxLength={60}
                  disabled={disabled}
                  onChange={(event) => {
                    if (recipe.branding.mode === 'custom')
                      onChange({
                        ...recipe,
                        branding: {
                          ...recipe.branding,
                          name: event.target.value
                        }
                      })
                  }}
                />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel>Background</FieldLabel>
            <ToggleGroup
              type='single'
              variant='outline'
              value={recipe.background.mode}
              disabled={disabled}
              onValueChange={(value) => {
                if (value === 'curated' || value === 'generated')
                  onChange({ ...recipe, background: { mode: value } })
                else if (value === 'uploaded')
                  onChange({
                    ...recipe,
                    background: { mode: 'uploaded', assetId: '' }
                  })
              }}
            >
              <ToggleGroupItem value='curated'>Curated</ToggleGroupItem>
              <ToggleGroupItem value='uploaded'>Uploaded</ToggleGroupItem>
              <ToggleGroupItem value='generated'>Generated</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {recipe.background.mode === 'uploaded' &&
            fileField(
              'background',
              'Background image',
              recipe.background.assetId
            )}
          {recipe.background.mode !== 'curated' && (
            <Field>
              <FieldLabel>Crop position</FieldLabel>
              <div className='grid grid-cols-2 gap-3'>
                {(['x', 'y'] as const).map((axis) => (
                  <Field key={axis}>
                    <FieldLabel htmlFor={`crop-${axis}`}>
                      {axis === 'x' ? 'Horizontal' : 'Vertical'}
                    </FieldLabel>
                    <Input
                      id={`crop-${axis}`}
                      type='range'
                      min={0}
                      max={100}
                      value={recipe.crop[axis] * 100}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          ...recipe,
                          crop: {
                            ...recipe.crop,
                            [axis]: Number(event.target.value) / 100
                          }
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </Field>
          )}
          {recipe.background.mode === 'generated' && (
            <>
              <Field>
                <FieldLabel htmlFor='art-direction'>Art direction</FieldLabel>
                <Textarea
                  id='art-direction'
                  rows={3}
                  maxLength={500}
                  disabled={disabled}
                  value={recipe.artDirection}
                  onChange={(event) =>
                    onChange({ ...recipe, artDirection: event.target.value })
                  }
                  placeholder='Soft paper textures, quiet landscapes, warm natural light…'
                />
                <FieldDescription>
                  Describe a consistent visual style. Each generated background
                  will also reflect its passage.
                </FieldDescription>
              </Field>
              {fileField(
                'reference',
                'Private style reference',
                recipe.referenceAssetId
              )}
              {recipe.referenceAssetId && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={disabled}
                  onClick={() =>
                    onChange({ ...recipe, referenceAssetId: null })
                  }
                >
                  Remove reference from template
                </Button>
              )}
              <FieldDescription>
                Saving a template does not generate an image. Generate or test
                the background from a passage draft; each new image uses one
                image credit.
              </FieldDescription>
            </>
          )}
          <div>
            <Button
              type='button'
              variant='ghost'
              disabled={disabled}
              onClick={() => onChange(defaultTemplateRecipe(recipe.baseStyle))}
            >
              Reset this recipe to the base style
            </Button>
          </div>
          {library && (
            <FieldDescription>
              {(library.usage.usedBytes / 1_000_000).toFixed(1)} MB used of 1 GB
              {library.usage.reservedBytes > 0
                ? ` · ${(library.usage.reservedBytes / 1_000_000).toFixed(1)} MB uploading`
                : ''}
              . PNG, JPEG or WebP; up to 10 MB each.
            </FieldDescription>
          )}
          {library && !library.uploadsAvailable && (
            <Alert>
              <AlertDescription>
                Image uploads are being configured.
              </AlertDescription>
            </Alert>
          )}
          {library?.nextCursor && (
            <Button
              type='button'
              variant='outline'
              disabled={Boolean(pending)}
              onClick={() => {
                setPending('more')
                void draftRequest<Library>(
                  `/api/assets?cursor=${library.nextCursor}`
                )
                  .then((data) =>
                    setLibrary((current) => ({
                      ...data,
                      assets: [...(current?.assets ?? []), ...data.assets]
                    }))
                  )
                  .catch((err: unknown) =>
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Images could not load.'
                    )
                  )
                  .finally(() => setPending(null))
              }}
            >
              Load more images
            </Button>
          )}
          {Boolean(library?.assets.length) && (
            <Field>
              <FieldLabel>Uploaded image library</FieldLabel>
              <FieldDescription>
                Removing an image frees library space. Existing saved designs
                keep their image; it will no longer be available for new
                selections.
              </FieldDescription>
              <div className='flex max-h-60 flex-col gap-2 overflow-auto'>
                {library?.assets.map((asset) => (
                  <div
                    className='flex items-center justify-between gap-3'
                    key={asset.id}
                  >
                    <span className='text-sm text-muted-foreground'>
                      {asset.purpose === 'reference'
                        ? 'Style reference'
                        : asset.purpose === 'logo'
                          ? 'Logo or avatar'
                          : 'Background'}{' '}
                      · {asset.width} × {asset.height}
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={Boolean(pending)}
                      aria-label={`Remove ${asset.purpose} ${asset.width} by ${asset.height} from library`}
                      onClick={() => {
                        setPending('remove')
                        setError('')
                        void draftRequest(
                          `/api/assets/${asset.id}`,
                          'DELETE',
                          {}
                        )
                          .then(() => setRevision((value) => value + 1))
                          .catch((err: unknown) =>
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'The image could not be removed.'
                            )
                          )
                          .finally(() => setPending(null))
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </Field>
          )}
          {error && (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {uploadRecovery && (
            <Button
              type='button'
              variant='outline'
              disabled={Boolean(pending) || disabled}
              onClick={() => {
                setPending(uploadRecovery.purpose)
                setError('')
                void finalize(uploadRecovery.id, uploadRecovery.purpose)
                  .catch((err: unknown) =>
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'The upload could not finish.'
                    )
                  )
                  .finally(() => setPending(null))
              }}
            >
              Check the last upload
            </Button>
          )}
        </FieldGroup>
      </div>
      {showPreview && (
        <div className='min-w-0'>
          <div className='sticky top-8 flex flex-col gap-4'>
            {resolved && !media.loading && !media.error ? (
              <div className='live-card'>
                <SocialCardPreview
                  key={JSON.stringify(recipe) + JSON.stringify(media.artwork)}
                  preview={sample}
                  provider='chatgpt'
                  appearance={{ templateId: recipe.baseStyle }}
                  resolvedDesign={resolved}
                  artwork={media.artwork}
                />
              </div>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {media.loading
                  ? 'Loading your images…'
                  : media.error ||
                    'Choose valid colors and images to preview your template.'}
              </p>
            )}
            {recipe.background.mode === 'generated' && (
              <p className='text-sm text-muted-foreground'>
                Your background will appear after generation. The text and logo
                stay crisp and consistent.
              </p>
            )}
            {media.error && (
              <Button type='button' variant='outline' onClick={media.retry}>
                Reload preview images
              </Button>
            )}
            {!parsed.success && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {parsed.error.issues[0]?.path.includes('assetId')
                    ? 'Choose an image for the selected background or branding.'
                    : parsed.error.issues[0]?.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

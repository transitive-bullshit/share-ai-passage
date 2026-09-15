import { randomUUID } from 'node:crypto'

import sharp from 'sharp'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest'

import {
  buildImagePrompt,
  generateBackgroundImage,
  getImageGenerationConfig,
  imageCostMicros,
  ImageGenerationError
} from '../lib/image-model'
import { defaultTemplateRecipe } from '../lib/paid-design'

const config = getImageGenerationConfig({
  IMAGE_GENERATION_ENABLED: '1',
  IMAGE_AI_MONTHLY_BUDGET_USD: '25'
})
const usage = {
  input_tokens: 883,
  input_tokens_details: { text_tokens: 339, image_tokens: 544 },
  output_tokens: 216,
  total_tokens: 1099
}
let output: Buffer
let reference: Buffer
beforeAll(async () => {
  const create = (width: number, height: number) =>
    sharp({
      create: { width, height, channels: 3, background: '#f8f4e9' }
    })
      .webp()
      .toBuffer()
  ;[output, reference] = await Promise.all([
    create(1200, 640),
    create(1024, 538)
  ])
})
beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'offline-fixture-only'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
function response(extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      created: 1,
      data: [{ b64_json: output.toString('base64') }],
      size: '1200x640',
      quality: 'medium',
      output_format: 'webp',
      usage,
      ...extra
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req_offline'
      }
    }
  )
}
const request = () => ({
  operationId: randomUUID(),
  prompt: 'Editorial background artwork.'
})

describe('image generation policy', () => {
  it('requires both explicit enablement and a bounded positive monthly budget', () => {
    expect(getImageGenerationConfig({}).enabled).toBe(false)
    expect(
      getImageGenerationConfig({ IMAGE_GENERATION_ENABLED: '1' }).enabled
    ).toBe(false)
    expect(
      getImageGenerationConfig({ IMAGE_AI_MONTHLY_BUDGET_USD: '25' }).enabled
    ).toBe(false)
    expect(
      getImageGenerationConfig({
        IMAGE_GENERATION_ENABLED: '1',
        IMAGE_AI_MONTHLY_BUDGET_USD: '0.000001'
      })
    ).toMatchObject({ enabled: true, monthlyBudgetMicros: 1 })
    for (const amount of ['0', '-1', '1e2', '0.0000001', '2147.483648'])
      expect(() =>
        getImageGenerationConfig({ IMAGE_AI_MONTHLY_BUDGET_USD: amount })
      ).toThrow()
    expect(
      getImageGenerationConfig({ IMAGE_AI_MONTHLY_BUDGET_USD: '2147.483647' })
        .monthlyBudgetMicros
    ).toBe(2_147_483_647)
  })

  it('never prices missing, inconsistent or overflowing usage as zero', () => {
    expect(imageCostMicros(usage)).toBe(12527)
    expect(
      imageCostMicros({
        ...usage,
        input_tokens_details: {
          ...usage.input_tokens_details,
          cached_tokens: 500
        }
      })
    ).toBe(12527)
    expect(imageCostMicros(null)).toBeNull()
    expect(imageCostMicros({ ...usage, total_tokens: 1098 })).toBeNull()
    expect(imageCostMicros({ ...usage, input_tokens: -1 })).toBeNull()
    expect(
      imageCostMicros({
        input_tokens: 0,
        input_tokens_details: { text_tokens: 0, image_tokens: 0 },
        output_tokens: Number.MAX_SAFE_INTEGER,
        total_tokens: Number.MAX_SAFE_INTEGER
      })
    ).toBeNull()
  })

  it('hashes the normalized recipe without exposing branding IDs in the prompt', () => {
    const recipe = {
      ...defaultTemplateRecipe(),
      branding: {
        mode: 'custom' as const,
        assetId: randomUUID(),
        name: 'Private account identity'
      },
      referenceAssetId: randomUUID()
    }
    const first = buildImagePrompt({
      preview: {
        title: 'Stop duplicate saves',
        highlights: ['Retries remain off.']
      },
      recipe
    })
    const reordered = {
      ...recipe,
      colors: {
        accent: recipe.colors.accent,
        surface: recipe.colors.surface,
        text: recipe.colors.text
      }
    }
    expect(
      buildImagePrompt({
        preview: {
          title: 'Stop duplicate saves',
          highlights: ['Retries remain off.']
        },
        recipe: reordered
      })
    ).toEqual(first)
    expect(first.prompt).toContain(
      'Do not copy or adapt its objects, characters, scenery, symbols, or composition.'
    )
    expect(first.prompt).not.toContain(recipe.referenceAssetId)
    expect(first.prompt).not.toContain(recipe.branding.name)
    expect(first.prompt).not.toContain(recipe.branding.assetId)
    expect(() =>
      buildImagePrompt({
        preview: { title: '🌱'.repeat(600), highlights: ['🦊'.repeat(900)] },
        recipe
      })
    ).toThrow(ImageGenerationError)
  })
})

describe('single-dispatch image adapter', () => {
  it('uses generations without a reference and persists identity before reading the body', async () => {
    const input = request()
    const resultResponse = response()
    const clone = resultResponse.clone.bind(resultResponse)
    let savedIdentity = false
    vi.spyOn(resultResponse, 'clone').mockImplementation(() => {
      expect(savedIdentity).toBe(true)
      return clone()
    })
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/images/generations')
      expect(JSON.parse(init?.body as string)).toMatchObject({
        model: config.model,
        n: 1,
        quality: 'medium',
        size: '1200x640',
        background: 'opaque',
        output_format: 'webp',
        output_compression: 85
      })
      expect(new Headers(init?.headers).get('x-client-request-id')).toBe(
        input.operationId
      )
      expect(init?.redirect).toBe('error')
      return resultResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    // Disabling new requests does not invalidate an already accepted snapshot.
    vi.stubEnv('IMAGE_GENERATION_ENABLED', '0')
    const result = await generateBackgroundImage(
      {
        ...input,
        onResponseIdentity: async (identity) => {
          expect(identity).toEqual({
            clientRequestId: input.operationId,
            providerRequestId: 'req_offline',
            httpStatus: 200
          })
          await Promise.resolve()
          savedIdentity = true
        }
      },
      config
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      clientRequestId: input.operationId,
      providerRequestId: 'req_offline',
      actualCostMicros: 12527,
      usage,
      width: 1200,
      height: 640,
      contentType: 'image/webp'
    })
    expect(result.bytes.equals(output)).toBe(true)
  })

  it('uses one multipart edit for one normalized reference', async () => {
    const fetchMock = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async (_url, init) => {
      expect(_url).toBe('https://api.openai.com/v1/images/edits')
      const body = init?.body as FormData
      expect(body.getAll('image')).toHaveLength(1)
      expect(body.get('n')).toBe('1')
      expect(body.get('size')).toBe('1200x640')
      expect(body.get('output_compression')).toBe('85')
      expect(body.has('input_fidelity')).toBe(false)
      return response({ usage: undefined })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await generateBackgroundImage(
      { ...request(), referenceBytes: reference },
      config
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.actualCostMicros).toBeNull()
    expect(result.usage).toBeNull()
  })

  it.each([400, 429, 500])(
    'never retries HTTP %i or leaks the provider error body',
    async (status) => {
      const fetchMock = vi.fn<() => Promise<Response>>(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                message: 'PRIVATE_PROMPT_AND_PROVIDER_SECRET',
                type: 'server_error'
              },
              usage
            }),
            {
              status,
              headers: {
                'content-type': 'application/json',
                'x-request-id': 'req_failed'
              }
            }
          )
      )
      vi.stubGlobal('fetch', fetchMock)
      const error = await generateBackgroundImage(request(), config).catch(
        (err: unknown) => err
      )
      expect(error).toBeInstanceOf(ImageGenerationError)
      expect(error).toMatchObject({
        outcome: status === 500 ? 'uncertain' : 'definite-failure',
        submitted: true,
        evidence: { providerRequestId: 'req_failed', actualCostMicros: 12527 }
      })
      expect(String(error) + JSON.stringify(error)).not.toContain(
        'PRIVATE_PROMPT_AND_PROVIDER_SECRET'
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )

  it('retains uncertainty when response identity cannot be saved or the connection breaks', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => response())
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      generateBackgroundImage(
        {
          ...request(),
          onResponseIdentity: async () => {
            throw new Error('PRIVATE_DATABASE_DETAIL')
          }
        },
        config
      )
    ).rejects.toMatchObject({
      outcome: 'uncertain',
      evidence: { actualCostMicros: null, providerRequestId: 'req_offline' }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValueOnce(new Error('PRIVATE_TRANSPORT_DETAIL'))
    await expect(
      generateBackgroundImage(request(), config)
    ).rejects.toMatchObject({
      outcome: 'uncertain',
      submitted: true,
      evidence: { actualCostMicros: null }
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refunds definitive empty or unusable output while preserving observed billed costs', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () =>
      response({ data: [] })
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      generateBackgroundImage(request(), config)
    ).rejects.toMatchObject({
      outcome: 'definite-failure',
      code: 'INVALID_OUTPUT',
      evidence: { actualCostMicros: 12527 }
    })
    fetchMock.mockResolvedValueOnce(
      response({ data: [{ b64_json: reference.toString('base64') }] })
    )
    await expect(
      generateBackgroundImage(request(), config)
    ).rejects.toMatchObject({
      outcome: 'definite-failure',
      code: 'INVALID_OUTPUT',
      evidence: { actualCostMicros: 12527 }
    })
  })

  it('rejects oversized UTF-8 inputs, non-normalized references and altered snapshots before dispatch', async () => {
    const fetchMock = vi.fn<() => void>()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      generateBackgroundImage(
        { ...request(), prompt: '🌱'.repeat(1025) },
        config
      )
    ).rejects.toMatchObject({
      submitted: false,
      evidence: { actualCostMicros: 0 }
    })
    await expect(
      generateBackgroundImage(
        { ...request(), referenceBytes: new Uint8Array(1_000_001) },
        config
      )
    ).rejects.toMatchObject({
      submitted: false,
      evidence: { actualCostMicros: 0 }
    })
    await expect(
      generateBackgroundImage({ ...request(), referenceBytes: output }, config)
    ).rejects.toMatchObject({
      submitted: false,
      evidence: { actualCostMicros: 0 }
    })
    await expect(
      generateBackgroundImage(request(), {
        ...config,
        maxRetries: 1
      } as unknown as typeof config)
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED', submitted: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

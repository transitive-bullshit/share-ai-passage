import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type ExtractedConversation } from '../lib/domain'
import { defaultPreviewModel, suggestPreview } from '../lib/suggestions'
import {
  generatedPreviewSchema,
  summaryInput,
  validateGeneratedPreview
} from '../lib/summary'
import fixture from './fixtures/summary.json'

const conversation = fixture.source as ExtractedConversation
const preview = fixture.preview
const sdk = vi.hoisted(() => ({
  createOpenAI: vi.fn<(options: unknown) => unknown>(),
  selectModel: vi.fn<(modelId: string) => unknown>()
}))

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: sdk.createOpenAI }))

function response(
  output: unknown
): Awaited<ReturnType<MockLanguageModelV4['doGenerate']>> {
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined
      },
      outputTokens: { total: 20, text: 20, reasoning: undefined }
    },
    warnings: []
  }
}

describe('generated preview validation', () => {
  it('normalizes Unicode and whitespace without accepting extra output fields', () => {
    expect(
      validateGeneratedPreview({
        title: '  Cafe\u0301\n reading group ',
        highlights: ['  Rotate\tbook picks.\n', ' Agree\u00A0on length. ']
      })
    ).toEqual({
      title: 'Café reading group',
      highlights: ['Rotate book picks.', 'Agree on length.']
    })
    expect(() =>
      validateGeneratedPreview({ ...preview, messageId: 'answer' })
    ).toThrow()
  })

  it('counts astral characters once and normalizes before enforcing lengths', () => {
    expect(
      validateGeneratedPreview({
        title: '🌱'.repeat(60),
        highlights: ['🦊'.repeat(100)]
      })
    ).toEqual({
      title: '🌱'.repeat(60),
      highlights: ['🦊'.repeat(100)]
    })
    expect(
      validateGeneratedPreview({
        title: ` ${'e\u0301'.repeat(60)} `,
        highlights: ['A\n'.repeat(50)]
      }).title
    ).toBe('é'.repeat(60))
    expect(() =>
      validateGeneratedPreview({ ...preview, title: '🌱'.repeat(61) })
    ).toThrow('60 characters')
    expect(() =>
      validateGeneratedPreview({ ...preview, highlights: ['🦊'.repeat(101)] })
    ).toThrow('100 characters')
  })

  it.each([
    null,
    [],
    {},
    { ...preview, title: '' },
    { ...preview, title: '\uD800' },
    { ...preview, title: 'bad\0title' },
    { ...preview, title: '\n\t ' },
    { ...preview, highlights: [] },
    { ...preview, highlights: ['a', 'b', 'c', 'd'] },
    { ...preview, highlights: [null] },
    { ...preview, highlights: ['\n '] },
    { ...preview, highlights: ['bad\uDFFFtext'] },
    { ...preview, highlights: ['bad\u0001text'] },
    { ...preview, highlights: ['Same point', ' same\npoint '] }
  ])('rejects malformed or unusable generated output %j', (input) => {
    expect(() => validateGeneratedPreview(input)).toThrow()
  })

  it('accepts one highlight for a short source and up to three distinct highlights', () => {
    expect(
      generatedPreviewSchema.safeParse({
        ...preview,
        highlights: ['One takeaway.']
      }).success
    ).toBe(true)
    expect(
      generatedPreviewSchema.safeParse({
        ...preview,
        highlights: ['One.', 'Two.', 'Three.']
      }).success
    ).toBe(true)
  })
})

describe('mandatory generated previews', () => {
  const generate = vi.fn<MockLanguageModelV4['doGenerate']>()

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('OPENAI_API_KEY', 'unit-test-placeholder')
    vi.stubEnv('AI_PROVIDER', '')
    vi.stubEnv('AI_MODEL', '')
    generate.mockReset().mockResolvedValue(response(preview))
    sdk.createOpenAI.mockReset().mockReturnValue(sdk.selectModel)
    sdk.selectModel
      .mockReset()
      .mockReturnValue(new MockLanguageModelV4({ doGenerate: generate }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('replays the saved response through the real AI SDK without network or real credentials', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    expect(await suggestPreview(conversation)).toEqual(preview)
    expect(sdk.createOpenAI).toHaveBeenCalledExactlyOnceWith({
      apiKey: 'unit-test-placeholder',
      baseURL: 'https://api.openai.com/v1'
    })
    expect(sdk.selectModel).toHaveBeenCalledExactlyOnceWith(defaultPreviewModel)
    expect(generate).toHaveBeenCalledTimes(1)
    const options = generate.mock.calls[0]![0]
    expect(options.maxOutputTokens).toBe(700)
    expect(options.reasoning).toBe('none')
    expect(options.providerOptions).toMatchObject({ openai: { store: false } })
    expect(options.tools ?? []).toEqual([])
    expect(options.prompt).toContainEqual({
      role: 'user',
      content: [{ type: 'text', text: summaryInput(conversation) }]
    })
    expect(timeout).toHaveBeenCalledWith(15_000)
    expect(console.error).not.toHaveBeenCalled()
  })

  it.each(['title', 'highlights'] as const)(
    'accepts %s at the character limit advertised to the model',
    async (field) => {
      generate.mockImplementationOnce(async ({ responseFormat }) => {
        expect(responseFormat?.type).toBe('json')
        const schema =
          responseFormat?.type === 'json' ? responseFormat.schema : undefined
        const properties = schema?.properties as {
          title: { maxLength: number }
          highlights: { items: { maxLength: number } }
        }
        const advertisedLimit =
          field === 'title'
            ? properties.title.maxLength
            : properties.highlights.items.maxLength
        // A structured-output provider can legitimately return any length
        // allowed by this schema, including the advertised maximum.
        return response({
          ...preview,
          [field]:
            field === 'title'
              ? 'x'.repeat(advertisedLimit)
              : ['x'.repeat(advertisedLimit)]
        })
      })
      await expect(suggestPreview(conversation)).resolves.toEqual({
        ...preview,
        [field]: field === 'title' ? 'x'.repeat(60) : ['x'.repeat(100)]
      })
      expect(generate).toHaveBeenCalledTimes(1)
    }
  )

  it('keeps the model configurable', async () => {
    vi.stubEnv('AI_MODEL', 'gpt-5.4-nano-2026-03-17')
    await suggestPreview(conversation)
    expect(sdk.selectModel).toHaveBeenCalledExactlyOnceWith(
      'gpt-5.4-nano-2026-03-17'
    )
  })

  it('reports missing credentials before constructing a provider', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    await expect(suggestPreview(conversation)).rejects.toMatchObject({
      message: expect.stringContaining('OPENAI_API_KEY'),
      status: 503,
      retryAfter: 30
    })
    expect(sdk.createOpenAI).not.toHaveBeenCalled()
  })

  it('rejects unsupported providers without sending source data elsewhere', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    await expect(suggestPreview(conversation)).rejects.toMatchObject({
      status: 503,
      retryAfter: 30
    })
    expect(sdk.createOpenAI).not.toHaveBeenCalled()
  })

  it.each([
    { ...preview, title: 'x'.repeat(61) },
    { ...preview, highlights: [] },
    { ...preview, highlights: ['Same', ' same '] },
    { ...preview, excerpt: 'Invented text' }
  ])(
    'rejects unusable model output without an excerpt fallback',
    async (output) => {
      generate.mockResolvedValueOnce(response(output))
      await expect(suggestPreview(conversation)).rejects.toMatchObject({
        status: 503,
        retryAfter: 30
      })
      expect(generate).toHaveBeenCalledTimes(1)
    }
  )

  it('does not retry model failures or expose provider error contents', async () => {
    generate.mockRejectedValueOnce(
      new Error('private request body and credential')
    )
    await expect(suggestPreview(conversation)).rejects.toMatchObject({
      message:
        'Could not generate the preview summary. Please try again in 30 seconds.',
      status: 503,
      retryAfter: 30
    })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledExactlyOnceWith({
      event: 'preview_generation_failed',
      category: 'unknown',
      elapsedMs: expect.any(Number)
    })
  })

  it('cancels a slow model request and returns the retryable summary error', async () => {
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    generate.mockImplementationOnce(
      ({ abortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal!.addEventListener(
            'abort',
            () => reject(abortSignal!.reason),
            { once: true }
          )
          entered.resolve()
        })
    )
    const pending = suggestPreview(conversation)
    await entered.promise
    controller.abort(new DOMException('Request timed out', 'TimeoutError'))
    await expect(pending).rejects.toMatchObject({ status: 503, retryAfter: 30 })
    expect(generate).toHaveBeenCalledTimes(1)
  })
})

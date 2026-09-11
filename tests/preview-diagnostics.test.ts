import {
  APICallError,
  type FinishReason,
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError
} from 'ai'
import { describe, expect, it } from 'vitest'

import { getPreviewFailureDiagnostic } from '../lib/preview-diagnostics'

const secret = 'PRIVATE_transcript_and_credentials'

function providerError(
  options: Partial<ConstructorParameters<typeof APICallError>[0]> = {}
) {
  return new APICallError({
    message: secret,
    url: `https://example.invalid/${secret}`,
    requestBodyValues: { input: secret },
    statusCode: 429,
    responseHeaders: {
      'x-request-id': 'req_test-123_ABC',
      authorization: secret,
      'set-cookie': secret
    },
    responseBody: secret,
    data: { secret },
    ...options
  })
}

function outputError(finishReason: FinishReason, cause?: Error) {
  return new NoObjectGeneratedError({
    message: secret,
    cause,
    text: secret,
    finishReason,
    response: {
      id: secret,
      modelId: secret,
      timestamp: new Date(0),
      headers: { 'x-request-id': 'req_output-123', authorization: secret },
      body: { secret }
    },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: {
        noCacheTokens: 1,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined
      },
      outputTokenDetails: { textTokens: 1, reasoningTokens: undefined },
      raw: { secret }
    }
  })
}

describe('preview failure diagnostics', () => {
  it('records only safe provider metadata, omitting messages, bodies, URLs and headers', () => {
    expect(getPreviewFailureDiagnostic(providerError(), 4100.4)).toEqual({
      event: 'preview_generation_failed',
      category: 'provider',
      elapsedMs: 4100,
      upstreamStatus: 429,
      requestId: 'req_test-123_ABC'
    })
  })

  it.each([
    secret,
    'req_abc\n',
    'req_abc\r',
    'req_abc\u2028',
    'req_abc\nPRIVATE',
    'req_https://example.invalid',
    `req_${'a'.repeat(125)}`,
    'req_',
    ''
  ])('omits unrecognized request IDs: %s', (requestId) => {
    expect(
      getPreviewFailureDiagnostic(
        providerError({ responseHeaders: { 'x-request-id': requestId } }),
        1
      )
    ).toEqual({
      event: 'preview_generation_failed',
      category: 'provider',
      elapsedMs: 1,
      upstreamStatus: 429
    })
  })

  it('reads case-insensitive request ID headers without copying other headers', () => {
    expect(
      getPreviewFailureDiagnostic(
        providerError({
          responseHeaders: { 'X-Request-ID': 'req_case-123', secret }
        }),
        1
      ).requestId
    ).toBe('req_case-123')
  })

  it.each([0, 99, 600, 429.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'omits invalid HTTP status metadata: %s',
    (statusCode) => {
      expect(
        getPreviewFailureDiagnostic(providerError({ statusCode }), 1)
      ).not.toHaveProperty('upstreamStatus')
    }
  )

  it.each([
    new JSONParseError({ text: secret, cause: new Error(secret) }),
    new TypeValidationError({ value: { secret }, cause: new Error(secret) })
  ])(
    'classifies SDK parsing and schema failures without exposing output',
    (error) => {
      expect(
        getPreviewFailureDiagnostic(outputError('stop', error), 15)
      ).toEqual({
        event: 'preview_generation_failed',
        category: 'invalid_output',
        elapsedMs: 15,
        requestId: 'req_output-123',
        finishReason: 'stop'
      })
      expect(getPreviewFailureDiagnostic(error, 15)).toEqual({
        event: 'preview_generation_failed',
        category: 'invalid_output',
        elapsedMs: 15
      })
    }
  )

  it.each([
    ['length', 'incomplete'],
    ['content-filter', 'refusal']
  ] as const)('distinguishes output stopped by %s', (reason, category) => {
    const error = outputError(
      reason,
      new JSONParseError({ text: secret, cause: new Error(secret) })
    )
    expect(getPreviewFailureDiagnostic(error, 20)).toEqual({
      event: 'preview_generation_failed',
      category,
      elapsedMs: 20,
      requestId: 'req_output-123',
      finishReason: reason
    })
  })

  it.each(['TimeoutError', 'AbortError'])(
    'recognizes %s without logging its message',
    (name) => {
      const error = new DOMException(secret, name)
      expect(getPreviewFailureDiagnostic(error, 15_000)).toEqual({
        event: 'preview_generation_failed',
        category: 'timeout',
        elapsedMs: 15_000
      })
      expect(
        getPreviewFailureDiagnostic(
          providerError({ cause: error, statusCode: undefined }),
          15_000
        )
      ).toEqual({
        event: 'preview_generation_failed',
        category: 'timeout',
        elapsedMs: 15_000,
        requestId: 'req_test-123_ABC'
      })
    }
  )

  it('does not copy unknown error names, messages, properties or unrecognized finish reasons', () => {
    const unknown = Object.assign(new Error(secret), {
      name: secret,
      statusCode: 429,
      responseHeaders: { 'x-request-id': 'req_untrusted' }
    })
    expect(getPreviewFailureDiagnostic(unknown, 1)).toEqual({
      event: 'preview_generation_failed',
      category: 'unknown',
      elapsedMs: 1
    })
    const error = outputError('stop')
    Object.defineProperty(error, 'finishReason', { value: secret })
    expect(getPreviewFailureDiagnostic(error, 1)).toEqual({
      event: 'preview_generation_failed',
      category: 'invalid_output',
      elapsedMs: 1,
      requestId: 'req_output-123'
    })
  })

  it('handles cause cycles and invalid durations without throwing', () => {
    const error = new Error(secret)
    error.cause = error
    for (const elapsedMs of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getPreviewFailureDiagnostic(error, elapsedMs)).toEqual({
        event: 'preview_generation_failed',
        category: 'unknown',
        elapsedMs: 0
      })
    }
  })
})

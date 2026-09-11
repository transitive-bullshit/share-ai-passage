import {
  APICallError,
  type FinishReason,
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError
} from 'ai'

type PreviewFailureCategory =
  | 'timeout'
  | 'provider'
  | 'invalid_output'
  | 'incomplete'
  | 'refusal'
  | 'unknown'

interface PreviewFailureDiagnostic {
  event: 'preview_generation_failed'
  category: PreviewFailureCategory
  elapsedMs: number
  upstreamStatus?: number
  requestId?: string
  finishReason?: FinishReason
}

const finishReasons = new Set<FinishReason>([
  'stop',
  'length',
  'content-filter',
  'tool-calls',
  'error',
  'other'
])

function requestId(headers: Record<string, string> | undefined) {
  const value = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'x-request-id'
  )?.[1]
  return typeof value === 'string' && /^req_[A-Za-z0-9_-]{1,124}$/.test(value)
    ? value
    : undefined
}

/** Build an allowlisted record; errors and response content must never be logged. */
export function getPreviewFailureDiagnostic(
  error: unknown,
  elapsedMs: number
): PreviewFailureDiagnostic {
  let provider: APICallError | undefined
  let output: NoObjectGeneratedError | undefined
  let invalidOutput = false
  let timeout = false
  let current = error
  const seen = new Set<unknown>()

  // Structured-output errors wrap parser/schema errors; SDK calls can wrap aborts.
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++) {
    seen.add(current)
    if (APICallError.isInstance(current)) provider ??= current
    if (NoObjectGeneratedError.isInstance(current)) output ??= current
    if (
      JSONParseError.isInstance(current) ||
      TypeValidationError.isInstance(current)
    ) {
      invalidOutput = true
    }
    if (
      current instanceof Error &&
      (current.name === 'TimeoutError' || current.name === 'AbortError')
    ) {
      timeout = true
    }
    current = current instanceof Error ? current.cause : undefined
  }

  const finishReason =
    output?.finishReason && finishReasons.has(output.finishReason)
      ? output.finishReason
      : undefined
  const diagnostic: PreviewFailureDiagnostic = {
    event: 'preview_generation_failed',
    category: timeout
      ? 'timeout'
      : finishReason === 'content-filter'
        ? 'refusal'
        : finishReason === 'length'
          ? 'incomplete'
          : provider
            ? 'provider'
            : output || invalidOutput
              ? 'invalid_output'
              : 'unknown',
    elapsedMs: Number.isFinite(elapsedMs)
      ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(elapsedMs)))
      : 0
  }

  const status = provider?.statusCode
  if (status && Number.isInteger(status) && status >= 100 && status <= 599) {
    diagnostic.upstreamStatus = status
  }
  const id =
    requestId(provider?.responseHeaders) ?? requestId(output?.response?.headers)
  if (id) diagnostic.requestId = id
  if (finishReason) diagnostic.finishReason = finishReason
  return diagnostic
}

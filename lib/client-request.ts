const connectionError =
  'We couldn’t connect. Check your connection and try again.'
const responseError =
  'The server could not finish the request. Please try again.'

export class ClientRequestError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAt?: number
  ) {
    super(message)
    this.name = 'ClientRequestError'
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  const retryAt = /^\d+$/.test(trimmed)
    ? now + Number(trimmed) * 1000
    : /^[A-Za-z]{3}, /.test(trimmed)
      ? Date.parse(trimmed)
      : NaN
  return Number.isFinite(retryAt) && retryAt > now ? retryAt : undefined
}

export function clientErrorMessage(error: unknown) {
  return error instanceof ClientRequestError ? error.message : connectionError
}

async function postResponse(path: string, body: unknown) {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    throw new ClientRequestError(connectionError)
  }

  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null)
    const message =
      result &&
      typeof result === 'object' &&
      'error' in result &&
      typeof result.error === 'string' &&
      result.error.trim()
        ? result.error
        : responseError
    throw new ClientRequestError(
      message,
      response.status,
      parseRetryAfter(response.headers.get('Retry-After'))
    )
  }
  return response
}

export async function postJson<T>(path: string, body: unknown) {
  const response = await postResponse(path, body)
  try {
    return (await response.json()) as T
  } catch {
    throw new ClientRequestError(responseError, response.status)
  }
}

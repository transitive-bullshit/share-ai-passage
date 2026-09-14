const defaultReturnTo = '/passages'

export function safeReturnTo(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || value.length > 2048) return defaultReturnTo
  let decoded = value
  try {
    for (let index = 0; index < 3; index++) {
      if (
        !decoded.startsWith('/') ||
        decoded.startsWith('//') ||
        decoded.includes('\\') ||
        Array.from(decoded).some((character) => character.charCodeAt(0) <= 32)
      )
        return defaultReturnTo
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    const url = new URL(decoded, 'https://passage.invalid')
    if (
      url.origin !== 'https://passage.invalid' ||
      /^\/(?:api|_next|sign-in|sign-up|forgot-password|reset-password|verify-email)(?:\/|$)/.test(
        url.pathname
      )
    )
      return defaultReturnTo
    return value
  } catch {
    return defaultReturnTo
  }
}

export function authHref(
  path: string,
  returnTo: string,
  extra: Record<string, string> = {}
): string {
  const query = new URLSearchParams({
    returnTo: safeReturnTo(returnTo),
    ...extra
  })
  return `${path}?${query}`
}

export function firstQueryValue(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === 'string' ? value : undefined
}

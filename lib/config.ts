export function appUrl() {
  const devUrl =
    process.env.NODE_ENV === 'development'
      ? process.env.PORTLESS_URL
      : undefined
  const value = devUrl || process.env.APP_URL || 'http://localhost:3000'
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('APP_URL must be an HTTP(S) origin, without a path')
  }
  return url.origin
}

export function appSecret() {
  const secret = process.env.APP_SECRET
  if (secret && secret.length >= 32) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Set APP_SECRET to a random secret of at least 32 characters'
    )
  }
  return 'local-development-only-change-this-secret-before-hosting'
}

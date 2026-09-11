/** Use the platform's public URL; a proxy's listening PORT may be different. */
export function appUrl() {
  const development = process.env.NODE_ENV === 'development'
  let value = development ? process.env.PORTLESS_URL?.trim() : undefined

  if (!development && process.env.VERCEL === '1') {
    const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV
    const hostname =
      environment === 'production'
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
        : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
    if (!hostname) {
      throw new Error(
        'Vercel deployment URL is unavailable. Enable system environment variables.'
      )
    }
    value = `https://${hostname}`
  }

  const url = new URL(value || `http://localhost:${process.env.PORT || 3000}`)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'The platform application URL must be an HTTP(S) origin, without a path'
    )
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

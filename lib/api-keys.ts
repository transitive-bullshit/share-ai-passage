import { apiKey } from '@better-auth/api-key'

export const cliKeyConfig = 'passage-cli'
export const cliPermissions = {
  passage: ['create', 'drafts', 'jobs', 'usage', 'defaults']
}

export function createApiKeyPlugin() {
  return apiKey({
    configId: cliKeyConfig,
    defaultPrefix: 'passage_',
    requireName: true,
    maximumNameLength: 64,
    enableSessionForAPIKeys: false,
    startingCharactersConfig: { shouldStore: true, charactersLength: 12 },
    rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
    permissions: { defaultPermissions: cliPermissions }
  })
}

/** Exact routes keep an API key from acquiring browser account privileges. */
export function apiKeyPermission(request: Request): string | null {
  const path = new URL(request.url).pathname
  const method = request.method
  if (
    method === 'POST' &&
    [
      '/api/prepare',
      '/api/publish',
      '/api/check',
      '/api/card',
      '/api/drafts'
    ].includes(path)
  )
    return 'create'
  if (method === 'GET' && path === '/api/account/usage') return 'usage'
  if (
    method === 'GET' &&
    ['/api/account/preferences', '/api/templates/default'].includes(path)
  )
    return 'defaults'
  const id =
    '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  if (
    ['GET', 'PATCH'].includes(method) &&
    new RegExp(`^/api/drafts/${id}$`).test(path)
  )
    return 'drafts'
  if (
    method === 'GET' &&
    new RegExp(`^/api/drafts/${id}/operations$`).test(path)
  )
    return 'drafts'
  if (
    method === 'POST' &&
    new RegExp(`^/api/drafts/${id}/(resume|regenerate|publish|apply)$`).test(
      path
    )
  )
    return 'drafts'
  if (method === 'POST' && new RegExp(`^/api/drafts/${id}/image$`).test(path))
    return 'jobs'
  if (method === 'GET' && new RegExp(`^/api/image-jobs/${id}$`).test(path))
    return 'jobs'
  if (
    method === 'POST' &&
    new RegExp(`^/api/image-jobs/${id}/apply$`).test(path)
  )
    return 'jobs'
  return null
}

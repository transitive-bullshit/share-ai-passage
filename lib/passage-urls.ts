import type { Provider } from './domain'

const publicationPath =
  /^\/(chatgpt|claude|gemini)\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/?$/i

/** Passage links are database references, never upstream fetch targets. */
export function parsePassageUrl(input: string, origin: string) {
  if (input.length > 2048) return null
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const production =
    url.protocol === 'https:' &&
    !url.port &&
    ['www.share-ai-passage.com', 'share-ai-passage.com'].includes(url.hostname)
  if (!production && url.origin !== origin) return null
  const match = publicationPath.exec(url.pathname)
  if (!match) return null
  return {
    provider: match[1]!.toLowerCase() as Provider,
    publicationId: match[2]!.toLowerCase()
  }
}

import type { SourceReference } from '../domain'

const sharePath =
  /^\/share\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/?$/i
const chatgptPostPath = /^\/s\/((?:cx_|t_)[a-f\d]{32})\/?$/i

function isCodexDownloadUrl(url: URL) {
  return (
    url.protocol === 'https:' &&
    url.hostname.endsWith('.oaiusercontent.com') &&
    !url.username &&
    !url.password &&
    !url.port
  )
}

export function parseSourceUrl(input: string): SourceReference {
  if (input.length > 2048) throw new Error('That source URL is too long.')
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Paste a complete public ChatGPT, Claude, or Passage URL.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error(
      'Use a public HTTPS share URL without credentials or a custom port.'
    )
  }
  const provider =
    url.hostname === 'chatgpt.com'
      ? 'chatgpt'
      : url.hostname === 'claude.ai'
        ? 'claude'
        : undefined
  if (!provider)
    throw new Error('Use a public ChatGPT, Claude, or Passage share link.')
  // Copied links may include tracking parameters or a fragment. They are not
  // part of source identity and are never forwarded to the provider endpoint.
  const postMatch = provider === 'chatgpt' && chatgptPostPath.exec(url.pathname)
  if (postMatch) {
    const shareId = postMatch[1]!.toLowerCase()
    return {
      provider,
      shareId,
      canonicalUrl: `https://chatgpt.com/s/${shareId}`
    }
  }
  const match = sharePath.exec(url.pathname)
  if (!match)
    throw new Error(
      'Use a public /share/ conversation URL or a ChatGPT /s/t_ or /s/cx_ share link.'
    )
  const shareId = match[1]!.toLowerCase()
  return {
    provider,
    shareId,
    canonicalUrl: `https://${url.hostname}/share/${shareId}`
  }
}

export function upstreamUrl(source: SourceReference): URL {
  // Revalidate persisted inputs too: never turn this boundary into a general fetch proxy.
  const checked = parseSourceUrl(source.canonicalUrl)
  if (
    checked.provider !== source.provider ||
    checked.shareId !== source.shareId
  ) {
    throw new Error('The provider and source URL do not agree.')
  }
  if (source.provider === 'chatgpt' && source.shareId.startsWith('t_'))
    return new URL(checked.canonicalUrl)
  return new URL(
    source.provider === 'chatgpt'
      ? source.shareId.startsWith('cx_')
        ? `https://chatgpt.com/backend-api/wham/shared_threads/${source.shareId}`
        : `https://chatgpt.com/backend-api/share/${source.shareId}`
      : `https://claude.ai/api/chat_snapshots/${source.shareId}?rendering_mode=messages&render_all_tools=true`
  )
}

export function isAllowedRedirect(
  destination: URL,
  source: SourceReference,
  current = upstreamUrl(source)
): boolean {
  const upstream = upstreamUrl(source)
  if (current.href === upstream.href && destination.href === upstream.href)
    return true

  // Retain the provider-domain boundary without guessing CDN paths or signed
  // query formats. The fetcher still caps redirects and validates/pins every IP.
  // Signed URLs stay in memory and cannot be submitted as source URLs.
  return (
    source.provider === 'chatgpt' &&
    source.shareId.startsWith('cx_') &&
    (current.href === upstream.href || isCodexDownloadUrl(current)) &&
    isCodexDownloadUrl(destination)
  )
}

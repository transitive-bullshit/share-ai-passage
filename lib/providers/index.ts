import type { ProviderResult, SourceReference } from '../domain'
import { parseChatgptPost } from './chatgpt-post'
import { parseChatgpt } from './chatgpt'
import { parseClaude } from './claude'
import { parseCodex } from './codex'
import { fetchPublicJson, type UpstreamResponse } from './safe-fetch'

export { parseSourceUrl } from './urls'

export function classifyResponse(
  source: SourceReference,
  response: UpstreamResponse
): ProviderResult {
  if (
    response.challenged ||
    (response.body.trimStart().startsWith('<') &&
      /<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(
        response.body
      ))
  ) {
    return {
      status: 'inconclusive',
      reason: 'The provider returned a browser security check. Try again later.'
    }
  }
  if (response.status === 429 || response.status >= 500) {
    return {
      status: 'inconclusive',
      reason: 'The provider is temporarily busy. Try again later.'
    }
  }
  if (response.redirected && response.status !== 200) {
    return {
      status: 'inconclusive',
      reason: 'The provider download could not be read. Try again later.'
    }
  }
  if (source.provider === 'chatgpt' && source.shareId.startsWith('t_'))
    return parseChatgptPost(response.body, response.status, source.shareId)
  // Download servers may label JSON as text/plain or application/octet-stream.
  // Parse the body and validate the conversation instead of trusting its MIME label.
  let payload: unknown
  try {
    payload = JSON.parse(response.body)
  } catch {
    return {
      status: 'inconclusive',
      reason: 'The provider returned malformed public conversation data.'
    }
  }
  return source.provider === 'chatgpt'
    ? source.shareId.startsWith('cx_')
      ? parseCodex(payload, response.status)
      : parseChatgpt(payload, response.status)
    : parseClaude(payload, response.status)
}

export async function fetchSource(
  source: SourceReference
): Promise<ProviderResult> {
  try {
    return classifyResponse(source, await fetchPublicJson(source))
  } catch (err) {
    const reason =
      err instanceof Error &&
      /^(This conversation|The public share|The provider|ChatGPT returned|Claude returned|Codex returned)/.test(
        err.message
      )
        ? err.message
        : 'The provider could not be reached within the request budget. Try again later.'
    return { status: 'inconclusive', reason }
  }
}

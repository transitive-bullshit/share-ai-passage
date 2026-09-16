import type { LinkPreviewMetadata } from './types'

type PreviewMetadataOverrides = Partial<
  Pick<
    LinkPreviewMetadata,
    'title' | 'description' | 'siteName' | 'image' | 'favicon'
  >
>

type PlatformPreviewOverride = (
  url: URL
) => PreviewMetadataOverrides | undefined

const youtubeVideoId = /^[a-z0-9_-]{11}$/i
const youtubeVideoPath = /^\/(?:embed|live|shorts|v)\/([a-z0-9_-]{11})(?:\/|$)/i

export function isYoutubeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'youtu.be' ||
    host === 'www.youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  )
}

function youtubeId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  const candidate =
    host === 'youtu.be' || host === 'www.youtu.be'
      ? url.pathname.split('/')[1]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : youtubeVideoPath.exec(url.pathname)?.[1]
  return candidate && youtubeVideoId.test(candidate) ? candidate : undefined
}

function youtubePreviewOverride(
  url: URL
): PreviewMetadataOverrides | undefined {
  if (!isYoutubeHost(url.hostname)) return
  const id = youtubeId(url)
  return id
    ? { image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
    : undefined
}

const platformPreviewOverrides: PlatformPreviewOverride[] = [
  youtubePreviewOverride
]

/** Apply trusted metadata corrections for known platform URL formats. */
export function resolvePlatformPreviewOverrides(url: URL) {
  for (const override of platformPreviewOverrides) {
    const metadata = override(url)
    if (metadata) return metadata
  }
  return {}
}

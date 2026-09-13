// eslint-disable-next-line no-control-regex -- Reject URL controls before URL parsing can discard them.
const controls = /[\u0000-\u001f\u007f-\u009f]/
const numericContentKeys = new Set(['id', 'p', 'page', 'paged'])
const localeKeys = new Set(['lang', 'hl'])
const youtubeTimeKeys = new Set(['t', 'start', 'end', 'index'])
const trackingKeys = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'twclid',
  'ttclid',
  'srsltid',
  'gbraid',
  'wbraid',
  '_ga',
  '_gl'
])

/** Basic public destination guards; image and header URLs keep their query. */
export function publicPreviewUrl(
  value: unknown,
  base?: string
): URL | undefined {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 4096 ||
    controls.test(value) ||
    (base !== undefined && controls.test(base))
  )
    return
  try {
    const url = new URL(value, base)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    // IPv6 literals are deliberately excluded, including mapped IPv4 forms.
    if (
      hostname.includes(':') ||
      !hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|test|invalid|example|onion)$/.test(
        hostname
      )
    )
      return
    if (/^\d+(?:\.\d+){3}$/.test(hostname)) {
      const [a, b, c] = hostname.split('.').map(Number)
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a! >= 224 ||
        (a === 100 && b! >= 64 && b! <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b! >= 16 && b! <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)
      )
        return
    }
    url.hash = ''
    return url
  } catch {
    return
  }
}

function youtubeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  )
}

function removable(key: string, youtube: boolean) {
  // Case folding must not turn a non-ASCII content key into a known tracker.
  if (!/^[a-z0-9_]+$/i.test(key)) return false
  const name = key.toLowerCase()
  return (
    trackingKeys.has(name) ||
    /^utm_[a-z0-9_]{1,64}$/.test(name) ||
    (youtube && (name === 'si' || name === 'feature'))
  )
}

function retainedValue(key: string, value: string, youtube: boolean) {
  if (!value || value.length > 256) return false
  if (numericContentKeys.has(key)) return /^\d{1,12}$/.test(value)
  if (localeKeys.has(key))
    return /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(value)
  if (!youtube) return false
  if (key === 'v') return /^[a-z0-9_-]{11}$/i.test(value)
  if (key === 'list') return /^[a-z0-9_-]{1,128}$/i.test(value)
  if (youtubeTimeKeys.has(key)) {
    return (
      /^\d{1,12}$/.test(value) ||
      /^(?:\d{1,4}h)?(?:\d{1,4}m)?(?:\d{1,4}s)?$/.test(value)
    )
  }
  return false
}

/** Remove known tracking only; unknown or ambiguous content queries need fallback. */
export function previewPageUrl(value: unknown, base?: string): URL | undefined {
  const url = publicPreviewUrl(value, base)
  if (!url) return
  const youtube = youtubeHost(url.hostname)
  const retained = new URLSearchParams()
  let count = 0
  for (const [key, entry] of url.searchParams) {
    if (
      ++count > 32 ||
      key.length > 128 ||
      controls.test(key) ||
      controls.test(entry)
    )
      return
    if (removable(key, youtube)) continue
    if (retained.has(key) || !retainedValue(key, entry, youtube)) return
    retained.append(key, entry)
  }
  // Equivalent tracking links share one fetch/cache identity without changing IDs.
  retained.sort()
  url.search = retained.toString()
  return url
}

// Adapted from Repaint's inert metadata parser.
import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { publicPreviewUrl } from './urls'

function boundedText(value: string | undefined, length: number) {
  const text = value
    // eslint-disable-next-line no-control-regex -- Strip untrusted metadata control characters before rendering.
    ?.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, length) : undefined
}

interface ParsedMetadata {
  title?: string
  description?: string
  siteName?: string
  images: { url: string; alt?: string; width?: number; height?: number }[]
  favicons: string[]
}

function dimension(value: string | undefined) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 8192
    ? parsed
    : undefined
}

/** parse5 never creates DOM nodes, loads subresources, or executes page code. */
function previewHead(html: string, scriptingEnabled = true) {
  const document = parse(html, { scriptingEnabled })
  return document.childNodes
    .find(
      (node): node is DefaultTreeAdapterMap['element'] =>
        'tagName' in node && node.tagName === 'html'
    )
    ?.childNodes.find(
      (node): node is DefaultTreeAdapterMap['element'] =>
        'tagName' in node && node.tagName === 'head'
    )
}

/** Read only a single immediate declarative redirect, including t.co's noscript fallback. */
export function previewRefresh(html: string, pageUrl: string) {
  // Disabling scripting parses noscript markup as inert nodes. Script contents
  // remain text and are never interpreted as redirect instructions.
  const head = previewHead(html, false)
  const elements = (head?.childNodes ?? [])
    .flatMap((node) =>
      'tagName' in node && node.tagName === 'noscript'
        ? node.childNodes
        : [node]
    )
    .filter(
      (node): node is DefaultTreeAdapterMap['element'] => 'tagName' in node
    )
  const refreshes = elements.filter(
    (node) =>
      node.tagName === 'meta' &&
      node.attrs
        .find((attribute) => attribute.name === 'http-equiv')
        ?.value.trim()
        .toLowerCase() === 'refresh'
  )
  if (refreshes.length !== 1) return
  const content = refreshes[0]!.attrs.find(
    (attribute) => attribute.name === 'content'
  )?.value
  const match =
    /^\s*0\s*;\s*url\s*=\s*(?:"([^"]+)"|'([^']+)'|([^'" ][\s\S]*?))\s*$/i.exec(
      content ?? ''
    )
  const url = match?.[1] ?? match?.[2] ?? match?.[3]
  if (!url) return
  const base = elements
    .find(
      (node) =>
        node.tagName === 'base' &&
        node.attrs.some((attribute) => attribute.name === 'href')
    )
    ?.attrs.find((attribute) => attribute.name === 'href')?.value
  return {
    url,
    base:
      base === undefined
        ? pageUrl
        : (publicPreviewUrl(base, pageUrl)?.href ?? '')
  }
}

export function extractLinkPreviewMetadata(
  html: string,
  pageUrl: string
): ParsedMetadata {
  const head = previewHead(html)
  const values = new Map<string, string>()
  const images: ParsedMetadata['images'] = []
  const twitterImages: ParsedMetadata['images'] = []
  const icons: string[] = []
  const touchIcons: string[] = []
  let currentImage: ParsedMetadata['images'][number] | undefined
  let title: string | undefined
  let base = pageUrl
  for (const node of head?.childNodes ?? []) {
    if (!('tagName' in node)) continue
    const attributes = new Map(
      node.attrs.map(({ name, value }) => [name, value])
    )
    if (node.tagName === 'base') {
      base = publicPreviewUrl(attributes.get('href'), pageUrl)?.href ?? base
    } else if (node.tagName === 'link') {
      const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? []
      const href = attributes.get('href')
      if (
        href &&
        attributes.get('type')?.trim().toLowerCase() !== 'image/svg+xml'
      ) {
        if (rel.includes('icon') && icons.length < 4) icons.push(href)
        else if (
          rel.some((token) =>
            ['apple-touch-icon', 'apple-touch-icon-precomposed'].includes(token)
          ) &&
          touchIcons.length < 2
        )
          touchIcons.push(href)
      }
    } else if (node.tagName === 'title') {
      title ??= node.childNodes
        .filter(
          (child): child is DefaultTreeAdapterMap['textNode'] =>
            child.nodeName === '#text'
        )
        .map((child) => child.value)
        .join('')
    } else if (node.tagName === 'meta') {
      const key = (
        attributes.get('property') ?? attributes.get('name')
      )?.toLowerCase()
      const value = attributes.get('content')?.trim()
      if (!key || !value) continue
      if (!values.has(key)) values.set(key, value)
      if (key === 'og:image' || key === 'og:image:url') {
        currentImage = { url: value }
        if (images.length < 4) images.push(currentImage)
      } else if (key === 'og:image:secure_url' && currentImage) {
        const secure = publicPreviewUrl(value, base)
        if (secure?.protocol === 'https:') currentImage.url = secure.href
      } else if (key === 'og:image:alt' && currentImage) {
        currentImage.alt = boundedText(value, 300)
      } else if (key === 'og:image:width' && currentImage) {
        currentImage.width = dimension(value)
      } else if (key === 'og:image:height' && currentImage) {
        currentImage.height = dimension(value)
      } else if (key === 'twitter:image' || key === 'twitter:image:src') {
        if (twitterImages.length < 2) twitterImages.push({ url: value })
      }
    }
  }
  const seen = new Set<string>()
  const candidates = [...images, ...twitterImages].flatMap((image) => {
    const url = publicPreviewUrl(image.url, base)
    if (!url || seen.has(url.href)) return []
    seen.add(url.href)
    return [{ ...image, url: url.href }]
  })
  const favicons = [
    ...new Set(
      [...icons, ...touchIcons].flatMap((href) => {
        const url = publicPreviewUrl(href, base)
        return url && !url.pathname.toLowerCase().endsWith('.svg')
          ? [url.href]
          : []
      })
    )
  ]
  return {
    title: boundedText(
      values.get('og:title') ?? values.get('twitter:title') ?? title,
      300
    ),
    description: boundedText(
      values.get('og:description') ??
        values.get('twitter:description') ??
        values.get('description'),
      600
    ),
    siteName: boundedText(values.get('og:site_name'), 100),
    images: candidates,
    favicons
  }
}

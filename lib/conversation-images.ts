import { createHash } from 'node:crypto'

import sharp from 'sharp'

import type {
  ExtractedConversation,
  SavedImage,
  SourceReference
} from './domain'
import { AppError } from './errors'
import { markdownImages } from './messages'
import { fetchPublicResource } from './providers/safe-fetch'
import { upstreamUrl, isAllowedRedirect } from './providers/urls'
import { putImmutableAsset, readAssetBytes } from './r2'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const maxImages = 20
const maxTotalBytes = 50 * 1024 * 1024
const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex')

export function imageSourceUrl(reference: string, source: SourceReference) {
  const asset = /^codex:shared-asset\/([A-Za-z0-9][A-Za-z0-9_.-]{0,127})$/.exec(
    reference
  )
  if (asset) {
    if (source.provider !== 'chatgpt' || !source.shareId.startsWith('cx_'))
      throw new Error('Unsupported image reference')
    return new URL(
      `${upstreamUrl(source).href}/assets/${encodeURIComponent(asset[1]!)}`
    )
  }
  const url = new URL(reference)
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Unsupported image URL')
  return url
}

export async function downloadSourceImage(
  reference: string,
  source: SourceReference,
  signal: AbortSignal
) {
  const initial = imageSourceUrl(reference, source)
  const sharedAsset = reference.startsWith('codex:shared-asset/')
  const response = await fetchPublicResource(
    initial,
    (next) => {
      if (sharedAsset)
        return isAllowedRedirect(next, source, upstreamUrl(source))
      try {
        return imageSourceUrl(next.href, source).href === next.href
      } catch {
        return false
      }
    },
    {
      limit: MAX_IMAGE_BYTES,
      signal,
      accept: 'image/png,image/jpeg,image/webp,image/gif'
    }
  )
  if (response.status !== 200 || response.challenged)
    throw new Error('The public image could not be read')
  return response.body
}

/** Decode and re-encode inert raster data. Never persist provider URLs or SVG. */
export async function normalizeConversationImage(bytes: Uint8Array) {
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES)
    throw new Error('Unsupported image size')
  const image = sharp(bytes, {
    animated: true,
    limitInputPixels: 40_000_000,
    failOn: 'warning'
  })
  const metadata = await image.metadata()
  if (
    !['png', 'jpeg', 'webp', 'gif'].includes(metadata.format ?? '') ||
    !metadata.width ||
    !metadata.height ||
    (metadata.pages ?? 1) !== 1
  )
    throw new Error('Unsupported image format')
  const result = await image
    .rotate()
    .webp({ lossless: true })
    .toBuffer({ resolveWithObject: true })
  if (result.data.byteLength > MAX_IMAGE_BYTES)
    throw new Error('Unsupported image size')
  return {
    bytes: result.data,
    width: result.info.width,
    height: result.info.height,
    sha256: sha256(result.data)
  }
}

/** Called only for content preparation, never for availability checks. */
export async function captureConversationImages(
  conversation: ExtractedConversation,
  source: SourceReference
) {
  const captured = structuredClone(conversation)
  delete captured.imageSources
  const imageSources = conversation.imageSources ?? []
  const markdown = captured.messages.flatMap((message) =>
    message.content.flatMap((block, contentIndex) =>
      block.type === 'input_text' || block.type === 'output_text'
        ? markdownImages(block.text).map((image) => ({
            ...image,
            messageId: message.id,
            contentIndex
          }))
        : []
    )
  )
  const references = [
    ...new Set([...imageSources, ...markdown].map((image) => image.url))
  ]
  if (references.length > maxImages)
    throw new AppError(
      'This conversation exceeds the supported 20-image limit.',
      422
    )
  if (!references.length) return captured
  const signal = AbortSignal.timeout(20_000)
  let totalBytes = 0
  const images = new Map<string, SavedImage | null>()
  for (const reference of references) {
    let image: Awaited<ReturnType<typeof normalizeConversationImage>>
    try {
      const bytes = await downloadSourceImage(reference, source, signal)
      totalBytes += bytes.byteLength
      if (totalBytes > maxTotalBytes)
        throw new AppError(
          'This conversation exceeds the supported 50 MiB image limit.',
          422
        )
      image = await normalizeConversationImage(bytes)
    } catch (err) {
      if (err instanceof AppError) throw err
      if (signal.aborted)
        throw new AppError('Image import took too long. Please try again.', 503)
      images.set(reference, null)
      continue
    }
    const objectKey = `assets/conversations/${sha256(source.canonicalUrl)}/${image.sha256}.webp`
    // Storage failure is retryable: never report a successful import while losing a readable image.
    await putImmutableAsset({
      visibility: 'private',
      key: objectKey,
      bytes: image.bytes,
      contentType: 'image/webp'
    })
    images.set(reference, {
      objectKey,
      sha256: image.sha256,
      width: image.width,
      height: image.height
    })
  }
  for (const candidate of imageSources) {
    const message = captured.messages.find(
      (message) => message.id === candidate.messageId
    )
    const image = images.get(candidate.url)
    if (message && image)
      message.content[candidate.contentIndex] = { type: 'image', ...image }
  }
  for (const message of captured.messages) {
    message.content.forEach((block, contentIndex) => {
      if (block.type !== 'input_text' && block.type !== 'output_text') return
      const replacements = markdown.filter(
        (image) =>
          image.messageId === message.id && image.contentIndex === contentIndex
      )
      // Work backwards so offsets still address the original Markdown.
      for (const candidate of replacements.toReversed()) {
        const image = images.get(candidate.url)
        const alt = candidate.alt.replaceAll(/([\\[\]])/g, '\\$1')
        block.text = `${block.text.slice(0, candidate.start)}![${alt}](passage-image:${image?.sha256 ?? 'unavailable'})${block.text.slice(candidate.end)}`
        if (
          image &&
          !message.images?.some((saved) => saved.sha256 === image.sha256)
        )
          (message.images ??= []).unshift(image)
      }
    })
  }
  return captured
}

export async function readConversationImage(image: SavedImage) {
  if (
    !/^[a-f0-9]{64}$/.test(image.sha256) ||
    !new RegExp(
      `^assets/conversations/[a-f0-9]{64}/${image.sha256}\\.webp$`
    ).test(image.objectKey)
  )
    throw new Error('Invalid saved image')
  const bytes = await readAssetBytes(
    'private',
    image.objectKey,
    MAX_IMAGE_BYTES
  )
  if (sha256(bytes) !== image.sha256)
    throw new Error('Invalid saved image content')
  return bytes
}

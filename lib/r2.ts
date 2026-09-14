import { createHash } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { AppError } from './errors'

export type AssetVisibility = 'private' | 'public'
export function r2Configured() {
  return [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_BUCKET',
    'R2_PRIVATE_BUCKET',
    'R2_PUBLIC_URL'
  ].every((name) => Boolean(process.env[name]?.trim()))
}
export function validateR2Endpoint(value: string, accountId: string) {
  const url = new URL(value)
  const owned = [
    `${accountId}.r2.cloudflarestorage.com`,
    `${accountId}.eu.r2.cloudflarestorage.com`,
    `${accountId}.fedramp.r2.cloudflarestorage.com`
  ].includes(url.hostname)
  const fixture =
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (!fixture && (!owned || url.protocol !== 'https:' || url.port)) ||
    (fixture && !['http:', 'https:'].includes(url.protocol))
  ) {
    throw new AppError('Asset storage is not configured correctly.', 503)
  }
  return url.origin
}
function storage() {
  if (!r2Configured())
    throw new AppError('Image uploads are not configured yet.', 503)
  const accountId = process.env.R2_ACCOUNT_ID!.trim()
  const endpoint = validateR2Endpoint(
    process.env.R2_ENDPOINT?.trim() ||
      `https://${accountId}.r2.cloudflarestorage.com`,
    accountId
  )
  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim()
    },
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  })
}
function bucket(visibility: AssetVisibility) {
  return process.env[
    visibility === 'private' ? 'R2_PRIVATE_BUCKET' : 'R2_PUBLIC_BUCKET'
  ]!.trim()
}
function validateKey(key: string) {
  if (
    !/^(uploads|assets|generated|cards)\/[a-zA-Z0-9/_-]+\.(webp|upload)$/.test(
      key
    ) ||
    key.includes('..')
  )
    throw new Error('Invalid internal asset key')
  return key
}
export function assetSha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}
export async function presignUpload(
  key: string,
  contentType: string,
  bytes: number,
  expiresIn = 300
) {
  const client = storage()
  const headers = { 'Content-Type': contentType, 'If-None-Match': '*' }
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket('private'),
      Key: validateKey(key),
      ContentType: contentType,
      ContentLength: bytes,
      IfNoneMatch: '*'
    }),
    {
      expiresIn,
      signableHeaders: new Set([
        'content-type',
        'content-length',
        'if-none-match'
      ])
    }
  )
  return { uploadUrl, headers }
}
export async function headAsset(visibility: AssetVisibility, key: string) {
  const client = storage()
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: bucket(visibility),
        Key: validateKey(key)
      })
    )
    return {
      byteSize: result.ContentLength ?? 0,
      contentType: result.ContentType ?? '',
      etag: result.ETag,
      sha256: result.Metadata?.sha256
    }
  } catch (err) {
    if (
      (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    )
      return null
    throw err
  }
}
export async function readAssetBytes(
  visibility: AssetVisibility,
  key: string,
  maxBytes: number,
  etag?: string
) {
  const client = storage()
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket(visibility),
      Key: validateKey(key),
      IfMatch: etag
    })
  )
  if (!response.Body) throw new AppError('The image could not be read.', 502)
  const reader = response.Body.transformToWebStream().getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    if ((response.ContentLength ?? 0) > maxBytes)
      throw new AppError('This image is too large.', 413)
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw new AppError('This image is too large.', 413)
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
export async function putImmutableAsset(input: {
  visibility: AssetVisibility
  key: string
  bytes: Uint8Array
  contentType: 'image/webp'
}) {
  const client = storage()
  const sha256 = assetSha256(input.bytes)
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket(input.visibility),
        Key: validateKey(input.key),
        Body: input.bytes,
        ContentLength: input.bytes.byteLength,
        ContentType: input.contentType,
        CacheControl:
          input.visibility === 'public'
            ? 'public, max-age=31536000, immutable'
            : 'private, no-store',
        Metadata: { sha256 },
        IfNoneMatch: '*'
      })
    )
  } catch (err) {
    // A lost PUT response is safe to recover by immutable identity, never overwrite.
    const existing = await headAsset(input.visibility, input.key).catch(
      () => null
    )
    if (
      existing?.sha256 !== sha256 ||
      existing.byteSize !== input.bytes.byteLength
    )
      throw err
  }
  return { sha256, byteSize: input.bytes.byteLength }
}
export async function signPrivateAssetRead(key: string, expiresIn = 120) {
  const client = storage()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket('private'), Key: validateKey(key) }),
    { expiresIn }
  )
}
export async function deletePrivateObject(key: string) {
  const client = storage()
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket('private'),
      Key: validateKey(key)
    })
  )
}
export function publicAssetUrl(key: string) {
  validateKey(key)
  const url = new URL(process.env.R2_PUBLIC_URL || '')
  const fixture =
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (!fixture && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new AppError('Asset delivery is not configured correctly.', 503)
  return `${url.href.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

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
function configuredValue(name: string, alias?: string) {
  return (
    process.env[name]?.trim() || (alias ? process.env[alias]?.trim() : '') || ''
  )
}
function storageError() {
  return new AppError('Asset storage is not configured correctly.', 503)
}
export function validateR2Endpoint(value: string, accountId: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw storageError()
  }
  const owned = [
    `${accountId}.r2.cloudflarestorage.com`,
    `${accountId}.us.r2.cloudflarestorage.com`,
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
  )
    throw storageError()
  return url.origin
}
function storageConfig() {
  const suppliedEndpoint = configuredValue('R2_ENDPOINT', 'S3_API_ENDPOINT')
  let accountId = configuredValue('R2_ACCOUNT_ID')
  if (!accountId && suppliedEndpoint) {
    let hostname: string
    try {
      hostname = new URL(suppliedEndpoint).hostname
    } catch {
      throw storageError()
    }
    const match =
      /^([a-f0-9]{32})\.(?:(?:us|eu|fedramp)\.)?r2\.cloudflarestorage\.com$/.exec(
        hostname
      )
    if (!match) throw storageError()
    accountId = match[1]!
  }
  const accessKeyId = configuredValue('R2_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID')
  const secretAccessKey = configuredValue(
    'R2_SECRET_ACCESS_KEY',
    'S3_SECRET_ACCESS_KEY'
  )
  const publicBucket = configuredValue('R2_PUBLIC_BUCKET', 'S3_BUCKET_NAME')
  // Private inputs must never fall back to the public delivery bucket.
  const privateBucket = configuredValue(
    'R2_PRIVATE_BUCKET',
    'S3_PRIVATE_BUCKET_NAME'
  )
  const publicUrl = configuredValue('R2_PUBLIC_URL', 'S3_PUBLIC_URL')
  if (
    ![
      accountId,
      accessKeyId,
      secretAccessKey,
      publicBucket,
      privateBucket,
      publicUrl
    ].every(Boolean)
  )
    throw new AppError('Image uploads are not configured yet.', 503)
  if (publicBucket === privateBucket) throw storageError()
  const endpoint = validateR2Endpoint(
    suppliedEndpoint || `https://${accountId}.r2.cloudflarestorage.com`,
    accountId
  )
  return { endpoint, accessKeyId, secretAccessKey, publicBucket, privateBucket }
}
export function r2Configured() {
  try {
    storageConfig()
    return true
  } catch {
    return false
  }
}
function storage() {
  const config = storageConfig()
  return new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  })
}
function bucket(visibility: AssetVisibility) {
  const config = storageConfig()
  return visibility === 'private' ? config.privateBucket : config.publicBucket
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
  const url = new URL(configuredValue('R2_PUBLIC_URL', 'S3_PUBLIC_URL'))
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

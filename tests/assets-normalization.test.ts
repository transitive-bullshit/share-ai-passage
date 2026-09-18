import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { normalizeUploadedImage } from '@/lib/assets'
import { presignUpload, validateR2Endpoint } from '@/lib/r2'

afterEach(() => vi.unstubAllEnvs())
it('preserves transparent logos while removing metadata', async () => {
  const original = await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 220, g: 30, b: 20, alpha: 0.25 }
    }
  })
    .png()
    .withMetadata({ density: 144 })
    .toBuffer()
  const normalized = await normalizeUploadedImage(original, 'logo', 'image/png')
  const metadata = await sharp(normalized.bytes).metadata()
  expect(metadata).toMatchObject({
    format: 'webp',
    width: 80,
    height: 40,
    hasAlpha: true
  })
  expect(metadata.exif).toBeUndefined()
  const { data } = await sharp(normalized.bytes)
    .raw()
    .toBuffer({ resolveWithObject: true })
  expect(data[3]).toBeLessThan(100)
})

it('rejects invalid signatures, mismatched declared type and excessive bytes', async () => {
  await expect(
    normalizeUploadedImage(Buffer.from('<svg onload="alert(1)"></svg>'), 'logo')
  ).rejects.toThrow('static PNG')
  await expect(
    normalizeUploadedImage(new Uint8Array(10_000_001), 'background')
  ).rejects.toMatchObject({ status: 413 })
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#fff' }
  })
    .png()
    .toBuffer()
  await expect(
    normalizeUploadedImage(image, 'background', 'image/jpeg')
  ).rejects.toThrow('file type')
})
it('rejects animated WebP rather than silently accepting one frame', async () => {
  const animated = await sharp({
    create: { width: 4, height: 8, channels: 4, background: '#ff0000' }
  })
    .raw()
    .toBuffer()
  for (let offset = 4 * 4 * 4; offset < animated.length; offset += 4) {
    animated[offset] = 0
    animated[offset + 2] = 255
  }
  const bytes = await sharp(animated, {
    raw: { width: 4, height: 8, channels: 4, pageHeight: 4 }
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer()
  expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2)
  await expect(normalizeUploadedImage(bytes, 'logo')).rejects.toThrow(
    'Animated images'
  )
})
it('restricts storage endpoints to the configured R2 account or a non-production loopback fixture', () => {
  expect(
    validateR2Endpoint('https://abc.r2.cloudflarestorage.com', 'abc')
  ).toBe('https://abc.r2.cloudflarestorage.com')
  expect(() =>
    validateR2Endpoint('https://other.r2.cloudflarestorage.com', 'abc')
  ).toThrow()
  expect(() =>
    validateR2Endpoint(
      'https://abc.r2.cloudflarestorage.com.attacker.test',
      'abc'
    )
  ).toThrow()
  vi.stubEnv('NODE_ENV', 'production')
  expect(() => validateR2Endpoint('http://127.0.0.1:8000', 'abc')).toThrow()
})
it('binds upload authorization to the exact size, type and create-only header', async () => {
  for (const [key, value] of Object.entries({
    R2_ACCOUNT_ID: 'abc',
    R2_ACCESS_KEY_ID: 'fixture',
    R2_SECRET_ACCESS_KEY: 'fixture-secret',
    R2_PUBLIC_BUCKET: 'public',
    R2_PRIVATE_BUCKET: 'private',
    R2_PUBLIC_URL: 'https://assets.example.test'
  }))
    vi.stubEnv(key, value)
  const result = await presignUpload(
    'uploads/fixture.upload',
    'image/png',
    1024
  )
  expect(result.headers).toEqual({
    'Content-Type': 'image/png',
    'If-None-Match': '*'
  })
  expect(
    new URL(result.uploadUrl).searchParams.get('X-Amz-SignedHeaders')
  ).toContain('content-length')
  expect(
    new URL(result.uploadUrl).searchParams.get('X-Amz-SignedHeaders')
  ).toContain('if-none-match')
})

import { afterEach, expect, it, vi } from 'vitest'

import { presignUpload, publicAssetUrl, r2Configured } from '@/lib/r2'

const accountId = '1234567890abcdef1234567890abcdef'
const aliases = {
  S3_ACCESS_KEY_ID: 'fixture-access',
  S3_SECRET_ACCESS_KEY: 'fixture-secret',
  S3_API_ENDPOINT: `https://${accountId}.us.r2.cloudflarestorage.com`,
  S3_BUCKET_NAME: 'fixture-public',
  S3_PRIVATE_BUCKET_NAME: 'fixture-private',
  S3_PUBLIC_URL: 'https://fixture-public.r2.dev'
}

function configure(values: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...aliases, ...values }))
    vi.stubEnv(key, value)
}

afterEach(() => vi.unstubAllEnvs())

it('uses S3 aliases and the owned US endpoint for private upload signing and public delivery', async () => {
  configure()
  expect(r2Configured()).toBe(true)
  const upload = await presignUpload('uploads/fixture.upload', 'image/png', 20)
  const signed = new URL(upload.uploadUrl)
  expect(signed.hostname).toBe(
    `fixture-private.${accountId}.us.r2.cloudflarestorage.com`
  )
  expect(signed.pathname).toBe('/uploads/fixture.upload')
  expect(signed.searchParams.get('X-Amz-Credential')).toMatch(
    /^fixture-access\//
  )
  expect(publicAssetUrl('cards/fixture.webp')).toBe(
    'https://fixture-public.r2.dev/cards/fixture.webp'
  )
})

it.each(['', 'us.', 'eu.', 'fedramp.'])(
  'infers the account only from a supported %sR2 endpoint',
  (jurisdiction) => {
    configure({
      S3_API_ENDPOINT: `https://${accountId}.${jurisdiction}r2.cloudflarestorage.com`
    })
    expect(r2Configured()).toBe(true)
  }
)

it('gives nonempty canonical R2 settings precedence over S3 aliases', async () => {
  configure({
    R2_ACCOUNT_ID: accountId,
    R2_ENDPOINT: `https://${accountId}.eu.r2.cloudflarestorage.com`,
    R2_ACCESS_KEY_ID: 'canonical-access',
    R2_SECRET_ACCESS_KEY: 'canonical-secret',
    R2_PUBLIC_BUCKET: 'canonical-public',
    R2_PRIVATE_BUCKET: 'canonical-private',
    R2_PUBLIC_URL: 'https://canonical.example.test',
    S3_API_ENDPOINT: 'https://untrusted.example.test',
    S3_PRIVATE_BUCKET_NAME: 'fixture-public'
  })
  expect(r2Configured()).toBe(true)
  const signed = new URL(
    (await presignUpload('uploads/fixture.upload', 'image/png', 20)).uploadUrl
  )
  expect(signed.hostname).toBe(
    `canonical-private.${accountId}.eu.r2.cloudflarestorage.com`
  )
  expect(signed.searchParams.get('X-Amz-Credential')).toMatch(
    /^canonical-access\//
  )
  expect(publicAssetUrl('cards/fixture.webp')).toBe(
    'https://canonical.example.test/cards/fixture.webp'
  )
})

it('accepts an explicit canonical private bucket alongside S3 aliases', async () => {
  configure({
    S3_PRIVATE_BUCKET_NAME: '',
    R2_PRIVATE_BUCKET: 'explicit-private'
  })
  expect(r2Configured()).toBe(true)
  const signed = new URL(
    (await presignUpload('uploads/fixture.upload', 'image/png', 20)).uploadUrl
  )
  expect(signed.hostname).toBe(
    `explicit-private.${accountId}.us.r2.cloudflarestorage.com`
  )
})

it.each(['', 'fixture-public'])(
  'refuses a missing or public-equivalent private bucket (%s)',
  async (privateBucket) => {
    configure({ S3_PRIVATE_BUCKET_NAME: privateBucket })
    expect(r2Configured()).toBe(false)
    await expect(
      presignUpload('uploads/fixture.upload', 'image/png', 20)
    ).rejects.toMatchObject({ status: 503 })
  }
)

it.each([
  'https://arbitrary.example.test',
  `https://${accountId}.us.r2.cloudflarestorage.com.attacker.test`,
  'https://abc.us.r2.cloudflarestorage.com',
  `https://${accountId}.other.r2.cloudflarestorage.com`,
  `http://${accountId}.us.r2.cloudflarestorage.com`,
  `https://${accountId}.us.r2.cloudflarestorage.com/private`,
  `https://${accountId}.us.r2.cloudflarestorage.com?bucket=private`,
  `https://user:password@${accountId}.us.r2.cloudflarestorage.com`,
  'http://127.0.0.1:8000',
  'not-a-url'
])('rejects unsafe or non-inferable API endpoints: %s', async (endpoint) => {
  configure({ S3_API_ENDPOINT: endpoint })
  expect(r2Configured()).toBe(false)
  await expect(
    presignUpload('uploads/fixture.upload', 'image/png', 20)
  ).rejects.toMatchObject({ status: 503 })
})

it('rejects a supplied endpoint for a different explicit R2 account', async () => {
  configure({ R2_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890' })
  expect(r2Configured()).toBe(false)
  await expect(
    presignUpload('uploads/fixture.upload', 'image/png', 20)
  ).rejects.toMatchObject({ status: 503 })
})

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { appSecret } from './config'
import { AppError } from './errors'
import type { GeneratedPreview } from './domain'

const draftSchema = z.object({
  snapshotId: z.uuid(),
  publicationId: z.uuid().optional(),
  generation: z.number().int().nonnegative(),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive()
})

export function previewHash(preview: GeneratedPreview) {
  return createHash('sha256').update(JSON.stringify(preview)).digest('hex')
}

export function createDraftToken(
  snapshotId: string,
  generation: number,
  preview: GeneratedPreview,
  now = Date.now(),
  publicationId?: string
) {
  const payload = Buffer.from(
    JSON.stringify({
      snapshotId,
      publicationId,
      generation,
      previewHash: previewHash(preview),
      expiresAt: now + 24 * 60 * 60 * 1000
    })
  ).toString('base64url')
  const signature = createHmac('sha256', appSecret())
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

export function readDraftToken(token: string, now = Date.now()) {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra || token.length > 1024) {
    throw new AppError(
      'This preview has expired. Please prepare the source again.',
      410
    )
  }
  const expected = createHmac('sha256', appSecret()).update(payload).digest()
  const received = Buffer.from(signature, 'base64url')
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    throw new AppError(
      'This preview is invalid. Please prepare the source again.',
      403
    )
  }
  try {
    const draft = draftSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString())
    )
    if (draft.expiresAt <= now) throw new Error('Expired')
    return draft
  } catch {
    throw new AppError(
      'This preview has expired. Please prepare the source again.',
      410
    )
  }
}

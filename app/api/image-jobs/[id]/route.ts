import { start } from 'workflow/api'
import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { AppError } from '@/lib/errors'
import {
  ensureImageEnqueued,
  presentImageJob,
  readOwnedImageJob
} from '@/lib/image-jobs'
import { recoverImageResult } from '@/lib/image-worker'
import { generatePassageBackground } from '@/workflows/generate-background'

export const runtime = 'nodejs'
export const maxDuration = 30
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) => {
    const { id } = await context.params
    if (!z.uuid().safeParse(id).success)
      throw new AppError('Image generation not found.', 404)
    const { operation } = await readOwnedImageJob(actor, id)
    await ensureImageEnqueued(id, (id) =>
      start(generatePassageBackground, [id])
    )
    if (
      operation.status === 'uncertain' ||
      (operation.status === 'running' &&
        operation.deadlineAt &&
        operation.deadlineAt <= new Date())
    ) {
      await recoverImageResult(id).catch(() => {})
    }
    return presentImageJob(actor, id)
  })
}

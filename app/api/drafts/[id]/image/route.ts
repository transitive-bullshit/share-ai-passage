import { start } from 'workflow/api'
import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import {
  ensureImageEnqueued,
  presentImageJob,
  requestImageJob
} from '@/lib/image-jobs'
import { generatePassageBackground } from '@/workflows/generate-background'

export const runtime = 'nodejs'
export const maxDuration = 30
export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return accountRequest(request, async (actor) => {
    const { id } = await context.params
    const parsed = z
      .strictObject({
        revision: z.number().int().nonnegative(),
        requestKey: z.uuid()
      })
      .safeParse(await readJson(request))
    if (!z.uuid().safeParse(id).success || !parsed.success)
      throw new AppError('Save the draft before requesting an image.')
    const operation = await requestImageJob(
      actor,
      id,
      parsed.data.revision,
      parsed.data.requestKey
    )
    await ensureImageEnqueued(operation.id, (id) =>
      start(generatePassageBackground, [id])
    )
    return presentImageJob(actor, operation.id)
  })
}

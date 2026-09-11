import { z } from 'zod'

import { AppError } from '@/lib/errors'
import {
  clientKey,
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin
} from '@/lib/http'
import { checkAvailability, enforceBudget, getPublication } from '@/lib/service'

export const maxDuration = 60

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await enforceBudget(`check:${clientKey(request)}`, 5)
    const parsed = z
      .object({
        provider: z.enum(['chatgpt', 'claude']),
        publicationId: z.uuid()
      })
      .safeParse(await readJson(request))
    if (!parsed.success) throw new AppError('This publication is invalid.')
    const record = await getPublication(
      parsed.data.provider,
      parsed.data.publicationId
    )
    if (!record) throw new AppError('This publication was not found.', 404)
    const result = record.disabled
      ? {
          status: 'unavailable',
          message:
            'This publication is disabled. It will not be restored automatically.'
        }
      : await checkAvailability(record.source.id, 'manual')
    return Response.json(result, { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

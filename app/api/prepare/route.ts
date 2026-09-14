import { after } from 'next/server'
import { z } from 'zod'

import {
  clientKey,
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin
} from '@/lib/http'
import { AppError } from '@/lib/errors'
import {
  cleanupPreparations,
  enforceBudget,
  prepareSource
} from '@/lib/service'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    await enforceBudget(`prepare:${clientKey(request)}`, 10)
    const parsed = z
      .object({ url: z.string().min(1).max(2048) })
      .safeParse(await readJson(request))
    if (!parsed.success)
      throw new AppError('Paste a public ChatGPT, Claude, or Passage URL.')
    const result = await prepareSource(parsed.data.url)
    after(async () => {
      try {
        await cleanupPreparations()
      } catch {
        console.error('Preparation cleanup failed')
      }
    })
    return Response.json(result, { headers: privateHeaders })
  } catch (err) {
    return errorResponse(err)
  }
}

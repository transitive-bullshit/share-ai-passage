import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { getAccountPreferences, setAccountPreferences } from '@/lib/accounts'
import { cardAppearanceSchema } from '@/lib/card-appearance-schema'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'

export function GET(request: Request) {
  return accountRequest(request, (actor) => getAccountPreferences(actor.userId))
}

export function PUT(request: Request) {
  return accountRequest(request, async (actor) => {
    const parsed = z
      .strictObject({
        appearance: cardAppearanceSchema,
        initializeOnly: z.boolean().optional()
      })
      .safeParse(await readJson(request))
    if (!parsed.success) throw new AppError('Choose a supported card style.')
    return setAccountPreferences(
      actor.userId,
      parsed.data.appearance,
      parsed.data.initializeOnly
    )
  })
}

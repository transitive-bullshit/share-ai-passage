import { z } from 'zod'
import { accountRequest } from '@/lib/account-http'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import { setDefaultTemplate } from '@/lib/templates'
export function PUT(request: Request) {
  return accountRequest(request, async (actor) => {
    const parsed = z
      .strictObject({ templateId: z.uuid().nullable() })
      .safeParse(await readJson(request))
    if (!parsed.success) throw new AppError('Choose a saved template.')
    return setDefaultTemplate(actor.userId, parsed.data.templateId)
  })
}

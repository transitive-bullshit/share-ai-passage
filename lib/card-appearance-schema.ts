import { z } from 'zod'

import { socialTemplateIds } from './social-templates'

export const cardAppearanceSchema = z.strictObject({
  templateId: z.enum(socialTemplateIds)
})

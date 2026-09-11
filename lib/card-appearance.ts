import {
  DEFAULT_SOCIAL_TEMPLATE_ID,
  socialTemplateIds,
  type SocialTemplateId
} from './social-templates'

export type CardAppearance = {
  /** Curated design used to render the social card. */
  templateId: SocialTemplateId
}

export const DEFAULT_CARD_APPEARANCE: CardAppearance = {
  templateId: DEFAULT_SOCIAL_TEMPLATE_ID
}

/** Read only the version's allowlisted settings; never carry chat data into preferences. */
export function parseCardAppearance(value: unknown): CardAppearance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== 1 ||
    typeof record.templateId !== 'string' ||
    !socialTemplateIds.some((id) => id === record.templateId)
  ) {
    return null
  }
  return { templateId: record.templateId as SocialTemplateId }
}

/** Invalid or outdated browser settings fall back to the app's initial design. */
export function normalizeCardAppearance(value: unknown): CardAppearance {
  return parseCardAppearance(value) ?? { ...DEFAULT_CARD_APPEARANCE }
}

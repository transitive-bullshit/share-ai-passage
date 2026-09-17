import { z } from 'zod'

import type { CardAppearance } from './card-appearance'
import {
  getSocialTemplate,
  socialTemplateIds,
  type SocialTemplate,
  type SocialTemplateId
} from './social-templates'

export const fontPairingIds = [
  'newsreader-inter',
  'dm-sans-inter',
  'dm-sans'
] as const
export type FontPairing = (typeof fontPairingIds)[number]
const color = z
  .string()
  .regex(/^#[\da-f]{6}$/i, 'Use a six-digit hex color.')
  .transform((value) => value.toLowerCase())
const cropSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
})
const brandingSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('passage') }),
  z.strictObject({ mode: z.literal('none') }),
  z.strictObject({
    mode: z.literal('custom'),
    assetId: z.uuid(),
    name: z.string().trim().max(60).optional()
  })
])

function rgb(value: string) {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(value.slice(offset, offset + 2), 16)
  )
}
function luminance(value: string) {
  const [r, g, b] = rgb(value).map((part) => {
    const s = part / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722
}
export function contrastRatio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}
export const templateRecipeSchema = z
  .strictObject({
    version: z.literal(1),
    baseStyle: z.enum(socialTemplateIds),
    colors: z.strictObject({ surface: color, text: color, accent: color }),
    fontPairing: z.enum(fontPairingIds),
    branding: brandingSchema,
    background: z.discriminatedUnion('mode', [
      z.strictObject({ mode: z.literal('curated') }),
      z.strictObject({ mode: z.literal('uploaded'), assetId: z.uuid() })
    ]),
    crop: cropSchema
  })
  .refine(
    (recipe) => contrastRatio(recipe.colors.surface, recipe.colors.text) >= 4.5,
    {
      message: 'Choose text and surface colors with stronger contrast.',
      path: ['colors', 'text']
    }
  )
export type TemplateRecipe = z.infer<typeof templateRecipeSchema>
export const draftDesignSchema = z.strictObject({
  version: z.literal(1),
  recipe: templateRecipeSchema,
  fromTemplate: z
    .strictObject({ id: z.uuid(), revision: z.number().int().nonnegative() })
    .nullable()
})
export type DraftDesign = z.infer<typeof draftDesignSchema>

const fontSchema = z.strictObject({
  family: z.enum(['Inter', 'DM Sans', 'Newsreader']),
  weight: z.union([z.literal(400), z.literal(500), z.literal(700)]),
  file: z
    .string()
    .regex(/^(inter|dm-sans|newsreader)-latin-(400|500|700)-normal\.woff$/)
})
const templateSchema = z.strictObject({
  id: z.enum(socialTemplateIds),
  name: z.string(),
  description: z.string(),
  version: z.literal(1),
  backgroundImage: z
    .string()
    .regex(/^\/social-templates\/[a-z-]+\/background\.jpg$/),
  font: z.strictObject({ title: fontSchema, body: fontSchema }),
  layout: z.strictObject({
    copy: z.strictObject({
      left: z.number(),
      top: z.number(),
      width: z.number(),
      maxHeight: z.number()
    }),
    titleSize: z.number(),
    titleLineHeight: z.number(),
    titleLetterSpacing: z.number(),
    highlightSize: z.number(),
    highlightLineHeight: z.number(),
    gap: z.number(),
    highlightGap: z.number(),
    headerTop: z.number(),
    footerTop: z.number(),
    footerWidth: z.number(),
    footerSize: z.number(),
    scrim: z.string(),
    marker: z.enum(['dash', 'square', 'number', 'star', 'circle'])
  }),
  colors: z.strictObject({
    background: color,
    text: color,
    muted: color,
    accent: color,
    rule: color
  })
})
export const resolvedCardDesignSchema = z.strictObject({
  version: z.literal(1),
  rendererVersion: z.literal(5),
  template: templateSchema,
  branding: brandingSchema,
  background: z.discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('curated'),
      path: z.string().regex(/^\/social-templates\/[a-z-]+\/background\.jpg$/)
    }),
    z.strictObject({ kind: z.literal('asset'), assetId: z.uuid() })
  ]),
  crop: cropSchema,
  assetVersions: z
    .array(
      z.strictObject({
        id: z.uuid(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
      })
    )
    .max(2)
})
export type ResolvedCardDesign = z.infer<typeof resolvedCardDesignSchema>

export function defaultTemplateRecipe(
  baseStyle: SocialTemplateId = 'margin-notes'
): TemplateRecipe {
  const template = getSocialTemplate(baseStyle)
  return {
    version: 1,
    baseStyle,
    colors: {
      surface: template.colors.background,
      text: template.colors.text,
      accent: template.colors.accent
    },
    fontPairing:
      template.font.title.family === 'Newsreader'
        ? 'newsreader-inter'
        : template.font.body.family === 'Inter'
          ? 'dm-sans-inter'
          : 'dm-sans',
    branding: { mode: 'passage' },
    background: { mode: 'curated' },
    crop: { x: 0.5, y: 0.5 }
  }
}
function mix(a: string, b: string, amount: number) {
  const aa = rgb(a),
    bb = rgb(b)
  return `#${aa
    .map((v, i) =>
      Math.round(v * (1 - amount) + bb[i]! * amount)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}
const fontPairings = {
  'newsreader-inter': {
    title: {
      family: 'Newsreader',
      weight: 400,
      file: 'newsreader-latin-400-normal.woff'
    },
    body: { family: 'Inter', weight: 400, file: 'inter-latin-400-normal.woff' }
  },
  'dm-sans-inter': {
    title: {
      family: 'DM Sans',
      weight: 700,
      file: 'dm-sans-latin-700-normal.woff'
    },
    body: { family: 'Inter', weight: 400, file: 'inter-latin-400-normal.woff' }
  },
  'dm-sans': {
    title: {
      family: 'DM Sans',
      weight: 500,
      file: 'dm-sans-latin-500-normal.woff'
    },
    body: {
      family: 'DM Sans',
      weight: 400,
      file: 'dm-sans-latin-400-normal.woff'
    }
  }
} satisfies Record<FontPairing, SocialTemplate['font']>

/** Browser-safe, deterministic projection. No storage URLs or private reference inputs. */
export function resolveCardDesign(
  appearance: CardAppearance,
  design?: DraftDesign | null
): ResolvedCardDesign | null {
  if (!design) return null
  const recipe = templateRecipeSchema.parse(design.recipe)
  const template = structuredClone(
    getSocialTemplate(recipe.baseStyle ?? appearance.templateId)
  )
  const original = defaultTemplateRecipe(recipe.baseStyle)
  template.font = structuredClone(fontPairings[recipe.fontPairing])
  // Preserve each curated style's original typography and overlay when unmodified.
  if (recipe.fontPairing === original.fontPairing)
    template.font = structuredClone(getSocialTemplate(recipe.baseStyle).font)
  if (
    JSON.stringify(recipe.colors) !== JSON.stringify(original.colors) ||
    recipe.background.mode !== 'curated'
  ) {
    const { surface, text, accent } = recipe.colors
    const parts = rgb(surface).join(',')
    template.colors = {
      background: surface,
      text,
      accent,
      muted: mix(text, surface, 0.12),
      rule: mix(surface, text, 0.22)
    }
    template.layout.scrim = `linear-gradient(90deg, ${surface} 0%, rgba(${parts},0.99) 51%, rgba(${parts},0.94) 64%, rgba(${parts},0) 91%)`
  }
  const background =
    recipe.background.mode === 'uploaded'
      ? { kind: 'asset' as const, assetId: recipe.background.assetId }
      : { kind: 'curated' as const, path: template.backgroundImage }
  return {
    version: 1,
    rendererVersion: 5,
    template,
    branding: recipe.branding,
    background,
    crop: recipe.crop,
    assetVersions: []
  }
}

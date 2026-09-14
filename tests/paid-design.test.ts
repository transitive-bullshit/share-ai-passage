import { randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  defaultTemplateRecipe,
  draftDesignSchema,
  resolveCardDesign,
  templateRecipeSchema
} from '@/lib/paid-design'
import { SocialCard } from '@/lib/social-card'
import { socialTemplates } from '@/lib/social-templates'

const data = {
  title: 'A useful conversation',
  highlights: ['Keep source attribution'],
  provider: 'chatgpt' as const
}
describe('paid card recipes', () => {
  it.each(socialTemplates)(
    'preserves the unmodified $id descriptor without mutating it',
    (template) => {
      const original = structuredClone(template)
      const design = {
        version: 1 as const,
        recipe: defaultTemplateRecipe(template.id),
        fromTemplate: null,
        generatedImage: null
      }
      const resolved = resolveCardDesign({ templateId: template.id }, design)!
      expect(resolved.template).toEqual(original)
      resolved.template.colors.text = '#ffffff'
      expect(template).toEqual(original)
      expect(resolveCardDesign({ templateId: template.id })).toBeNull()
    }
  )
  it('rejects unsafe or unsupported recipe fields and unreadable colors', () => {
    const recipe = defaultTemplateRecipe()
    expect(
      templateRecipeSchema.safeParse({
        ...recipe,
        remoteUrl: 'https://example.com/image'
      }).success
    ).toBe(false)
    expect(
      templateRecipeSchema.safeParse({
        ...recipe,
        fontPairing: 'uploaded-font'
      }).success
    ).toBe(false)
    expect(
      templateRecipeSchema.safeParse({
        ...recipe,
        colors: { ...recipe.colors, text: recipe.colors.surface }
      }).success
    ).toBe(false)
    expect(
      templateRecipeSchema.safeParse({ ...recipe, crop: { x: 2, y: 0 } })
        .success
    ).toBe(false)
  })
  it('omits private style inputs from the public render projection', () => {
    const recipe = {
      ...defaultTemplateRecipe(),
      artDirection: 'private art direction',
      referenceAssetId: randomUUID(),
      background: { mode: 'generated' as const }
    }
    const design = draftDesignSchema.parse({
      version: 1,
      recipe,
      fromTemplate: null,
      generatedImage: null
    })
    const resolved = resolveCardDesign(
      { templateId: recipe.baseStyle },
      design
    )!
    expect(resolved.background).toEqual({ kind: 'pending' })
    expect(JSON.stringify(resolved)).not.toContain(recipe.referenceAssetId)
    expect(JSON.stringify(resolved)).not.toContain(recipe.artDirection)
  })
  it.each(['none', 'custom'] as const)(
    'removes residual Passage wording with %s branding while preserving attribution',
    (mode) => {
      const recipe = {
        ...defaultTemplateRecipe(),
        branding:
          mode === 'none'
            ? { mode }
            : { mode, assetId: randomUUID(), name: 'My Studio' }
      }
      const resolved = resolveCardDesign(
        { templateId: recipe.baseStyle },
        { version: 1, recipe, fromTemplate: null, generatedImage: null }
      )!
      const html = renderToStaticMarkup(
        createElement(SocialCard, {
          data,
          appearance: { templateId: recipe.baseStyle },
          design: resolved,
          logo: 'data:image/webp;base64,aA=='
        })
      )
      expect(html).toContain('From ChatGPT')
      expect(html).not.toMatch(/Passage|passage from|worth sharing/)
      expect(html.includes('My Studio')).toBe(mode === 'custom')
    }
  )
})

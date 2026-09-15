import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { accountSubject } from './accounts'
import { requireAssetAccount, validateRecipeAssets } from './assets'
import { readEntitlements, requirePaidAccount } from './billing'
import { DEFAULT_CARD_APPEARANCE } from './card-appearance'
import { getDb, type Transaction } from './db'
import { accountPreferences, savedTemplates } from './db/schema'
import { AppError } from './errors'
import {
  draftDesignSchema,
  templateRecipeSchema,
  type DraftDesign
} from './paid-design'
import { lockUsageSubjects } from './usage'

export const saveTemplateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  recipe: templateRecipeSchema
})
export const updateTemplateSchema = saveTemplateSchema.extend({
  revision: z.number().int().nonnegative()
})
export async function listTemplates(userId: string, cursor?: string | null) {
  await requireAssetAccount(userId)
  const offset = cursor ? Number(cursor) : 0
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new AppError('Invalid template cursor.')
  const [rows, preferences, entitlements] = await Promise.all([
    getDb()
      .select()
      .from(savedTemplates)
      .where(
        and(
          eq(savedTemplates.ownerId, userId),
          isNull(savedTemplates.deletedAt)
        )
      )
      .orderBy(desc(savedTemplates.updatedAt), desc(savedTemplates.id))
      .limit(51)
      .offset(offset),
    getDb()
      .select()
      .from(accountPreferences)
      .where(eq(accountPreferences.userId, userId)),
    readEntitlements(userId)
  ])
  return {
    templates: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? String(offset + 50) : null,
    defaultTemplateId: preferences[0]?.defaultTemplateId ?? null,
    canCustomize: entitlements.paidActions
  }
}
export async function saveTemplate(
  userId: string,
  value: unknown,
  id?: string
) {
  const parsed = (id ? updateTemplateSchema : saveTemplateSchema).safeParse(
    value
  )
  if (!parsed.success)
    throw new AppError(
      parsed.error.issues[0]?.message ?? 'Review your template settings.'
    )
  if (id && !z.uuid().safeParse(id).success)
    throw new AppError('Template not found.', 404)
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requirePaidAccount(userId, tx)
    const input = parsed.data
    await validateRecipeAssets(userId, input.recipe, tx)
    if (id) {
      const [current] = await tx
        .select()
        .from(savedTemplates)
        .where(
          and(
            eq(savedTemplates.id, id),
            eq(savedTemplates.ownerId, userId),
            isNull(savedTemplates.deletedAt)
          )
        )
        .for('update')
      if (!current) throw new AppError('Template not found.', 404)
      if (!('revision' in input) || current.revision !== input.revision)
        throw new AppError(
          'This template changed elsewhere. Reload it before saving.',
          409
        )
      const [template] = await tx
        .update(savedTemplates)
        .set({
          name: input.name,
          recipe: input.recipe,
          revision: current.revision + 1,
          updatedAt: new Date()
        })
        .where(eq(savedTemplates.id, id))
        .returning()
      return { template }
    }
    const [template] = await tx
      .insert(savedTemplates)
      .values({ ownerId: userId, name: input.name, recipe: input.recipe })
      .returning()
    return { template }
  })
}
export async function deleteTemplate(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new AppError('Template not found.', 404)
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requireAssetAccount(userId, tx)
    const [template] = await tx
      .update(savedTemplates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(savedTemplates.id, id), eq(savedTemplates.ownerId, userId)))
      .returning({ id: savedTemplates.id })
    if (!template) throw new AppError('Template not found.', 404)
    await tx
      .update(accountPreferences)
      .set({ defaultTemplateId: null, updatedAt: new Date() })
      .where(
        and(
          eq(accountPreferences.userId, userId),
          eq(accountPreferences.defaultTemplateId, id)
        )
      )
    return { removed: true }
  })
}
export async function setDefaultTemplate(userId: string, id: string | null) {
  if (id !== null && !z.uuid().safeParse(id).success)
    throw new AppError('Template not found.', 404)
  return getDb().transaction(async (tx) => {
    await lockUsageSubjects(tx, accountSubject(userId))
    await requirePaidAccount(userId, tx)
    if (id) await snapshotTemplate(userId, id, tx)
    await tx
      .insert(accountPreferences)
      .values({
        userId,
        appearance: DEFAULT_CARD_APPEARANCE,
        defaultTemplateId: id
      })
      .onConflictDoUpdate({
        target: accountPreferences.userId,
        set: { defaultTemplateId: id, updatedAt: new Date() }
      })
    return { defaultTemplateId: id }
  })
}
export async function snapshotTemplate(
  userId: string,
  id: string,
  tx?: Transaction
): Promise<DraftDesign> {
  const [template] = await (tx ?? getDb())
    .select()
    .from(savedTemplates)
    .where(
      and(
        eq(savedTemplates.id, id),
        eq(savedTemplates.ownerId, userId),
        isNull(savedTemplates.deletedAt)
      )
    )
  if (!template) throw new AppError('Template not found.', 404)
  await validateRecipeAssets(userId, template.recipe, tx)
  return draftDesignSchema.parse({
    version: 1,
    recipe: template.recipe,
    fromTemplate: { id: template.id, revision: template.revision },
    generatedImage: null
  })
}
/** Uses the accepted account default only for future work, never an owned revise. */
export async function defaultDraftDesign(
  userId: string,
  tx?: Transaction
): Promise<DraftDesign | null> {
  const db = tx ?? getDb()
  const entitlements = await readEntitlements(userId, tx)
  if (!entitlements.paidActions) return null
  const [preferences] = await db
    .select()
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, userId))
  return preferences?.defaultTemplateId
    ? snapshotTemplate(userId, preferences.defaultTemplateId, tx)
    : null
}

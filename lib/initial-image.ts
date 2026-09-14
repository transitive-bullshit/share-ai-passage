import type { createSavedDraft } from './account-drafts'
import type { Actor } from './actors'
import { AppError } from './errors'
import { ensureImageEnqueued, requestImageJob } from './image-jobs'

type PreparationResult = Awaited<ReturnType<typeof createSavedDraft>>

/** Continue the original template request, never an automatic reroll. */
export async function startInitialDraftImage(
  actor: Actor,
  draft: PreparationResult,
  enqueue: Parameters<typeof ensureImageEnqueued>[1]
) {
  if (
    draft.status !== 'ready' ||
    draft.revision !== 0 ||
    draft.design?.recipe.background.mode !== 'generated' ||
    draft.design.generatedImage
  )
    return draft
  try {
    const operation = await requestImageJob(
      actor,
      draft.draftId,
      draft.revision,
      draft.draftId
    )
    await ensureImageEnqueued(operation.id, enqueue)
    return { ...draft, imageJobId: operation.id }
  } catch (err) {
    return {
      ...draft,
      imageGenerationError:
        err instanceof AppError
          ? err.message
          : 'The background could not start. Your summary is saved.'
    }
  }
}

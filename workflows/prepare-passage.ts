import { FatalError, RetryableError } from 'workflow'

/** Keep private conversation content out of Workflow arguments and results. */
export async function preparePassage(draftId: string) {
  'use workflow'
  try {
    await prepareDraftStep(draftId)
    await startInitialImageStep(draftId)
  } catch {
    await failPreparationStep(draftId)
  }
}

async function prepareDraftStep(draftId: string) {
  'use step'
  const { prepareDraftInBackground, failDraftPreparation } =
    await import('@/lib/account-drafts')
  const { AppError } = await import('@/lib/errors')
  try {
    await prepareDraftInBackground(draftId)
  } catch (err) {
    if (
      err instanceof AppError &&
      (err.details ||
        (err.status < 500 &&
          !([409, 422].includes(err.status) && err.retryAfter)))
    ) {
      await failDraftPreparation(draftId, err.message).catch(() => {})
      throw new FatalError('This preparation cannot continue.')
    }
    throw new RetryableError('Preparation is temporarily unavailable.', {
      retryAfter:
        err instanceof AppError && err.retryAfter ? err.retryAfter * 1000 : 5000
    })
  }
}
prepareDraftStep.maxRetries = 5

async function startInitialImageStep(draftId: string) {
  'use step'
  const { loadDraftPreparation, readSavedDraft } =
    await import('@/lib/account-drafts')
  const { startInitialDraftImage } = await import('@/lib/initial-image')
  const { start } = await import('workflow/api')
  const { generatePassageBackground } =
    await import('@/workflows/generate-background')
  const { actor } = await loadDraftPreparation(draftId)
  const draft = await readSavedDraft(actor, draftId)
  await startInitialDraftImage(actor, draft, (id) =>
    start(generatePassageBackground, [id])
  )
}
startInitialImageStep.maxRetries = 3

async function failPreparationStep(draftId: string) {
  'use step'
  const { failDraftPreparation } = await import('@/lib/account-drafts')
  const { AppError } = await import('@/lib/errors')
  try {
    await failDraftPreparation(draftId)
  } catch (err) {
    if (err instanceof AppError && [403, 404].includes(err.status)) return
    throw new Error('Preparation status could not be saved.')
  }
}
failPreparationStep.maxRetries = 3

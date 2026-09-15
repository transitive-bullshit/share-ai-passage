import { FatalError } from 'workflow'

/** Only the opaque operation identity enters durable Workflow history. */
export async function generatePassageBackground(operationId: string) {
  'use workflow'
  try {
    return await generateImageStep(operationId)
  } catch {
    return await recoverImageStep(operationId)
  }
}

async function generateImageStep(operationId: string) {
  'use step'
  try {
    const { runImageGeneration } = await import('@/lib/image-worker')
    return await runImageGeneration(operationId)
  } catch {
    throw new FatalError(
      'Image generation was interrupted. Recover its saved operation before any new attempt.'
    )
  }
}
generateImageStep.maxRetries = 0

async function recoverImageStep(operationId: string) {
  'use step'
  try {
    const { recoverImageResult } = await import('@/lib/image-worker')
    return await recoverImageResult(operationId)
  } catch {
    // Storage/database recovery may retry; it contains no provider POST.
    throw new Error('Image result recovery is temporarily unavailable.')
  }
}
recoverImageStep.maxRetries = 3

import { and, eq } from 'drizzle-orm'

import { getDb } from './db'
import { generationOperations } from './db/schema'
import type { ExtractedConversation } from './domain'
import { AppError } from './errors'
import {
  assertMeteredPreviewModel,
  suggestPreview,
  type PreviewUsage
} from './suggestions'
import {
  failSummaryOperation,
  markSummaryUncertain,
  reserveSummary,
  startSummaryOperation,
  succeedSummaryOperation,
  type ReserveSummaryInput
} from './usage'
import { nanoSummaryCostMicros } from './usage-policy'

/** Durable idempotency belongs to the operation, never to an HTTP retry. */
export async function generateSummary(
  conversation: ExtractedConversation,
  input: ReserveSummaryInput
) {
  const [known] = await getDb()
    .select({ id: generationOperations.id })
    .from(generationOperations)
    .where(
      and(
        eq(
          generationOperations.subjectKey,
          input.requestSubjectKey ?? input.subjectKey
        ),
        eq(generationOperations.requestKey, input.requestKey)
      )
    )
  // Configuration outages must not prevent recovery of already-paid results.
  if (!known) assertMeteredPreviewModel()
  const { operation } = await reserveSummary(input)
  if (operation.status === 'succeeded' && operation.result)
    return { preview: operation.result, operationId: operation.id }
  if (operation.status === 'reserved') assertMeteredPreviewModel()
  const started = await startSummaryOperation(operation.id)
  if (!started.claimed) {
    throw new AppError(
      started.operation.status === 'failed' ||
        started.operation.status === 'cancelled'
        ? 'This generation did not complete. Start a new generation to try again.'
        : 'This generation is still pending confirmation. Your saved work is safe; do not start it again.',
      409
    )
  }
  let observed: PreviewUsage | undefined
  let received = false
  try {
    const preview = await suggestPreview(conversation, (event) => {
      observed = event
    })
    received = true
    const saved = await succeedSummaryOperation(
      operation.id,
      preview,
      nanoSummaryCostMicros(observed?.usage),
      observed?.requestId
    )
    if (!saved.result)
      throw new AppError(
        'This draft or account was deleted while generation was running.',
        410
      )
    return { preview: saved.result, operationId: operation.id }
  } catch (err) {
    // A persistence failure after a usable result must never refund or redispatch.
    if (!received && observed?.definitiveFailure) {
      await failSummaryOperation(
        operation.id,
        observed.rejected ? 0 : nanoSummaryCostMicros(observed.usage),
        observed.requestId
      )
    } else {
      await markSummaryUncertain(operation.id, observed?.requestId)
    }
    throw err
  }
}

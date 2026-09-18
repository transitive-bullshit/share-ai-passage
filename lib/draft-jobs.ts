import { and, eq, isNull, lte, or } from 'drizzle-orm'

import { requireOwnedActor, type Actor } from './actors'
import { getDb } from './db'
import { savedDrafts } from './db/schema'

/** Recover ambiguous queue delivery under a lease. The draft and generation
 * identities remain the same even if a lost response creates another run. */
export async function ensureDraftEnqueued(
  actor: Actor,
  id: string,
  enqueue: (id: string) => Promise<{ runId: string }>
) {
  requireOwnedActor(actor)
  const lease = new Date(Date.now() + 60_000)
  const [claimed] = await getDb()
    .update(savedDrafts)
    .set({ preparationEnqueueLeaseUntil: lease, updatedAt: new Date() })
    .where(
      and(
        eq(savedDrafts.id, id),
        eq(savedDrafts.ownerId, actor.userId),
        eq(savedDrafts.status, 'preparing'),
        isNull(savedDrafts.deletedAt),
        isNull(savedDrafts.preparationRunId),
        or(
          isNull(savedDrafts.preparationEnqueueLeaseUntil),
          lte(savedDrafts.preparationEnqueueLeaseUntil, new Date())
        )
      )
    )
    .returning({ id: savedDrafts.id })
  if (!claimed) return
  try {
    const run = await enqueue(id)
    await getDb()
      .update(savedDrafts)
      .set({ preparationRunId: run.runId, updatedAt: new Date() })
      .where(
        and(
          eq(savedDrafts.id, id),
          eq(savedDrafts.preparationEnqueueLeaseUntil, lease)
        )
      )
  } catch {
    // Owned status polling retries delivery after the lease. Never allocate
    // another draft, request key, quota unit or generation operation here.
  }
}

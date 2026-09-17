import type { DraftDesign, ResolvedCardDesign } from '@/lib/paid-design'
import type { CardAppearance } from '@/lib/card-appearance'
import { ClientRequestError, parseRetryAfter } from '@/lib/client-request'
import type { GeneratedPreview, Provider } from '@/lib/domain'

export type SavedDraft = {
  draftId: string
  revision: number
  status: 'ready' | 'published'
  shareUrl?: string
  draftToken: string
  provider: Provider
  sourceUrl: string
  preview: GeneratedPreview
  appearance: CardAppearance
  design?: DraftDesign | null
  resolvedDesign?: ResolvedCardDesign | null
  artwork?: { background?: string; logo?: string }
  canCustomize?: boolean
}
export type PendingDraft = {
  draftId: string
  status: 'preparing' | 'failed'
  preparationActive?: boolean
  errorMessage?: string
  generationBlock?: {
    code:
      | 'SUMMARY_LIMIT'
      | 'FREE_BUDGET_LIMIT'
      | 'SUMMARY_BUDGET_LIMIT'
      | 'AI_SPEND_LIMIT'
    resetAt: string
    canSignUp: boolean
  }
}
export type DraftResult = SavedDraft | PendingDraft
export function isSavedDraft(result: DraftResult): result is SavedDraft {
  return result.status === 'ready' || result.status === 'published'
}
export type DraftOperation = {
  id: string
  status:
    | 'reserved'
    | 'running'
    | 'uncertain'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
  result: GeneratedPreview | null
  createdAt: string
  draftRevision: number
}
export class DraftRequestError extends ClientRequestError {
  constructor(
    message: string,
    status?: number,
    retryAt?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(
      message,
      status,
      retryAt,
      typeof details?.code === 'string' ? details.code : undefined,
      typeof details?.resetAt === 'string' ? details.resetAt : undefined
    )
  }
}

export async function draftRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  let response: Response
  try {
    const options: RequestInit = { method, signal }
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify(body)
    }
    response = await fetch(path, options)
  } catch {
    throw new DraftRequestError(
      'We couldn’t connect. Check your connection and try again.'
    )
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const details =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : undefined
    const message =
      typeof details?.error === 'string'
        ? details.error
        : 'The request could not be completed. Please try again.'
    throw new DraftRequestError(
      message,
      response.status,
      parseRetryAfter(response.headers.get('Retry-After')),
      details
    )
  }
  if (!data)
    throw new DraftRequestError(
      'The response could not be read. Check the saved draft before trying again.',
      response.status
    )
  return data as T
}

export function sameDraftContent(
  a: {
    preview: GeneratedPreview
    appearance: CardAppearance
    design?: DraftDesign | null
  },
  b: {
    preview: GeneratedPreview
    appearance: CardAppearance
    design?: DraftDesign | null
  }
) {
  return (
    JSON.stringify(a.preview) === JSON.stringify(b.preview) &&
    a.appearance.templateId === b.appearance.templateId &&
    (b.design === undefined ||
      JSON.stringify(a.design ?? null) === JSON.stringify(b.design))
  )
}

export async function saveDraft(
  draftId: string,
  revision: number,
  content: {
    preview: GeneratedPreview
    appearance: CardAppearance
    design?: DraftDesign | null
  }
) {
  try {
    return await draftRequest<SavedDraft>(`/api/drafts/${draftId}`, 'PATCH', {
      revision,
      ...content
    })
  } catch (err) {
    // A previous save may have reached the server even if its response was lost.
    if (err instanceof DraftRequestError && err.status === 409) {
      const current = await draftRequest<DraftResult>(`/api/drafts/${draftId}`)
      if (current.status === 'ready' && sameDraftContent(current, content))
        return current
    }
    throw err
  }
}

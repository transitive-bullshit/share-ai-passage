import { parseCardAppearance, type CardAppearance } from '@/lib/card-appearance'

export type PreparationRequest = {
  url: string
  requestKey: string
  appearance: CardAppearance
  templateId?: string
}
const key = 'passage:pending-preparation:v1'
const listeners = new Set<() => void>()

export const preparationRecovery = {
  subscribe(this: void, listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getServerSnapshot: () => null,
  getSnapshot(this: void): string | null {
    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  save(request: PreparationRequest) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(request))
    } catch {
      /* Recovery still works from the account library when browser storage is blocked. */
    }
    for (const listener of listeners) listener()
  },
  clear() {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      /* Storage may be blocked. */
    }
    for (const listener of listeners) listener()
  }
}

export function parsePreparationRequest(
  raw: string | null
): PreparationRequest | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !value ||
      typeof value !== 'object' ||
      !('url' in value) ||
      typeof value.url !== 'string' ||
      !('requestKey' in value) ||
      typeof value.requestKey !== 'string' ||
      !/^[\da-f-]{36}$/i.test(value.requestKey) ||
      !('appearance' in value)
    )
      return null
    const url = new URL(value.url)
    if (url.protocol !== 'https:') return null
    const appearance = parseCardAppearance(value.appearance)
    if (!appearance) return null
    const request: PreparationRequest = {
      url: value.url,
      requestKey: value.requestKey,
      appearance
    }
    if (
      'templateId' in value &&
      typeof value.templateId === 'string' &&
      /^[a-f\d-]{36}$/i.test(value.templateId)
    )
      request.templateId = value.templateId
    return request
  } catch {
    return null
  }
}

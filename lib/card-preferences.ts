import {
  type CardAppearance,
  DEFAULT_CARD_APPEARANCE,
  normalizeCardAppearance
} from '@/lib/card-appearance'

export const CARD_PREFERENCES_KEY = 'passage:card-preferences:v1'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>
type GetStorage = () => PreferenceStorage

export function decodeCardPreferences(value: string | null): CardAppearance {
  if (!value) return DEFAULT_CARD_APPEARANCE
  try {
    const stored: unknown = JSON.parse(value)
    if (
      !stored ||
      typeof stored !== 'object' ||
      !('version' in stored) ||
      stored.version !== 1 ||
      !('appearance' in stored)
    )
      return DEFAULT_CARD_APPEARANCE
    return normalizeCardAppearance(stored.appearance)
  } catch {
    return DEFAULT_CARD_APPEARANCE
  }
}

export function readCardPreferences(getStorage: GetStorage) {
  try {
    return {
      appearance: decodeCardPreferences(
        getStorage().getItem(CARD_PREFERENCES_KEY)
      ),
      available: true
    }
  } catch {
    return { appearance: DEFAULT_CARD_APPEARANCE, available: false }
  }
}

export function saveCardPreferences(
  appearance: CardAppearance,
  getStorage: GetStorage
): boolean {
  try {
    // Explicitly allowlist preferences: never persist a draft or conversation.
    getStorage().setItem(
      CARD_PREFERENCES_KEY,
      JSON.stringify({
        version: 1,
        appearance: { templateId: appearance.templateId }
      })
    )
    return true
  } catch {
    return false
  }
}

export type CardPreferencesSnapshot = {
  appearance: CardAppearance
  ready: boolean
  available: boolean
}

const serverSnapshot: CardPreferencesSnapshot = {
  appearance: DEFAULT_CARD_APPEARANCE,
  ready: false,
  available: true
}

/** A small external store keeps hydration and browser storage in agreement. */
export function createCardPreferencesStore(getStorage: GetStorage) {
  let snapshot: CardPreferencesSnapshot | undefined
  const listeners = new Set<() => void>()

  function getSnapshot(): CardPreferencesSnapshot {
    snapshot ??= { ...readCardPreferences(getStorage), ready: true }
    return snapshot
  }

  function notify() {
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    refresh() {
      const next = readCardPreferences(getStorage)
      const current = getSnapshot()
      // A blocked read should not discard an intentional choice made this visit.
      if (!next.available) {
        if (current.available) {
          snapshot = { ...current, available: false }
          notify()
        }
        return
      }
      if (
        current.appearance.templateId !== next.appearance.templateId ||
        current.available !== next.available
      ) {
        snapshot = { ...next, ready: true }
        notify()
      }
    },
    change: (appearance: CardAppearance) => {
      snapshot = {
        appearance,
        ready: true,
        available: saveCardPreferences(appearance, getStorage)
      }
      notify()
    }
  }
}

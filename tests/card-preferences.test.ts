import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_APPEARANCE } from '../lib/card-appearance'
import {
  CARD_PREFERENCES_KEY,
  createCardPreferencesStore,
  decodeCardPreferences,
  readCardPreferences,
  saveCardPreferences
} from '../lib/card-preferences'
import { socialTemplateIds } from '../lib/social-templates'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn<(key: string) => string | null>(
      (key) => values.get(key) ?? null
    ),
    setItem: vi.fn<(key: string, value: string) => void>((key, value) =>
      values.set(key, value)
    )
  }
}

describe('browser card preferences', () => {
  it('uses the initial design without overwriting storage on first visit', () => {
    const local = storage()
    expect(readCardPreferences(() => local)).toEqual({
      appearance: DEFAULT_CARD_APPEARANCE,
      available: true
    })
    expect(local.setItem).not.toHaveBeenCalled()
  })

  it.each(socialTemplateIds)('restores %s on the next visit', (templateId) => {
    const local = storage()
    expect(saveCardPreferences({ templateId }, () => local)).toBe(true)
    expect(readCardPreferences(() => local).appearance).toEqual({ templateId })
  })

  it('persists only the supported preference fields, never source or draft data', () => {
    const local = storage()
    const appearanceWithUnrelatedData = {
      templateId: 'friendly-lab' as const,
      sourceUrl: 'https://chatgpt.com/share/private-test',
      draftToken: 'secret-draft-token',
      title: 'Conversation content'
    }
    saveCardPreferences(appearanceWithUnrelatedData, () => local)
    expect(JSON.parse(local.getItem(CARD_PREFERENCES_KEY)!)).toEqual({
      version: 1,
      appearance: { templateId: 'friendly-lab' }
    })
  })

  it.each([
    null,
    '',
    '{broken JSON',
    'null',
    '[]',
    '123',
    JSON.stringify({ version: 2, appearance: { templateId: 'friendly-lab' } }),
    JSON.stringify({ appearance: { templateId: 'friendly-lab' } }),
    JSON.stringify({
      version: 1,
      appearance: { templateId: 'retired-template' }
    }),
    JSON.stringify({ version: 1, appearance: { templateId: 12 } }),
    JSON.stringify({
      version: 1,
      appearance: { templateId: 'friendly-lab', font: 'injected' }
    })
  ])(
    'falls back safely for missing or incompatible stored data: %s',
    (value) => {
      expect(decodeCardPreferences(value)).toEqual(DEFAULT_CARD_APPEARANCE)
    }
  )

  it('continues when browser access itself is blocked', () => {
    const blocked = () => {
      throw new Error('SecurityError')
    }
    expect(readCardPreferences(blocked)).toEqual({
      appearance: DEFAULT_CARD_APPEARANCE,
      available: false
    })
    expect(saveCardPreferences({ templateId: 'friendly-lab' }, blocked)).toBe(
      false
    )
  })

  it('continues when reading throws or the storage quota is exhausted', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      }
    }
    expect(readCardPreferences(() => unavailable).available).toBe(false)
    expect(
      saveCardPreferences(
        { templateId: 'midnight-observatory' },
        () => unavailable
      )
    ).toBe(false)
  })
})

describe('card preference synchronization', () => {
  it('does not access browser storage for server rendering and uses a stable hydration snapshot', () => {
    const local = storage()
    const store = createCardPreferencesStore(() => local)
    expect(store.getServerSnapshot().ready).toBe(false)
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot())
    expect(local.getItem).not.toHaveBeenCalled()
    expect(store.getSnapshot().ready).toBe(true)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('notifies subscribers about local changes and refreshed cross-tab preferences', () => {
    const local = storage()
    const store = createCardPreferencesStore(() => local)
    const changed = vi.fn<() => void>()
    const unsubscribe = store.subscribe(changed)
    store.change({ templateId: 'friendly-lab' })
    expect(store.getSnapshot().appearance.templateId).toBe('friendly-lab')
    expect(changed).toHaveBeenCalledTimes(1)
    saveCardPreferences({ templateId: 'electric-risograph' }, () => local)
    store.refresh()
    expect(store.getSnapshot().appearance.templateId).toBe('electric-risograph')
    expect(changed).toHaveBeenCalledTimes(2)
    store.refresh()
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
    store.change({ templateId: 'midnight-observatory' })
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('keeps an intentional choice in memory when storage is blocked', () => {
    const store = createCardPreferencesStore(() => {
      throw new Error('SecurityError')
    })
    store.change({ templateId: 'makers-workbench' })
    store.refresh()
    expect(store.getSnapshot()).toEqual({
      appearance: { templateId: 'makers-workbench' },
      ready: true,
      available: false
    })
  })
})

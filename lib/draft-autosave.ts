import type { CardAppearance } from '@/lib/card-appearance'
import { ClientRequestError, clientErrorMessage } from '@/lib/client-request'
import type { GeneratedPreview } from '@/lib/domain'

export type DraftContent = {
  preview: GeneratedPreview
  appearance: CardAppearance
}
export type DraftSaveSnapshot = {
  status: 'saved' | 'waiting' | 'saving' | 'error' | 'conflict'
  revision: number
  error: string
}

/** One queue per editor: saves cannot overtake one another or publish an old revision. */
export function createDraftAutosave(
  initial: DraftContent & { revision: number },
  save: (
    revision: number,
    content: DraftContent
  ) => Promise<{ revision: number }>
) {
  let latest: DraftContent = initial
  let version = 0
  let savedVersion = 0
  let snapshot: DraftSaveSnapshot = {
    status: 'saved',
    revision: initial.revision,
    error: ''
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> | undefined
  const listeners = new Set<() => void>()
  function update(next: DraftSaveSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }
  async function saveLoop() {
    while (savedVersion !== version) {
      const savingVersion = version
      const content = latest
      update({ ...snapshot, status: 'saving', error: '' })
      try {
        const result = await save(snapshot.revision, content)
        savedVersion = savingVersion
        update({
          status: savedVersion === version ? 'saved' : 'saving',
          revision: result.revision,
          error: ''
        })
      } catch (err) {
        update({
          ...snapshot,
          status:
            err instanceof ClientRequestError && err.status === 409
              ? 'conflict'
              : 'error',
          error: clientErrorMessage(err)
        })
        throw err
      }
    }
  }
  async function flush() {
    clearTimeout(timer)
    if (active) await active
    if (snapshot.status === 'conflict')
      throw new ClientRequestError(
        'This draft changed in another tab. Reload it before continuing.',
        409
      )
    if (version !== savedVersion) {
      active = saveLoop()
      try {
        await active
      } finally {
        active = undefined
      }
    }
    return snapshot.revision
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    change(content: DraftContent) {
      latest = content
      version++
      clearTimeout(timer)
      if (snapshot.status === 'conflict') return
      update({ ...snapshot, status: active ? 'saving' : 'waiting', error: '' })
      timer = setTimeout(() => {
        void flush().catch(() => {})
      }, 500)
    },
    accept(content: DraftContent & { revision: number }) {
      clearTimeout(timer)
      latest = content
      version++
      savedVersion = version
      update({ status: 'saved', revision: content.revision, error: '' })
    },
    flush,
    dispose() {
      clearTimeout(timer)
    }
  }
}

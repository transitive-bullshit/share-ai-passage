'use client'

import { useSyncExternalStore } from 'react'

import { authClient } from '@/lib/auth-client'

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

/** A cached session can resolve before a streamed component hydrates. */
export function useAccountSession() {
  const session = authClient.useSession()
  const hydrated = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot
  )
  return {
    ...session,
    data: hydrated ? session.data : null,
    error: hydrated ? session.error : null,
    isPending: !hydrated || session.isPending
  }
}

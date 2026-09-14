import type { Metadata } from 'next'

import { ApiKeySettings } from '@/components/api-key-settings'

export const metadata: Metadata = { title: 'API keys · Passage' }

export default function ApiKeysPage() {
  return <ApiKeySettings />
}

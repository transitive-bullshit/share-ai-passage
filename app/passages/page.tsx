import type { Metadata } from 'next'

import { PassageLibrary } from '@/components/passage-library'

export const metadata: Metadata = { title: 'My passages' }

export default function PassagesPage() {
  return <PassageLibrary />
}

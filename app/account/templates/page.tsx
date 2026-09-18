import type { Metadata } from 'next'
import { TemplateEditor } from '@/components/template-editor'
export const metadata: Metadata = {
  title: 'Your templates',
  robots: { index: false, follow: false }
}
export default function TemplatesPage() {
  return <TemplateEditor />
}

import './social-card-fonts'

import type { Provider } from '@/lib/domain'
import { SocialCard } from '@/lib/social-card'
import type { SocialTemplate } from '@/lib/social-templates'

const sampleHighlights = [
  'Follow a question worth asking.',
  'Find a different point of view.',
  'Make space for what comes next.'
]

export function SocialTemplateThumbnail({
  template,
  provider
}: {
  template: SocialTemplate
  provider: Provider
}) {
  return (
    <span className='social-template-browser-preview' aria-hidden='true'>
      <span className='social-template-card'>
        <SocialCard
          data={{
            title: 'Make room for the unexpected',
            highlights: sampleHighlights,
            provider
          }}
          appearance={{ templateId: template.id }}
        />
      </span>
    </span>
  )
}

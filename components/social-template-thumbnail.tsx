import './social-card-fonts'

import { SocialCardPreview } from '@/components/social-card-preview'
import type { GeneratedPreview, Provider } from '@/lib/domain'
import type { SocialTemplate } from '@/lib/social-templates'

export function SocialTemplateThumbnail({
  template,
  provider,
  preview
}: {
  template: SocialTemplate
  provider: Provider
  preview: GeneratedPreview
}) {
  return (
    <span className='social-template-browser-preview' aria-hidden='true'>
      <SocialCardPreview
        preview={preview}
        provider={provider}
        appearance={{ templateId: template.id }}
      />
    </span>
  )
}

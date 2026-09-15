import { JsonLd } from '@/components/json-ld'
import { ShareFlow } from '@/components/share-flow'
import { LandingDetails } from '@/components/landing-details'
import { brand } from '@/lib/brand'
import { appUrl } from '@/lib/config'
import { homepageJsonLd, noindex, publicPageMetadata } from '@/lib/seo'

export async function generateMetadata(props?: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await props?.searchParams
  const url = appUrl()
  const title = `${brand.name} — ${brand.headline}`
  const metadata = {
    ...publicPageMetadata({
      title,
      description: brand.productDescription,
      url,
      image: { url: `${url}/brand/social-preview.jpg`, type: 'image/jpeg' },
      type: 'website'
    }),
    title: { absolute: title }
  }
  if (query?.draft !== undefined || query?.template !== undefined)
    metadata.robots = noindex
  return metadata
}

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  return (
    <main id='main'>
      <JsonLd data={homepageJsonLd()} />
      <ShareFlow
        initialTemplateId={
          typeof query.template === 'string' ? query.template : undefined
        }
        initialDraftId={
          typeof query.draft === 'string' ? query.draft : undefined
        }
      >
        <LandingDetails />
      </ShareFlow>
    </main>
  )
}

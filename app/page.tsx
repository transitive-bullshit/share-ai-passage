import { JsonLd } from '@/components/json-ld'
import { ShareFlow } from '@/components/share-flow'
import { LandingDetails } from '@/components/landing-details'
import { brand } from '@/lib/brand'
import { appUrl } from '@/lib/config'
import { homepageJsonLd, publicPageMetadata } from '@/lib/seo'

export function generateMetadata() {
  const url = appUrl()
  const title = `${brand.name} — ${brand.headline}`
  return {
    ...publicPageMetadata({
      title,
      description: brand.productDescription,
      url,
      image: { url: `${url}/brand/social-preview.jpg`, type: 'image/jpeg' },
      type: 'website'
    }),
    title: { absolute: title }
  }
}

export default function HomePage() {
  return (
    <main id='main'>
      <JsonLd data={homepageJsonLd()} />
      <ShareFlow>
        <LandingDetails />
      </ShareFlow>
    </main>
  )
}

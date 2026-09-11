import { ShareFlow } from '@/components/share-flow'
import { LandingDetails } from '@/components/landing-details'

export default function HomePage() {
  return (
    <main id='main'>
      <ShareFlow>
        <LandingDetails />
      </ShareFlow>
    </main>
  )
}

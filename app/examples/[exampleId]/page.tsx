import { notFound, redirect } from 'next/navigation'

import { getMarketingExample } from '@/lib/marketing-examples'

export default async function ExamplePage({
  params
}: {
  params: Promise<{ exampleId: string }>
}) {
  const { exampleId } = await params
  const example = getMarketingExample(exampleId)
  if (!example) notFound()
  redirect(example.shareUrl)
}

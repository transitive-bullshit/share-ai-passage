import { readConversationImage } from '@/lib/conversation-images'
import { getPublication } from '@/lib/service'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  _request: Request,
  {
    params
  }: {
    params: Promise<{ provider: string; publicationId: string; sha256: string }>
  }
) {
  const { provider, publicationId, sha256 } = await params
  const unavailable = () =>
    new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' }
    })
  if (!/^[a-f0-9]{64}$/.test(sha256)) return unavailable()
  const record = await getPublication(provider, publicationId)
  if (!record || record.disabled) return unavailable()
  const image = record.snapshot.messages
    .flatMap((message) => [
      ...(message.images ?? []),
      ...message.content.flatMap((block) =>
        block.type === 'image' ? [block] : []
      )
    ])
    .find((image) => image.sha256 === sha256)
  if (!image) return unavailable()
  try {
    const bytes = await readConversationImage(image)
    // Stream verified bytes so larger supported images fit Vercel delivery limits.
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close()
          return
        }
        controller.enqueue(
          new Uint8Array(bytes.subarray(offset, offset + 64 * 1024))
        )
        offset += 64 * 1024
      }
    })
    return new Response(body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  } catch {
    return new Response(null, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    })
  }
}

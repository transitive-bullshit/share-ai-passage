import {
  errorResponse,
  privateHeaders,
  readJson,
  requireSameOrigin
} from '@/lib/http'
import { resolveServerPreview } from '@/lib/link-previews/server'
import { previewPageUrl } from '@/lib/link-previews/urls'

export const runtime = 'nodejs'
export const maxDuration = 10

export async function POST(request: Request) {
  try {
    requireSameOrigin(request)
    const body = await readJson(request, 8192)
    const url = previewPageUrl((body as { url?: unknown } | null)?.url)
    if (!url)
      return Response.json(
        { ok: false, reason: 'unsupported' },
        { headers: privateHeaders }
      )
    return Response.json(
      await resolveServerPreview(
        url.href,
        request.signal,
        (body as { priority?: unknown }).priority === 'background'
          ? 'background'
          : 'interactive'
      ),
      {
        headers: privateHeaders
      }
    )
  } catch (err) {
    return errorResponse(err)
  }
}

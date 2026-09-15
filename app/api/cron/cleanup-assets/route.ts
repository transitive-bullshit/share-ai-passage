export const runtime = 'nodejs'
export const maxDuration = 60

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow'
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (
    !secret?.trim() ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  ) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers })
  }
  try {
    const { cleanupPrivateAssets } = await import('@/lib/assets')
    const { examined, cleaned, skipped, failed } =
      await cleanupPrivateAssets(100)
    return Response.json(
      { examined, cleaned, skipped, failed },
      { status: failed > 0 ? 503 : 200, headers }
    )
  } catch {
    return Response.json(
      { error: 'Private asset cleanup failed.' },
      { status: 503, headers }
    )
  }
}

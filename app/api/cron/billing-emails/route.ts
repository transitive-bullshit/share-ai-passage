export const runtime = 'nodejs'
export const maxDuration = 300

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow'
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (
    !secret?.trim() ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  )
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers })
  try {
    const { deliverBillingEmails } = await import('@/lib/billing-emails')
    // Runs are 12 hours apart, so each wake drains the due backlog, not a small batch.
    const { examined, sent, skipped, failed, needsReview } =
      await deliverBillingEmails({ limit: 100, deadlineMs: 240_000 })
    const counts = { examined, sent, skipped, failed, needsReview }
    return Response.json(counts, {
      status: counts.failed || counts.needsReview ? 503 : 200,
      headers
    })
  } catch {
    return Response.json(
      { error: 'Subscription email delivery needs another attempt.' },
      { status: 503, headers }
    )
  }
}

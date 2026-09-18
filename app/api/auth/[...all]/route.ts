import { toNextJsHandler } from 'better-auth/next-js'

import { getAuth, getAuthConfigurationStatus } from '@/lib/auth'
import { withEmailDeliveryStatus } from '@/lib/email'

export const runtime = 'nodejs'

const handler = async (request: Request) => {
  const status = getAuthConfigurationStatus()
  if (!status.available) {
    return Response.json(
      {
        code: 'AUTH_NOT_CONFIGURED',
        message: status.message
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  const path = new URL(request.url).pathname
  if (
    !status.emailAndPassword &&
    [
      '/api/auth/sign-up/email',
      '/api/auth/sign-in/email',
      '/api/auth/request-password-reset',
      '/api/auth/send-verification-email'
    ].includes(path)
  ) {
    return Response.json(
      {
        code: 'EMAIL_AUTH_UNAVAILABLE',
        message:
          'Email sign-in is not available yet. Please use another sign-in method or try again later.'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  // Better Auth intentionally catches some email callback failures. Keep its
  // protocol unchanged while giving this request accurate delivery feedback.
  const delivery = await withEmailDeliveryStatus(() =>
    getAuth().handler(request)
  )
  if (delivery.failed) {
    return Response.json(
      {
        code: 'EMAIL_DELIVERY_UNAVAILABLE',
        message: 'We could not send the email. Please try again later.'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return delivery.value
}

export const { GET, POST } = toNextJsHandler(handler)

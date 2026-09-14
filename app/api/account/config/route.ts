import { getAuthConfigurationStatus } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(getAuthConfigurationStatus(), {
    headers: { 'Cache-Control': 'no-store' }
  })
}

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { accountSecurityRequest } from '@/lib/account-http'
import { accountSubject } from '@/lib/accounts'
import { cliKeyConfig, cliPermissions } from '@/lib/api-keys'
import { getAuth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { authApiKeys, authUsers } from '@/lib/db/schema'
import { AppError } from '@/lib/errors'
import { readJson } from '@/lib/http'
import { lockUsageSubjects } from '@/lib/usage'

export function GET(request: Request) {
  return accountSecurityRequest(request, async ({ userId }) => ({
    keys: await getDb()
      .select({
        id: authApiKeys.id,
        name: authApiKeys.name,
        start: authApiKeys.start,
        createdAt: authApiKeys.createdAt,
        lastRequest: authApiKeys.lastRequest,
        expiresAt: authApiKeys.expiresAt
      })
      .from(authApiKeys)
      .where(
        and(
          eq(authApiKeys.referenceId, userId),
          eq(authApiKeys.configId, cliKeyConfig)
        )
      ),
    permissions: cliPermissions
  }))
}

export function POST(request: Request) {
  return accountSecurityRequest(request, async ({ userId }) => {
    const input = z
      .strictObject({ name: z.string().trim().min(1).max(64) })
      .safeParse(await readJson(request))
    if (!input.success)
      throw new AppError('Give this API key a name of up to 64 characters.')
    return getDb().transaction(async (tx) => {
      await lockUsageSubjects(tx, accountSubject(userId))
      const [user] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, userId))
      if (!user || user.deletionRequestedAt)
        throw new AppError('This account is unavailable.', 403)
      const keys = await tx
        .select({ id: authApiKeys.id })
        .from(authApiKeys)
        .where(
          and(
            eq(authApiKeys.referenceId, userId),
            eq(authApiKeys.configId, cliKeyConfig)
          )
        )
      if (keys.length >= 10)
        throw new AppError(
          'Revoke an unused key before creating another. You can keep up to 10 keys.',
          409
        )
      const created = await getAuth().api.createApiKey({
        body: {
          configId: cliKeyConfig,
          userId,
          name: input.data.name,
          permissions: cliPermissions
        }
      })
      return { id: created.id, name: created.name, key: created.key }
    })
  })
}

export function DELETE(request: Request) {
  return accountSecurityRequest(request, async () => {
    const input = z
      .strictObject({ id: z.string().min(1).max(128) })
      .safeParse(await readJson(request))
    if (!input.success) throw new AppError('Choose an API key to revoke.')
    await getAuth().api.deleteApiKey({
      headers: request.headers,
      body: { configId: cliKeyConfig, keyId: input.data.id }
    })
    return { revoked: true }
  })
}

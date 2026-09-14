import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError } from 'better-auth/api'
import { anonymous } from 'better-auth/plugins'

import { appSecret, appUrl } from '@/lib/config'
import { getDb } from '@/lib/db'
import {
  authAccounts,
  authRateLimits,
  authSessions,
  authUsers,
  authVerifications
} from '@/lib/db/schema'
import { isEmailConfigured, sendAuthEmail } from '@/lib/email'

function authEnvironment() {
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim()
  if (configuredSecret && configuredSecret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must have at least 32 characters')
  }
  const secret = configuredSecret || appSecret()
  const url = new URL(process.env.BETTER_AUTH_URL?.trim() || appUrl())
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('BETTER_AUTH_URL must be an HTTP(S) origin')
  }
  if (!process.env.DATABASE_URL?.trim())
    throw new Error('DATABASE_URL is required')
  return { secret, baseURL: url.origin }
}

export type AuthConfigurationStatus = {
  available: boolean
  providers: { google: boolean; github: boolean }
  emailAndPassword: boolean
  emailVerification: boolean
  message?: string
}

/** Presence checks only: never create a database connection or return credentials. */
export function getAuthConfigurationStatus(): AuthConfigurationStatus {
  let available = true
  try {
    authEnvironment()
  } catch {
    available = false
  }
  const providers = {
    google:
      available &&
      Boolean(
        process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim()
      ),
    github:
      available &&
      Boolean(
        process.env.GITHUB_CLIENT_ID?.trim() &&
        process.env.GITHUB_CLIENT_SECRET?.trim()
      )
  }
  const emailAndPassword = available && isEmailConfigured()
  return {
    available,
    providers,
    emailAndPassword,
    emailVerification: emailAndPassword,
    ...(!available
      ? {
          message:
            'Accounts are temporarily unavailable. Please try again later.'
        }
      : !emailAndPassword && !providers.google && !providers.github
        ? {
            message:
              'Sign-in is not configured yet. You can still create a passage as a guest.'
          }
        : {})
  }
}

async function deliverEmail(input: Parameters<typeof sendAuthEmail>[0]) {
  try {
    await sendAuthEmail(input)
  } catch {
    throw new APIError('SERVICE_UNAVAILABLE', {
      code: 'EMAIL_DELIVERY_UNAVAILABLE',
      message: 'We could not send the email. Please try again later.'
    })
  }
}

function createAuth() {
  const environment = authEnvironment()
  const status = getAuthConfigurationStatus()
  const socialProviders: BetterAuthOptions['socialProviders'] = {}
  if (status.providers.google) {
    socialProviders.google = {
      clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      requireEmailVerification: true
    }
  }
  if (status.providers.github) {
    socialProviders.github = {
      clientId: process.env.GITHUB_CLIENT_ID!.trim(),
      clientSecret: process.env.GITHUB_CLIENT_SECRET!.trim(),
      requireEmailVerification: true
    }
  }
  return betterAuth({
    appName: 'Passage',
    ...environment,
    // Exercise the same origin validation in fixture tests and production.
    advanced: { disableOriginCheck: false },
    database: drizzleAdapter(getDb(), {
      provider: 'pg',
      transaction: true,
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        rateLimit: authRateLimits
      }
    }),
    // Keep Better Auth's security rules shared across Vercel instances.
    rateLimit: { storage: 'database' },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(
              session.userId
            )
            if (
              !user ||
              ('deletionRequestedAt' in user && user.deletionRequestedAt)
            ) {
              throw new APIError('UNAUTHORIZED', {
                code: 'ACCOUNT_UNAVAILABLE',
                message: 'This account is no longer available.'
              })
            }
          }
        }
      }
    },
    // Guest deletion is the post-merge plugin operation, not a standalone user action.
    disabledPaths: ['/delete-anonymous-user'],
    emailAndPassword: {
      enabled: status.emailAndPassword,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) =>
        deliverEmail({
          to: user.email,
          url,
          kind: 'password-reset'
        })
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) =>
        deliverEmail({
          to: user.email,
          url,
          kind: 'verification'
        })
    },
    socialProviders,
    user: {
      additionalFields: {
        deletionRequestedAt: { type: 'date', required: false, input: false }
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const { deleteAccountData } = await import('@/lib/accounts')
          await deleteAccountData(user.id)
        }
      }
    },
    plugins: [
      anonymous({
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          if (
            anonymousUser.user.id === newUser.user.id ||
            newUser.user.isAnonymous
          )
            return
          const { mergeGuestAccount } = await import('@/lib/accounts')
          await mergeGuestAccount(anonymousUser.user.id, newUser.user.id)
        }
      })
    ]
  })
}

let instance: ReturnType<typeof createAuth> | undefined

/** Importing auth during a build must not require runtime credentials or PostgreSQL. */
export function getAuth() {
  instance ??= createAuth()
  return instance
}

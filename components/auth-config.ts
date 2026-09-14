'use client'

import { useEffect, useState } from 'react'

export type AuthConfig = {
  available: boolean
  providers: { google: boolean; github: boolean }
  emailAndPassword: boolean
  emailVerification: boolean
  message?: string
}

export function useAuthConfig() {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    void fetch('/api/account/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Configuration unavailable')
        const result = (await response.json()) as AuthConfig
        if (active) setConfig(result)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [attempt])

  return {
    config,
    error,
    retry: () => {
      setError(false)
      setAttempt((value) => value + 1)
    }
  }
}

export function authErrorMessage(
  error: { code?: string; status?: number } | null | undefined
) {
  if (error?.status === 429)
    return 'Too many attempts. Please wait a little before trying again.'
  switch (error?.code) {
    case 'EMAIL_DELIVERY_UNAVAILABLE':
      return 'We couldn’t send the email. Please try again later.'
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
      return 'The email or password is incorrect. Please try again.'
    case 'EMAIL_NOT_VERIFIED':
      return 'Verify your email before signing in. You can request a new link below.'
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'This link has expired or has already been used. Request a new one.'
    case 'SESSION_EXPIRED':
    case 'SESSION_NOT_FRESH':
    case 'UNAUTHORIZED':
      return 'Please sign in again before making this change.'
    case 'FAILED_TO_UNLINK_LAST_ACCOUNT':
      return 'Keep at least one sign-in method connected to your account.'
    case 'ACCOUNT_ALREADY_LINKED':
      return 'That sign-in method is already connected to an account.'
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return 'Use a password between 8 and 128 characters.'
    default:
      return 'That didn’t go through. Please try again.'
  }
}

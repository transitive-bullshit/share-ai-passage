'use client'

import { ArrowLeft, ArrowRight, Check, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { authErrorMessage, useAuthConfig } from '@/components/auth-config'
import { BrandMark } from '@/components/brand-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { authClient } from '@/lib/auth-client'
import { useAccountSession } from '@/components/account-session'
import { authHref, safeReturnTo } from '@/lib/auth-navigation'
import { maxPasswordLength, minPasswordLength } from '@/lib/password-policy'

type AuthMode =
  | 'sign-in'
  | 'sign-up'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email'
type Props = {
  mode: AuthMode
  returnTo: string
  initialEmail?: string
  token?: string
  callbackError?: string
  verified?: boolean
  passwordReset?: boolean
  reauthenticate?: boolean
}

const copy = {
  'sign-in': {
    title: 'Welcome back.',
    description: 'Sign in to pick up where you left off.',
    submit: 'Sign in'
  },
  'sign-up': {
    title: 'Keep your best passages.',
    description:
      'Save drafts, find your shared passages, and bring your style with you.',
    submit: 'Create account'
  },
  'forgot-password': {
    title: 'Forgot your password?',
    description: 'We’ll email you a link to choose a new one.',
    submit: 'Send reset link'
  },
  'reset-password': {
    title: 'A fresh start.',
    description: 'Choose a new password for your Passage account.',
    submit: 'Save new password'
  },
  'verify-email': {
    title: 'Check your inbox.',
    description:
      'Verify your email to finish setting up your account and keep your passages together.',
    submit: 'Resend verification email'
  }
} satisfies Record<
  AuthMode,
  { title: string; description: string; submit: string }
>

function GitHubMark() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      aria-hidden='true'
      data-icon='inline-start'
    >
      <path d='M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z' />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg
      viewBox='0 0 24 24'
      fill='currentColor'
      aria-hidden='true'
      data-icon='inline-start'
    >
      <path d='M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.61 0-4.82-1.76-5.61-4.12H3.04v2.59A10 10 0 0 0 12 22ZM6.39 13.93A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.48H3.04A10 10 0 0 0 2 12c0 1.61.39 3.13 1.04 4.52l3.35-2.59ZM12 5.95c1.47 0 2.78.5 3.82 1.5l2.87-2.88C16.95 2.96 14.7 2 12 2a10 10 0 0 0-8.96 5.48l3.35 2.59A5.98 5.98 0 0 1 12 5.95Z' />
    </svg>
  )
}

export function AuthForm({
  mode,
  returnTo: rawReturnTo,
  initialEmail = '',
  token,
  callbackError,
  verified,
  passwordReset,
  reauthenticate
}: Props) {
  const router = useRouter()
  const { config, error: configError, retry } = useAuthConfig()
  const { data: session, isPending: sessionPending } = useAccountSession()
  const returnTo = safeReturnTo(rawReturnTo)
  const [email, setEmail] = useState(initialEmail)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState(
    callbackError
      ? 'This sign-in or email link could not be completed. Please try again or request a new link.'
      : ''
  )
  const [fieldError, setFieldError] = useState('')
  const [notice, setNotice] = useState(
    passwordReset
      ? 'Your password has been reset. Sign in with your new password.'
      : ''
  )
  const [needsVerification, setNeedsVerification] = useState(false)
  const entryMode = mode === 'sign-in' || mode === 'sign-up'
  const resetInvalid =
    mode === 'reset-password' && (!token || Boolean(callbackError))
  const signedIn = session?.user.emailVerified && !session.user.isAnonymous
  const verifiedHere = mode === 'verify-email' && signedIn
  const details = copy[mode]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      pending ||
      !config?.available ||
      !config.emailAndPassword ||
      resetInvalid
    )
      return
    setError('')
    setFieldError('')
    setNotice('')
    if (
      (mode === 'sign-up' || mode === 'reset-password') &&
      password !== confirmation
    ) {
      setFieldError('The passwords don’t match.')
      return
    }
    setPending('email')
    try {
      if (mode === 'sign-in') {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: returnTo
        })
        if (result.error) {
          setNeedsVerification(result.error.code === 'EMAIL_NOT_VERIFIED')
          setError(authErrorMessage(result.error))
        } else {
          router.replace(returnTo)
          router.refresh()
        }
      } else if (mode === 'sign-up') {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: authHref('/verify-email', returnTo, { verified: '1' })
        })
        if (result.error) setError(authErrorMessage(result.error))
        else
          router.replace(
            authHref('/verify-email', returnTo, { email: email.trim() })
          )
      } else if (mode === 'forgot-password') {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: authHref('/reset-password', returnTo)
        })
        if (result.error) setError(authErrorMessage(result.error))
        else
          setNotice(
            'If an account uses this email, a reset link is on its way. Check your inbox and spam folder.'
          )
      } else if (mode === 'reset-password') {
        const result = await authClient.resetPassword({
          newPassword: password,
          token
        })
        if (result.error) setError(authErrorMessage(result.error))
        else
          router.replace(authHref('/sign-in', returnTo, { passwordReset: '1' }))
      } else {
        const result = await authClient.sendVerificationEmail({
          email: email.trim(),
          callbackURL: authHref('/verify-email', returnTo, { verified: '1' })
        })
        if (result.error) setError(authErrorMessage(result.error))
        else
          setNotice(
            'If this account still needs verification, a new link is on its way. Check your inbox and spam folder.'
          )
      }
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }

  async function social(provider: 'google' | 'github') {
    if (pending || !config?.available || !config.providers[provider]) return
    setPending(provider)
    setError('')
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: returnTo,
        errorCallbackURL: authHref(`/${mode}`, returnTo)
      })
      if (result.error) setError(authErrorMessage(result.error))
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }

  return (
    <main id='main' className='auth-page'>
      <section className='auth-panel' aria-labelledby='auth-title'>
        <BrandMark size={36} className='auth-mark' />
        <div className='auth-heading'>
          <h1 id='auth-title'>
            {verifiedHere ? 'You’re all set.' : details.title}
          </h1>
          <p>
            {verifiedHere
              ? 'Your email is verified. Your passages are ready when you are.'
              : details.description}
          </p>
        </div>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert role='status'>
            <Check aria-hidden='true' />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {verifiedHere ? (
          <Button asChild size='lg'>
            <a href={returnTo}>
              Continue to your passages
              <ArrowRight data-icon='inline-end' />
            </a>
          </Button>
        ) : signedIn && entryMode && !reauthenticate ? (
          <div className='auth-success'>
            <p>You’re signed in as {session.user.email}.</p>
            <Button asChild size='lg'>
              <a href={returnTo}>
                Continue
                <ArrowRight data-icon='inline-end' />
              </a>
            </Button>
          </div>
        ) : resetInvalid ? (
          <div className='auth-success'>
            <p>This password reset link has expired or is incomplete.</p>
            <Button asChild size='lg'>
              <a href={authHref('/forgot-password', returnTo)}>
                Request a new reset link
              </a>
            </Button>
          </div>
        ) : (
          <>
            {configError ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  Sign-in options couldn’t load.{' '}
                  <button
                    type='button'
                    className='auth-text-link'
                    onClick={retry}
                  >
                    Try again
                  </button>
                  .
                </AlertDescription>
              </Alert>
            ) : config && !config.available ? (
              <Alert>
                <AlertDescription>
                  Accounts are being set up. You can still create a passage
                  without signing in.
                </AlertDescription>
              </Alert>
            ) : !config ? (
              <p className='auth-loading'>
                <Spinner />
                Loading sign-in options…
              </p>
            ) : null}
            {entryMode && (
              <>
                <div className='auth-providers'>
                  {(['google', 'github'] as const).map((provider) => (
                    <Button
                      key={provider}
                      type='button'
                      variant='outline'
                      size='lg'
                      disabled={
                        Boolean(pending) ||
                        !config?.available ||
                        !config.providers[provider]
                      }
                      onClick={() => void social(provider)}
                    >
                      {pending === provider ? (
                        <Spinner data-icon='inline-start' />
                      ) : provider === 'google' ? (
                        <GoogleMark />
                      ) : (
                        <GitHubMark />
                      )}
                      {provider === 'google' ? 'Google' : 'GitHub'}
                      {config && !config.providers[provider] && (
                        <span className='auth-provider-note'>Unavailable</span>
                      )}
                    </Button>
                  ))}
                </div>
                <div className='auth-divider'>
                  <Separator />
                  <span>or use email</span>
                  <Separator />
                </div>
              </>
            )}
            {mode === 'verify-email' &&
              verified &&
              !sessionPending &&
              !signedIn && (
                <Alert>
                  <Mail aria-hidden='true' />
                  <AlertDescription>
                    Follow the link in your email, then sign in to continue.
                  </AlertDescription>
                </Alert>
              )}
            <form
              onSubmit={(event) => void submit(event)}
              className='auth-form'
            >
              <FieldGroup>
                {mode === 'sign-up' && (
                  <Field>
                    <FieldLabel htmlFor='auth-name'>Name</FieldLabel>
                    <Input
                      id='auth-name'
                      name='name'
                      autoComplete='name'
                      required
                      maxLength={100}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      disabled={Boolean(pending)}
                    />
                  </Field>
                )}
                {mode !== 'reset-password' && (
                  <Field>
                    <FieldLabel htmlFor='auth-email'>Email</FieldLabel>
                    <Input
                      id='auth-email'
                      name='email'
                      type='email'
                      autoComplete='email'
                      required
                      maxLength={254}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={Boolean(pending)}
                    />
                  </Field>
                )}
                {(entryMode || mode === 'reset-password') && (
                  <Field>
                    <div className='auth-label-row'>
                      <FieldLabel htmlFor='auth-password'>
                        {mode === 'reset-password'
                          ? 'New password'
                          : 'Password'}
                      </FieldLabel>
                      {mode === 'sign-in' && (
                        <a
                          href={authHref(
                            '/forgot-password',
                            returnTo,
                            email ? { email } : {}
                          )}
                        >
                          Forgot password?
                        </a>
                      )}
                    </div>
                    <Input
                      id='auth-password'
                      name='password'
                      type='password'
                      autoComplete={
                        mode === 'sign-in' ? 'current-password' : 'new-password'
                      }
                      required
                      minLength={
                        mode === 'sign-in' ? undefined : minPasswordLength
                      }
                      maxLength={maxPasswordLength}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={Boolean(pending)}
                    />
                    {mode !== 'sign-in' && (
                      <FieldDescription>
                        Use at least {minPasswordLength} characters.
                      </FieldDescription>
                    )}
                  </Field>
                )}
                {(mode === 'sign-up' || mode === 'reset-password') && (
                  <Field data-invalid={Boolean(fieldError)}>
                    <FieldLabel htmlFor='auth-confirmation'>
                      Confirm password
                    </FieldLabel>
                    <Input
                      id='auth-confirmation'
                      name='confirmation'
                      type='password'
                      autoComplete='new-password'
                      required
                      maxLength={maxPasswordLength}
                      value={confirmation}
                      onChange={(event) => {
                        setConfirmation(event.target.value)
                        setFieldError('')
                      }}
                      disabled={Boolean(pending)}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={
                        fieldError ? 'auth-password-error' : undefined
                      }
                    />
                    <FieldError id='auth-password-error'>
                      {fieldError}
                    </FieldError>
                  </Field>
                )}
                <Button
                  type='submit'
                  size='lg'
                  disabled={
                    Boolean(pending) ||
                    !config?.available ||
                    !config.emailAndPassword
                  }
                >
                  {pending === 'email' && <Spinner data-icon='inline-start' />}
                  {details.submit}
                </Button>
              </FieldGroup>
            </form>
            {config?.available && !config.emailAndPassword && (
              <p className='auth-footnote'>
                Email sign-in is unavailable while email delivery is being set
                up.
              </p>
            )}
            {needsVerification && (
              <a
                className='auth-text-link'
                href={authHref('/verify-email', returnTo, { email })}
              >
                Send a verification email
              </a>
            )}
          </>
        )}
        <div className='auth-links'>
          {mode === 'sign-in' ? (
            <p>
              New to Passage?{' '}
              <a href={authHref('/sign-up', returnTo)}>Create an account</a>
            </p>
          ) : mode === 'sign-up' ? (
            <p>
              Already have an account?{' '}
              <a href={authHref('/sign-in', returnTo)}>Sign in</a>
            </p>
          ) : (
            <a href={authHref('/sign-in', returnTo)}>
              <ArrowLeft aria-hidden='true' />
              Back to sign in
            </a>
          )}
          <a
            className='auth-guest-link'
            href={returnTo.startsWith('/?draft=') ? returnTo : '/'}
          >
            Continue without an account
          </a>
        </div>
      </section>
    </main>
  )
}

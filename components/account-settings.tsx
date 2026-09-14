'use client'

import { ArrowRight, Check, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'

import { authErrorMessage, useAuthConfig } from '@/components/auth-config'
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
import { authHref } from '@/lib/auth-navigation'
import { maxPasswordLength, minPasswordLength } from '@/lib/password-policy'

type User = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  isAnonymous?: boolean | null
}
type LinkedAccount = { id: string; providerId: string }

export function AccountSettings({ callbackError }: { callbackError?: string }) {
  const { data: session, isPending, error, refetch } = useAccountSession()
  if (isPending)
    return (
      <main id='main' className='account-page'>
        <p className='auth-loading'>
          <Spinner />
          Loading your account…
        </p>
      </main>
    )
  if (error)
    return (
      <main id='main' className='account-page'>
        <Alert variant='destructive'>
          <AlertDescription>
            Your account couldn’t load.{' '}
            <button className='auth-text-link' onClick={() => void refetch()}>
              Try again
            </button>
            .
          </AlertDescription>
        </Alert>
      </main>
    )
  if (!session || session.user.isAnonymous)
    return (
      <main id='main' className='account-page'>
        <div className='account-heading'>
          <p className='account-eyebrow'>Your account</p>
          <h1>A home for your passages.</h1>
          <p>
            Sign in to save your drafts, find your shared passages, and sync
            your preferred style.
          </p>
        </div>
        <Button asChild size='lg'>
          <a href={authHref('/sign-in', '/account')}>
            Sign in
            <ArrowRight data-icon='inline-end' />
          </a>
        </Button>
      </main>
    )
  if (!session.user.emailVerified)
    return (
      <main id='main' className='account-page'>
        <div className='account-heading'>
          <h1>Verify your email.</h1>
          <p>Check your inbox to finish setting up your Passage account.</p>
        </div>
        <Button asChild>
          <a
            href={authHref('/verify-email', '/account', {
              email: session.user.email
            })}
          >
            Send a verification link
          </a>
        </Button>
      </main>
    )
  return (
    <AccountDetails
      key={session.user.id}
      user={session.user}
      callbackError={callbackError}
    />
  )
}

function AccountDetails({
  user,
  callbackError
}: {
  user: User
  callbackError?: string
}) {
  const router = useRouter()
  const { config, error: configError, retry: retryConfig } = useAuthConfig()
  const [name, setName] = useState(user.name)
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null)
  const [accountsError, setAccountsError] = useState(false)
  const [accountsAttempt, setAccountsAttempt] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState(
    callbackError
      ? 'That sign-in method couldn’t be connected. Please try again.'
      : ''
  )
  const [notice, setNotice] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const hasPassword = Boolean(
    accounts?.some((account) => account.providerId === 'credential')
  )
  const reauthenticate = authHref('/sign-in', '/account', { reauth: '1' })

  useEffect(() => {
    let active = true
    void authClient
      .listAccounts()
      .then((result) => {
        if (!active) return
        if (result.error) setAccountsError(true)
        else setAccounts(result.data)
      })
      .catch(() => {
        if (active) setAccountsError(true)
      })
    return () => {
      active = false
    }
  }, [accountsAttempt])

  async function run(
    action: string,
    request: () => Promise<{
      error?: { code?: string; status?: number } | null
    }>,
    success: () => void
  ) {
    if (pending) return
    setPending(action)
    setError('')
    setNotice('')
    try {
      const result = await request()
      if (result.error) setError(authErrorMessage(result.error))
      else success()
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      setPending(null)
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    void run(
      'profile',
      () => authClient.updateUser({ name: name.trim() }),
      () => {
        setName(name.trim())
        setNotice('Your account details are saved.')
        router.refresh()
      }
    )
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFieldError('')
    if (password !== confirmation) {
      setFieldError('The passwords don’t match.')
      return
    }
    void run(
      'password',
      () =>
        authClient.changePassword({
          currentPassword,
          newPassword: password,
          revokeOtherSessions: true
        }),
      () => {
        setCurrentPassword('')
        setPassword('')
        setConfirmation('')
        setNotice(
          'Your password is updated. Other sessions have been signed out.'
        )
      }
    )
  }

  function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      deleteConfirmation !== 'delete' ||
      !accounts ||
      (hasPassword && !deletePassword)
    )
      return
    void run(
      'delete',
      () =>
        authClient.deleteUser({
          password: hasPassword ? deletePassword : undefined,
          callbackURL: '/'
        }),
      () => {
        router.replace('/?accountDeleted=1')
        router.refresh()
      }
    )
  }

  return (
    <main id='main' className='account-page'>
      <div className='account-heading'>
        <p className='account-eyebrow'>Your account</p>
        <h1>Make yourself at home.</h1>
        <p>Manage your details and how you sign in.</p>
      </div>
      <div className='account-overview'>
        <div>
          <strong>Free account</strong>
          <p>
            Your drafts, shared passages, and preferred card style stay with
            your account.
          </p>
        </div>
        <Button asChild variant='outline'>
          <a href='/passages'>
            My passages
            <ArrowRight data-icon='inline-end' />
          </a>
        </Button>
      </div>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>
            {error}
            {error === 'Please sign in again before making this change.' && (
              <>
                {' '}
                <a className='auth-text-link' href={reauthenticate}>
                  Sign in again
                </a>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert role='status'>
          <Check aria-hidden='true' />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <section
        className='account-section'
        aria-labelledby='account-profile-title'
      >
        <div className='account-section-heading'>
          <h2 id='account-profile-title'>Account details</h2>
          <p>The name associated with your account.</p>
        </div>
        <form onSubmit={saveProfile} className='account-section-content'>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor='account-name'>Name</FieldLabel>
              <Input
                id='account-name'
                name='name'
                autoComplete='name'
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={Boolean(pending)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='account-email'>Email</FieldLabel>
              <Input
                id='account-email'
                type='email'
                value={user.email}
                readOnly
              />
              <FieldDescription>Your verified sign-in email.</FieldDescription>
            </Field>
            <div>
              <Button type='submit' disabled={Boolean(pending) || !name.trim()}>
                {pending === 'profile' && <Spinner data-icon='inline-start' />}
                Save details
              </Button>
            </div>
          </FieldGroup>
        </form>
      </section>
      <Separator />
      <section
        className='account-section'
        aria-labelledby='account-security-title'
      >
        <div className='account-section-heading'>
          <h2 id='account-security-title'>Sign-in methods</h2>
          <p>
            Keep at least one method connected so you can always get back in.
          </p>
        </div>
        <div className='account-section-content'>
          {accountsError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                Sign-in methods couldn’t load.{' '}
                <button
                  type='button'
                  className='auth-text-link'
                  onClick={() => {
                    setAccountsError(false)
                    setAccountsAttempt((value) => value + 1)
                  }}
                >
                  Try again
                </button>
                .
              </AlertDescription>
            </Alert>
          ) : !accounts ? (
            <p className='auth-loading'>
              <Spinner />
              Loading sign-in methods…
            </p>
          ) : (
            <>
              <div className='account-method'>
                <div>
                  <strong>Email and password</strong>
                  <p>
                    {hasPassword
                      ? 'Connected'
                      : 'Set a password using a secure email link.'}
                  </p>
                </div>
                {!hasPassword && (
                  <Button
                    variant='outline'
                    type='button'
                    disabled={Boolean(pending) || !config?.emailAndPassword}
                    onClick={() =>
                      void run(
                        'set-password',
                        () =>
                          authClient.requestPasswordReset({
                            email: user.email,
                            redirectTo: authHref('/reset-password', '/account')
                          }),
                        () =>
                          setNotice(
                            'A link to set your password is on its way. Check your inbox and spam folder.'
                          )
                      )
                    }
                  >
                    {pending === 'set-password' && (
                      <Spinner data-icon='inline-start' />
                    )}
                    Set password
                  </Button>
                )}
              </div>
              {(['google', 'github'] as const).map((provider) => {
                const linked = accounts.find(
                  (account) => account.providerId === provider
                )
                const label = provider === 'google' ? 'Google' : 'GitHub'
                return (
                  <div key={provider} className='account-method'>
                    <div>
                      <strong>{label}</strong>
                      <p>
                        {linked
                          ? 'Connected'
                          : config?.providers[provider]
                            ? 'Not connected'
                            : 'Currently unavailable'}
                      </p>
                    </div>
                    <Button
                      variant='outline'
                      type='button'
                      disabled={
                        Boolean(pending) ||
                        (linked
                          ? accounts.length <= 1
                          : !config?.providers[provider])
                      }
                      onClick={() =>
                        void run(
                          provider,
                          () =>
                            linked
                              ? authClient.unlinkAccount({
                                  accountId: linked.id
                                })
                              : authClient.linkSocial({
                                  provider,
                                  callbackURL: '/account',
                                  errorCallbackURL: '/account'
                                }),
                          () => {
                            if (linked) {
                              setAccounts(
                                (current) =>
                                  current?.filter(
                                    (account) => account.id !== linked.id
                                  ) ?? null
                              )
                              setNotice(`${label} has been disconnected.`)
                            }
                          }
                        )
                      }
                    >
                      {pending === provider && (
                        <Spinner data-icon='inline-start' />
                      )}
                      {linked ? 'Disconnect' : 'Connect'}
                    </Button>
                  </div>
                )
              })}
            </>
          )}
          {configError && (
            <p className='auth-footnote'>
              Available sign-in options couldn’t load.{' '}
              <button
                type='button'
                className='auth-text-link'
                onClick={retryConfig}
              >
                Try again
              </button>
              .
            </p>
          )}
          {accounts && accounts.length === 1 && (
            <p className='auth-footnote'>
              Your last sign-in method stays connected.
            </p>
          )}
        </div>
      </section>
      {hasPassword && (
        <>
          <Separator />
          <section
            className='account-section'
            aria-labelledby='account-password-title'
          >
            <div className='account-section-heading'>
              <h2 id='account-password-title'>Password</h2>
              <p>Changing your password signs out your other sessions.</p>
              <a
                className='auth-text-link'
                href={authHref('/forgot-password', '/account', {
                  email: user.email
                })}
              >
                Forgot your password?
              </a>
            </div>
            <form onSubmit={changePassword} className='account-section-content'>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor='account-current-password'>
                    Current password
                  </FieldLabel>
                  <Input
                    id='account-current-password'
                    name='current-password'
                    type='password'
                    autoComplete='current-password'
                    required
                    maxLength={maxPasswordLength}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    disabled={Boolean(pending)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor='account-new-password'>
                    New password
                  </FieldLabel>
                  <Input
                    id='account-new-password'
                    name='new-password'
                    type='password'
                    autoComplete='new-password'
                    required
                    minLength={minPasswordLength}
                    maxLength={maxPasswordLength}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={Boolean(pending)}
                  />
                  <FieldDescription>
                    Use at least {minPasswordLength} characters.
                  </FieldDescription>
                </Field>
                <Field data-invalid={Boolean(fieldError)}>
                  <FieldLabel htmlFor='account-confirm-password'>
                    Confirm new password
                  </FieldLabel>
                  <Input
                    id='account-confirm-password'
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
                      fieldError ? 'account-password-error' : undefined
                    }
                  />
                  <FieldError id='account-password-error'>
                    {fieldError}
                  </FieldError>
                </Field>
                <div>
                  <Button type='submit' disabled={Boolean(pending)}>
                    {pending === 'password' && (
                      <Spinner data-icon='inline-start' />
                    )}
                    Update password
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </section>
        </>
      )}
      <Separator />
      <section
        className='account-section'
        aria-labelledby='account-session-title'
      >
        <div className='account-section-heading'>
          <h2 id='account-session-title'>This session</h2>
          <p>Your saved passages will be here when you return.</p>
        </div>
        <div className='account-section-content'>
          <Button
            variant='outline'
            type='button'
            disabled={Boolean(pending)}
            onClick={() =>
              void run(
                'sign-out',
                () => authClient.signOut(),
                () => {
                  router.replace('/')
                  router.refresh()
                }
              )
            }
          >
            {pending === 'sign-out' ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <LogOut data-icon='inline-start' />
            )}
            Sign out
          </Button>
        </div>
      </section>
      <Separator />
      <section
        className='account-section account-danger'
        aria-labelledby='account-delete-title'
      >
        <div className='account-section-heading'>
          <h2 id='account-delete-title'>Delete account</h2>
          <p>
            Permanently delete your account and saved drafts. Your published
            passages will become unavailable.
          </p>
        </div>
        <div className='account-section-content'>
          {deleteOpen ? (
            <form onSubmit={deleteAccount}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor='account-delete-confirm'>
                    Type “delete” to confirm
                  </FieldLabel>
                  <Input
                    id='account-delete-confirm'
                    name='confirmation'
                    autoComplete='off'
                    value={deleteConfirmation}
                    onChange={(event) =>
                      setDeleteConfirmation(event.target.value)
                    }
                    disabled={Boolean(pending)}
                    required
                  />
                </Field>
                {hasPassword ? (
                  <Field>
                    <FieldLabel htmlFor='account-delete-password'>
                      Current password
                    </FieldLabel>
                    <Input
                      id='account-delete-password'
                      name='password'
                      type='password'
                      autoComplete='current-password'
                      value={deletePassword}
                      onChange={(event) =>
                        setDeletePassword(event.target.value)
                      }
                      disabled={Boolean(pending)}
                      required
                    />
                  </Field>
                ) : (
                  <FieldDescription>
                    You may need to <a href={reauthenticate}>sign in again</a>{' '}
                    to confirm this change.
                  </FieldDescription>
                )}
                <div className='account-actions'>
                  <Button
                    variant='destructive'
                    type='submit'
                    disabled={
                      Boolean(pending) ||
                      !accounts ||
                      deleteConfirmation !== 'delete' ||
                      (hasPassword && !deletePassword)
                    }
                  >
                    {pending === 'delete' && (
                      <Spinner data-icon='inline-start' />
                    )}
                    Permanently delete account
                  </Button>
                  <Button
                    variant='ghost'
                    type='button'
                    disabled={Boolean(pending)}
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeleteConfirmation('')
                      setDeletePassword('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </form>
          ) : (
            <Button
              variant='outline'
              type='button'
              disabled={Boolean(pending) || !accounts}
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          )}
        </div>
      </section>
    </main>
  )
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isEmailConfigured,
  sendAuthEmail,
  withEmailDeliveryStatus
} from '@/lib/email'

import type { Resend } from 'resend'

const { send } = vi.hoisted(() => ({
  send: vi.fn<
    (input: Parameters<Resend['emails']['send']>[0]) => Promise<unknown>
  >()
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  }
}))

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'fixture-api-key')
  vi.stubEnv('EMAIL_FROM', 'Passage <hello@accounts.example.com>')
  send
    .mockReset()
    .mockResolvedValue({ data: { id: 'fixture-email' }, error: null })
})

afterEach(() => vi.unstubAllEnvs())

describe('transactional account email', () => {
  it('waits for delivery acceptance and provides an escaped HTML link plus plain text', async () => {
    const url =
      'https://passage.example/api/auth/verify-email?token=fixture&callbackURL=%2Fpassages'
    let accept: (value: unknown) => void = () => {}
    send.mockReturnValue(
      new Promise((resolve) => {
        accept = resolve
      })
    )
    let finished = false
    const delivery = sendAuthEmail({
      to: 'reader@example.com',
      url,
      kind: 'verification'
    }).then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    accept({ data: { id: 'fixture-email' }, error: null })
    await delivery
    expect(finished).toBe(true)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Passage <hello@accounts.example.com>',
        to: 'reader@example.com',
        subject: 'Verify your email for Passage',
        text: expect.stringContaining(url),
        html: expect.stringContaining('token=fixture&amp;callbackURL=')
      })
    )
  })

  it('does not send or report success without a configured sender', async () => {
    vi.stubEnv('EMAIL_FROM', '')
    expect(isEmailConfigured()).toBe(false)
    await expect(
      sendAuthEmail({
        to: 'reader@example.com',
        url: 'https://passage.example/reset',
        kind: 'password-reset'
      })
    ).rejects.toThrow('We could not send the email')
    expect(send).not.toHaveBeenCalled()
  })

  it('isolates delivery failures across concurrent auth requests', async () => {
    send.mockRejectedValueOnce(new Error('fixture delivery failure'))
    const input = {
      to: 'reader@example.com',
      url: 'https://passage.example/verify',
      kind: 'verification' as const
    }
    const [failed, successful] = await Promise.all([
      withEmailDeliveryStatus(() =>
        sendAuthEmail(input).catch(() => undefined)
      ),
      withEmailDeliveryStatus(() => sendAuthEmail(input))
    ])
    expect(failed.failed).toBe(true)
    expect(successful.failed).toBe(false)
  })

  it.each(['provider-error', 'network-error', 'missing-receipt'])(
    'sanitizes %s without exposing email links or credentials',
    async (failure) => {
      if (failure === 'provider-error')
        send.mockResolvedValue({
          error: { message: 'private-token' },
          data: null
        })
      if (failure === 'network-error')
        send.mockRejectedValue(new Error('private-token'))
      if (failure === 'missing-receipt')
        send.mockResolvedValue({ data: null, error: null })
      await expect(
        sendAuthEmail({
          to: 'reader@example.com',
          url: 'https://passage.example/private-token',
          kind: 'password-reset'
        })
      ).rejects.toEqual(
        expect.objectContaining({
          message: 'We could not send the email. Please try again later.'
        })
      )
    }
  )
})

it('uses the provisioned Resend sender and reply address ahead of compatibility aliases', async () => {
  vi.stubEnv('RESEND_FROM_EMAIL', 'Passage <hello@accounts.passage.example>')
  vi.stubEnv('RESEND_REPLY_TO', 'support@passage.example')
  expect(isEmailConfigured()).toBe(true)
  await sendAuthEmail({
    to: 'reader@example.com',
    url: 'https://passage.example/verify-email?token=fixture',
    kind: 'verification'
  })
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      from: 'Passage <hello@accounts.passage.example>',
      replyTo: 'support@passage.example'
    })
  )
})

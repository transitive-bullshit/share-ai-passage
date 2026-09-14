import { AsyncLocalStorage } from 'node:async_hooks'

import { Resend } from 'resend'

const deliveryContext = new AsyncLocalStorage<{ failed: boolean }>()

/** Report delivery failure at the HTTP boundary even when an auth callback catches it. */
export async function withEmailDeliveryStatus<T>(operation: () => Promise<T>) {
  const state = { failed: false }
  return deliveryContext.run(state, async () => ({
    value: await operation(),
    failed: state.failed
  }))
}

function emailFrom() {
  return process.env.RESEND_FROM_EMAIL?.trim() || process.env.EMAIL_FROM?.trim()
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && emailFrom())
}

export class EmailDeliveryError extends Error {
  constructor() {
    super('We could not send the email. Please try again later.')
    this.name = 'EmailDeliveryError'
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return replacements[character as keyof typeof replacements]
  })
}

/** Await delivery acceptance so a stopped serverless request cannot drop the email. */
export async function sendAuthEmail(input: {
  to: string
  url: string
  kind: 'verification' | 'password-reset'
}) {
  if (!isEmailConfigured()) {
    const state = deliveryContext.getStore()
    if (state) state.failed = true
    throw new EmailDeliveryError()
  }
  const verification = input.kind === 'verification'
  const title = verification
    ? 'Verify your email for Passage'
    : 'Reset your Passage password'
  const action = verification ? 'Verify email' : 'Reset password'
  const explanation = verification
    ? 'Verify your email to save your passages and preferences to your account.'
    : 'Use this link to choose a new password for your Passage account.'
  const ignored = verification
    ? 'If you did not create a Passage account, you can ignore this email.'
    : 'If you did not request a password reset, you can ignore this email. Your password will stay the same.'

  try {
    const resend = new Resend(process.env.RESEND_API_KEY!.trim())
    const result = await resend.emails.send({
      from: emailFrom()!,
      to: input.to,
      replyTo:
        process.env.RESEND_REPLY_TO?.trim() ||
        process.env.EMAIL_REPLY_TO?.trim() ||
        undefined,
      subject: title,
      text: `${title}\n\n${explanation}\n\n${action}: ${input.url}\n\n${ignored}\n\nPassage — Good conversations deserve to travel.`,
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#171717;max-width:520px;margin:32px auto;padding:24px"><p style="font-size:20px;font-weight:600;letter-spacing:-0.5px">Passage</p><h1 style="font-size:24px;font-weight:500">${title}</h1><p style="line-height:1.7">${explanation}</p><p style="margin:28px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:24px">${action}</a></p><p style="color:#737373;font-size:14px;line-height:1.7">${ignored}</p><p style="color:#737373;font-size:13px;border-top:1px solid #e8e8e8;padding-top:20px">Good conversations deserve to travel.</p></div>`
    })
    if (result.error || !result.data?.id) throw new EmailDeliveryError()
  } catch {
    // Provider errors may contain request details; never expose email links or tokens.
    const state = deliveryContext.getStore()
    if (state) state.failed = true
    throw new EmailDeliveryError()
  }
}

import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

import { Resend } from 'resend'

import type { BillingEmailMessage } from './billing-email-policy'

export type TransactionalEmailPayload = {
  to: string
  from: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

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

  await deliverEmail({
    to: input.to,
    subject: title,
    text: `${title}\n\n${explanation}\n\n${action}: ${input.url}\n\n${ignored}\n\nPassage — Good conversations deserve to travel.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#171717;max-width:520px;margin:32px auto;padding:24px"><p style="font-size:20px;font-weight:600;letter-spacing:-0.5px">Passage</p><h1 style="font-size:24px;font-weight:500">${title}</h1><p style="line-height:1.7">${explanation}</p><p style="margin:28px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:24px">${action}</a></p><p style="color:#737373;font-size:14px;line-height:1.7">${ignored}</p><p style="color:#737373;font-size:13px;border-top:1px solid #e8e8e8;padding-top:20px">Good conversations deserve to travel.</p></div>`
  })
}

/** Uses the same sender and delivery-error handling as account email. */
export function sendOperationsEmail(input: {
  to: string
  text: string
  idempotencyKey: string
}) {
  // Bind the recipient and sender configuration too, without exposing them in reports.
  const to = input.to.trim().toLowerCase()
  const key = createHash('sha256')
    .update(
      JSON.stringify({
        digest: input.idempotencyKey,
        to,
        from: emailFrom(),
        replyTo:
          process.env.RESEND_REPLY_TO?.trim() ||
          process.env.EMAIL_REPLY_TO?.trim()
      })
    )
    .digest('hex')
  return deliverEmail(
    {
      to,
      subject: 'Passage operations need attention',
      text: input.text
    },
    `passage-operations/${key}`
  )
}

/** Freeze the complete payload before the first send so retries remain identical. */
export function prepareSubscriptionEmail(
  to: string,
  message: BillingEmailMessage
): TransactionalEmailPayload {
  if (!isEmailConfigured()) throw new EmailDeliveryError()
  const { subject, paragraphs, billingUrl } = message
  return {
    to,
    from: emailFrom()!,
    replyTo:
      process.env.RESEND_REPLY_TO?.trim() ||
      process.env.EMAIL_REPLY_TO?.trim() ||
      undefined,
    subject,
    text: `${subject}\n\n${paragraphs.join('\n\n')}\n\nPlans and billing: ${billingUrl}\n\nPassage — Good conversations deserve to travel.`,
    html: `<div style="font-family:Inter,Arial,sans-serif;color:#171717;max-width:520px;margin:32px auto;padding:24px"><p style="font-size:20px;font-weight:600;letter-spacing:-0.5px">Passage</p><h1 style="font-size:24px;font-weight:500">${escapeHtml(subject)}</h1>${paragraphs.map((paragraph) => `<p style="line-height:1.7">${escapeHtml(paragraph)}</p>`).join('')}<p style="margin:28px 0"><a href="${escapeHtml(billingUrl)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:24px">Plans and billing</a></p><p style="color:#737373;font-size:13px;border-top:1px solid #e8e8e8;padding-top:20px">Good conversations deserve to travel.</p></div>`
  }
}

export function sendSubscriptionEmail(
  payload: TransactionalEmailPayload,
  id: string
) {
  return deliverEmail(payload, `passage-subscription/${id}`, payload)
}

async function deliverEmail(
  input: {
    to: string
    subject: string
    text: string
    html?: string
  },
  idempotencyKey?: string,
  frozenSender?: TransactionalEmailPayload
) {
  if (!isEmailConfigured()) {
    const state = deliveryContext.getStore()
    if (state && !frozenSender) state.failed = true
    throw new EmailDeliveryError()
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY!.trim())
    const payload = {
      ...input,
      from: frozenSender?.from ?? emailFrom()!,
      replyTo: frozenSender
        ? frozenSender.replyTo
        : process.env.RESEND_REPLY_TO?.trim() ||
          process.env.EMAIL_REPLY_TO?.trim() ||
          undefined
    }
    // The pinned SDK forwards request options to fetch; bound billing retries.
    const options = frozenSender
      ? { idempotencyKey, signal: AbortSignal.timeout(10_000) }
      : { idempotencyKey }
    const result = idempotencyKey
      ? await resend.emails.send(payload, options)
      : await resend.emails.send(payload)
    if (result.error || !result.data?.id) throw new EmailDeliveryError()
  } catch {
    // Provider errors may contain request details; never expose recipients, links or tokens.
    const state = deliveryContext.getStore()
    if (state && !frozenSender) state.failed = true
    throw new EmailDeliveryError()
  }
}

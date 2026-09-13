import { z } from 'zod'

import {
  type ExtractedConversation,
  type GeneratedPreview,
  type Message,
  limits,
  summaryRecommendations
} from './domain'
import { messageText } from './messages'

const invalidUnicode = /[\uD800-\uDFFF]/u

export function normalizeSummaryText(text: string) {
  return text.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

function summaryText(limit: number, label: string, optional = false) {
  return (
    z
      .string()
      .min(optional ? 0 : 1, `Enter a ${label}.`)
      // Zod counts UTF-16 units; the refinement applies the Unicode limit.
      .max(limit * 2, `Keep your ${label} within ${limit} characters.`)
      .refine((text) => {
        const normalized = normalizeSummaryText(text)
        return (
          (optional || normalized.length > 0) &&
          !invalidUnicode.test(normalized) &&
          !Array.from(normalized).some((character) => {
            const point = character.codePointAt(0)!
            return point < 0x20 || point === 0x7f
          })
        )
      }, `Enter a ${label} containing valid text.`)
      .refine(
        (text) => Array.from(normalizeSummaryText(text)).length <= limit,
        `Keep your ${label} within ${limit} characters.`
      )
      // JSON Schema counts Unicode characters, unlike Zod's UTF-16 bound
      // above. Advertise the same limit that our final validation enforces.
      .meta({ maxLength: limit })
  )
}

export const generatedPreviewSchema = z
  .strictObject({
    title: summaryText(limits.title, 'title').describe(
      `A specific, concise title. Aim for ${summaryRecommendations.titleWords} words or fewer, with the most distinctive terms first. ${limits.title} Unicode characters is the abuse-prevention ceiling, not a target.`
    ),
    highlights: z
      .array(
        summaryText(limits.highlight, 'highlight', true).describe(
          `A concise paraphrased takeaway, ideally within ${summaryRecommendations.highlight} characters. Hard ceiling: ${limits.highlight} Unicode characters.`
        )
      )
      .max(
        limits.highlights,
        `Include at most ${limits.highlights} highlights.`
      )
      .describe(
        'Up to three distinct takeaways. Use one for a short source, or none when highlights would only repeat the title.'
      )
  })
  .refine(({ highlights }) => {
    const normalized = highlights
      .map((text) => normalizeSummaryText(text).toLowerCase())
      .filter(Boolean)
    return new Set(normalized).size === normalized.length
  }, 'Use distinct highlights.')

export function parseGeneratedPreview(input: unknown) {
  let candidate = input
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const value = input as Record<string, unknown>
    candidate = {
      ...value,
      title:
        typeof value.title === 'string'
          ? normalizeSummaryText(value.title)
          : value.title,
      highlights: Array.isArray(value.highlights)
        ? value.highlights.map((text: unknown) =>
            typeof text === 'string' ? normalizeSummaryText(text) : text
          )
        : value.highlights
    }
  }

  const parsed = generatedPreviewSchema.safeParse(candidate)
  if (parsed.success)
    parsed.data.highlights = parsed.data.highlights.filter(Boolean)
  return parsed
}

export function validateGeneratedPreview(input: unknown): GeneratedPreview {
  const parsed = parseGeneratedPreview(input)
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? 'Enter a valid preview summary.'
    )
  }
  return parsed.data
}

export const SUMMARY_INPUT_LIMIT = 20_000

type SummaryMessage = {
  role: Message['role']
  text: string
  middleOmitted?: true
}

/** Fit one message by removing its middle without splitting Unicode characters. */
function fitSummaryMessage(message: SummaryMessage, budget: number) {
  if (JSON.stringify(message).length <= budget) return message

  const characters = Array.from(message.text)
  const shortened = (count: number): SummaryMessage => ({
    role: message.role,
    text: `${characters.slice(0, Math.ceil(count / 2)).join('')}\n[Middle omitted]\n${characters.slice(characters.length - Math.floor(count / 2)).join('')}`,
    middleOmitted: true
  })
  let low = 0
  let high = characters.length
  while (low < high) {
    const count = Math.ceil((low + high) / 2)
    if (JSON.stringify(shortened(count)).length <= budget) low = count
    else high = count - 1
  }
  return shortened(low)
}

/** Keep the first request and final answer, spending spare space on edge context. */
export function summaryInput(conversation: ExtractedConversation) {
  const sourceTitle = Array.from(conversation.title).slice(0, 200).join('')
  const messages: SummaryMessage[] = conversation.messages.map((message) => ({
    role: message.role,
    text: messageText(message)
  }))
  const encode = (selected: SummaryMessage[], truncated: boolean) =>
    JSON.stringify({ sourceTitle, truncated, messages: selected })
  const full = encode(messages, sourceTitle !== conversation.title)
  if (full.length <= SUMMARY_INPUT_LIMIT) return full

  const nonempty = messages.flatMap((message, index) =>
    message.text.trim() ? [index] : []
  )
  const first =
    nonempty.find((index) => messages[index]!.role === 'user') ?? nonempty[0]
  const last =
    nonempty.findLast((index) => messages[index]!.role === 'assistant') ??
    nonempty.at(-1)
  const anchors = [...new Set([first, last])].filter(
    (index): index is number => index !== undefined
  )
  if (anchors.length === 0) return encode([], true)

  const available =
    SUMMARY_INPUT_LIMIT - encode([], true).length - (anchors.length - 1)
  const costs = anchors.map((index) => JSON.stringify(messages[index]).length)
  const share = Math.floor(available / anchors.length)
  const budgets = costs.map((cost) => Math.min(cost, share))
  let spare = available - budgets.reduce((sum, budget) => sum + budget, 0)
  for (let index = 0; index < budgets.length; index++) {
    const extra = Math.min(costs[index]! - budgets[index]!, spare)
    budgets[index]! += extra
    spare -= extra
  }

  const selected = new Map(
    anchors.map((index, position) => [
      index,
      fitSummaryMessage(messages[index]!, budgets[position]!)
    ])
  )
  let used = encode([...selected.values()], true).length
  const addContext = (index: number) => {
    if (selected.has(index) || !messages[index]!.text.trim()) return
    const cost = JSON.stringify(messages[index]).length + 1
    if (used + cost > SUMMARY_INPUT_LIMIT) return
    selected.set(index, messages[index]!)
    used += cost
  }
  for (
    let left = 0, right = messages.length - 1;
    left <= right;
    left++, right--
  ) {
    addContext(left)
    if (left !== right) addContext(right)
  }

  return encode(
    [...selected]
      .sort(([left], [right]) => left - right)
      .map(([, message]) => message),
    true
  )
}

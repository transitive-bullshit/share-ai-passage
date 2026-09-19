import type { Message, ProviderResult } from '../domain'
import { finishConversation, message, textContent } from './normalize'

const rpc = 'ujx1Bf'

export function geminiRequestBody(shareId: string): string {
  return new URLSearchParams({
    'f.req': JSON.stringify([
      [[rpc, JSON.stringify([null, shareId, [4]]), null, 'generic']]
    ])
  }).toString()
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function textParts(value: unknown): string {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((part) => typeof part !== 'string')
  )
    throw new Error('Gemini returned an unsupported message format.')
  return value.join('\n')
}

/** Decode inert batchexecute JSON; never evaluate provider JavaScript. */
export function parseGemini(
  body: string,
  status: number,
  shareId: string
): ProviderResult {
  const inconclusive: ProviderResult = {
    status: 'inconclusive',
    reason:
      'Gemini did not return a verified public conversation. Try again later.'
  }
  if (status !== 200 || !body.startsWith(")]}'")) return inconclusive
  try {
    const rows: unknown[][] = []
    for (const line of body.split('\n')) {
      if (!line.startsWith('[[')) continue
      const chunk: unknown = JSON.parse(line)
      if (!Array.isArray(chunk)) return inconclusive
      for (const row of chunk) {
        if (Array.isArray(row) && row[0] === 'wrb.fr' && row[1] === rpc)
          rows.push(row)
      }
    }
    // RPC error codes are not evidence that a formerly public share was removed.
    if (rows.length !== 1 || typeof rows[0]![2] !== 'string')
      return inconclusive
    const payload: unknown = JSON.parse(rows[0]![2])
    const data = array(array(payload)[0])
    const metadata = array(data[2])
    if (data[3] !== shareId || metadata[0] !== true || !Array.isArray(data[1]))
      return inconclusive
    const messages: Message[] = []
    for (const entry of data[1]) {
      const turn = array(entry)
      const identity = array(turn[0])
      const user = array(turn[2])
      const response = array(turn[3])
      const candidates = array(response[0]).map(array)
      const selected = candidates.find(
        (candidate) => candidate[0] === response[3]
      )
      if (
        typeof identity[1] !== 'string' ||
        !selected ||
        typeof selected[0] !== 'string'
      )
        return inconclusive
      const question = message(`gemini-${identity[1]}-user`, 'user', [
        textContent('user', textParts(user[0]))
      ])
      // Public attachment metadata is not a saved file. Keep an explicit omission.
      if (array(user[10]).length)
        question.content.push({
          type: 'omitted',
          kind: 'file',
          reason: 'unsupported',
          count: array(user[10]).length
        })
      const answer = message(`gemini-${selected[0]}`, 'assistant', [
        textContent('assistant', textParts(selected[1]))
      ])
      if (array(selected[4]).length)
        answer.content.push({
          type: 'omitted',
          kind: 'image',
          reason: 'unsupported'
        })
      messages.push(question, answer)
    }
    return {
      status: 'available',
      conversation: finishConversation(
        metadata[1],
        messages,
        'gemini-public-rpc-v1'
      )
    }
  } catch {
    return inconclusive
  }
}

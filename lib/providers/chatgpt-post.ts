import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { ProviderResult } from '../domain'
import { parseChatgpt } from './chatgpt'
import { record } from './normalize'

type PostValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | PostValue[]
  | { [key: string]: PostValue }

// Read React Router's serialized reference table as data, never as JavaScript.
// Decode only the post subtree; unrelated loader state can contain tagged values.
function readPost(table: unknown[]) {
  function field(ref: unknown, name: string): unknown {
    const value = typeof ref === 'number' ? record(table[ref]) : undefined
    const key =
      value &&
      Object.keys(value).find(
        (key) => /^_\d+$/.test(key) && table[Number(key.slice(1))] === name
      )
    return key ? value![key] : undefined
  }
  const loader = field(field(0, 'loaderData'), 'routes/s.$postId')
  const kind = field(loader, 'kind')
  if (typeof kind !== 'number' || table[kind] !== 'post_with_profile') return
  const post = field(field(loader, 'postWithProfile'), 'post')
  let budget = 100_000
  let textBudget = 5 * 1024 * 1024
  function decode(ref: unknown, depth = 0): PostValue {
    if (--budget < 0 || depth > 100 || !Number.isInteger(ref))
      throw new Error('Invalid post data')
    if (ref === -5) return null
    if (ref === -7) return undefined
    if (typeof ref !== 'number' || ref < 0 || ref >= table.length)
      throw new Error('Invalid post reference')
    const value = table[ref]
    if (Array.isArray(value))
      return value.map((child) => decode(child, depth + 1))
    const object = record(value)
    if (object)
      return Object.fromEntries(
        Object.entries(object).map(([key, child]) => {
          if (!/^_\d+$/.test(key)) throw new Error('Invalid post key')
          const name = table[Number(key.slice(1))]
          if (typeof name !== 'string') throw new Error('Invalid post key')
          return [name, decode(child, depth + 1)]
        })
      )
    if (typeof value === 'string') {
      textBudget -= value.length
      if (textBudget < 0) throw new Error('Post data exceeds text budget')
      return value
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    )
      return value
    throw new Error('Invalid post value')
  }
  return record(decode(post))
}

export function parseChatgptPost(
  html: string,
  status: number,
  shareId: string
): ProviderResult {
  const inconclusive: ProviderResult = {
    status: 'inconclusive',
    reason: 'ChatGPT did not return a verified public message post.'
  }
  if (status !== 200) return inconclusive
  try {
    const nodes: DefaultTreeAdapterMap['node'][] = [parse(html)]
    while (nodes.length) {
      const node = nodes.pop()!
      if ('childNodes' in node) nodes.push(...node.childNodes.toReversed())
      if (!('tagName' in node) || node.tagName !== 'script') continue
      const text = node.childNodes
        .map((child) => ('value' in child ? child.value : ''))
        .join('')
      const match =
        /^\s*window\.__reactRouterContext\.streamController\.enqueue\(("(?:[^"\\]|\\.)*")\);?\s*$/.exec(
          text
        )
      if (!match) continue
      const chunk: unknown = JSON.parse(match[1]!)
      if (typeof chunk !== 'string' || !chunk.startsWith('[')) continue
      const table: unknown = JSON.parse(chunk)
      if (!Array.isArray(table)) continue
      const post = readPost(table)
      const permissions = record(post?.permissions)
      if (
        post?.id !== shareId ||
        permissions?.can_read !== true ||
        permissions.share_setting !== 'public' ||
        !Array.isArray(post.attachments) ||
        !post.attachments.length
      )
        return inconclusive
      const messages: unknown[] = []
      for (const value of post.attachments) {
        const attachment = record(value)
        if (
          attachment?.kind !== 'message_slice' ||
          !Array.isArray(attachment.messages) ||
          !attachment.messages.length
        )
          return inconclusive
        messages.push(...attachment.messages)
      }
      return parseChatgpt(
        {
          is_public: true,
          title: post.text,
          linear_conversation: messages.map((message) => ({ message }))
        },
        status
      )
    }
  } catch {
    // Unknown serialization, cycles, malformed posts, and parser failures are
    // inconclusive, never evidence that a previously published source was removed.
  }
  return inconclusive
}

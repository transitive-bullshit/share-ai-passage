export type Provider = 'chatgpt' | 'claude'

export type Message = {
  id: string
  speaker: 'user' | 'assistant' | 'system' | 'tool'
  markdown: string
  text: string
}

export type SourceReference = {
  provider: Provider
  canonicalUrl: string
  shareId: string
}

export type ExtractedConversation = {
  title: string
  messages: Message[]
  parserVersion: string
}

export type ProviderResult =
  | { status: 'available'; conversation: ExtractedConversation }
  | { status: 'unavailable'; reason: string }
  | { status: 'inconclusive'; reason: string }

export type GeneratedPreview = {
  title: string
  highlights: string[]
}

/** Ranges use Unicode code points, not UTF-16 code units. */
export type PreviewSelection = {
  title: string
  messageId: string
  start: number
  end: number
}

export const providerNames = {
  chatgpt: 'ChatGPT',
  claude: 'Claude'
} satisfies Record<Provider, string>

export const limits = {
  title: 60,
  highlight: 100,
  highlights: 3,
  excerpt: 240,
  transcriptBytes: 1024 * 1024,
  freshnessMs: 7 * 24 * 60 * 60 * 1000,
  cooldownMs: 60 * 60 * 1000
} as const

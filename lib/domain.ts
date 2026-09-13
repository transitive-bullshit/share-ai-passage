export type Provider = 'chatgpt' | 'claude'

export type MessageContent =
  | {
      /** Source Markdown supplied to the assistant. */
      text: string
      /** Responses API input text discriminator. */
      type: 'input_text'
    }
  | {
      /** Source Markdown produced by the assistant. */
      text: string
      /** Responses API output text discriminator. */
      type: 'output_text'
    }
  | {
      /** Local extension for content we could not capture. */
      type: 'omitted'
      /** Original content category, when known. */
      kind:
        | 'image'
        | 'audio'
        | 'video'
        | 'file'
        | 'tool'
        | 'artifact'
        | 'thinking'
        | 'unknown'
      /** Missing from the public share, or unsupported by our capture. */
      reason: 'not_exposed' | 'unsupported'
      /** Number reported by the provider when only a count is available. */
      count?: number
    }

export type Message = {
  /** Provider message ID, or stable position within a Codex snapshot. */
  id: string
  /** Responses API message discriminator. */
  type: 'message'
  /** Original author; tool is our extension for provider tool output. */
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool'
  /** Source content and explicit omissions, in their original order. */
  content: MessageContent[]
  /** Publicly exposed Codex commentary or final-answer phase. */
  phase?: 'commentary' | 'final_answer'
}

export type SourceReference = {
  /** Service hosting the public conversation. */
  provider: Provider
  /** Normalized public share URL identifying this source. */
  canonicalUrl: string
  /** Provider's public share identifier. */
  shareId: string
}

export type ExtractedConversation = {
  /** Title supplied by the source, with a fallback when absent. */
  title: string
  /** Normalized public messages in conversation order. */
  messages: Message[]
  /** Adapter format version used for this capture. */
  parserVersion: string
}

export type ProviderResult =
  | {
      /** Public conversation was successfully captured. */
      status: 'available'
      /** Captured source content. */
      conversation: ExtractedConversation
    }
  | {
      /** Provider explicitly confirmed the public share is gone. */
      status: 'unavailable'
      /** Explanation of the confirmed removal. */
      reason: string
    }
  | {
      /** Public availability could not be established. */
      status: 'inconclusive'
      /** Explanation of the temporary or unrecognized response. */
      reason: string
    }

export type GeneratedPreview = {
  /** Generated title reviewed before publication. */
  title: string
  /** Generated takeaways grounded in the saved conversation. */
  highlights: string[]
}

export const providerNames = {
  chatgpt: 'ChatGPT',
  claude: 'Claude'
} satisfies Record<Provider, string>

export const summaryRecommendations = {
  titleWords: 10,
  title: 60,
  highlight: 100
} as const

export const limits = {
  title: summaryRecommendations.title * 10,
  highlight: summaryRecommendations.highlight * 10,
  highlights: 3,
  transcriptBytes: 1024 * 1024,
  freshnessMs: 7 * 24 * 60 * 60 * 1000,
  cooldownMs: 60 * 60 * 1000
} as const

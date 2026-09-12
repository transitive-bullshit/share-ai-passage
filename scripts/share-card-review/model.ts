import type {
  ExtractedConversation,
  GeneratedPreview,
  Provider
} from '../../lib/domain'

export type ReviewCase = {
  id: string
  label: string
  topic: string
  source: ExtractedConversation
  sourceHash: string
  preview: GeneratedPreview
  provider: Provider
  reviewNotes: string
  summaryOrigin: 'authored' | 'generated'
  summaryModel: string | null
  summaryTaskHash: string | null
  summaryGeneratedAt: string | null
  inputTruncated: boolean
  metrics: {
    sourceWords: number
    titleWords: number
    highlightWords: number
    totalWords: number
  }
  cards: {
    templateId: string
    image: string
    html: string
    imageHash: string
    htmlHash: string
  }[]
}

export type ReviewSnapshot = {
  version: 1
  name: string
  createdAt: string
  revision: string
  dirty: boolean
  taskHash: string
  rendererHash: string
  corpusHash: string
  templates: { id: string; name: string }[]
  cases: ReviewCase[]
}

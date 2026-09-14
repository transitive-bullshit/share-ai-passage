import type { CardAppearance } from './card-appearance'

// Reviewed presentations of the real source conversation, published in production.
const conversation = {
  title: 'Give your public AI chats a facelift',
  highlights: [
    'Help readers see the value with a clear title and highlights',
    'Review the wording and choose from five card styles',
    'Share the saved conversation with a link to its original source'
  ],
  sourceUrl: 'https://chatgpt.com/s/cx_6aa7638caa4481918b6152d4e76d4b42'
}

type MarketingExample = {
  id: string
  title: string
  highlights: string[]
  sourceUrl: string
  shareUrl: string
  appearance: CardAppearance
}

export const marketingExamples: MarketingExample[] = [
  {
    ...conversation,
    id: 'share-your-ai-chats',
    shareUrl:
      'https://www.share-ai-passage.com/chatgpt/89a0a919-ec9e-49a3-a966-67e5bff95e0e',
    appearance: { templateId: 'margin-notes' }
  },
  {
    ...conversation,
    id: 'share-your-ai-chats-after-dark',
    shareUrl:
      'https://www.share-ai-passage.com/chatgpt/029dd79b-4c27-4971-b2ad-1f865fefe783',
    appearance: { templateId: 'midnight-observatory' }
  }
]

export const featuredExample = marketingExamples[0]!

export function getMarketingExample(id: string) {
  return marketingExamples.find((example) => example.id === id)
}

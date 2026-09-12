import type { CardAppearance } from './card-appearance'
import type { Message } from './domain'
import { message } from './messages'

// Authored product examples share one conversation and differ only in card style.
const conversation = {
  title: 'Share the good part of your AI chats',
  highlights: [
    'Start with a public ChatGPT, Codex, or Claude conversation',
    'Choose a card style and review its title and highlights',
    'Publish one link with a beautiful preview and the saved conversation'
  ],
  messages: [
    message(
      'example-question',
      'user',
      'What’s the best way to share a useful AI conversation so people want to open it?'
    ),
    message(
      'example-answer',
      'assistant',
      `1. **Pick a conversation worth opening.** Choose a useful ChatGPT, Codex, or Claude exchange that solves a problem, explains something clearly, or offers an idea others can use. Copy its public link.

2. **Create a preview with Passage.** Paste in the link, review the generated title and concise highlights, then choose from five card styles to find the look you like.

3. **Publish and share the payoff.** Share your Passage link with a sentence like, “This helped me turn a vague idea into a practical plan.” The link includes a social preview and saved conversation, with access to the original source. No account needed.`
    )
  ]
}

type MarketingExample = {
  id: string
  title: string
  highlights: string[]
  messages: Message[]
  appearance: CardAppearance
}

export const marketingExamples: MarketingExample[] = [
  {
    ...conversation,
    id: 'share-your-ai-chats',
    appearance: { templateId: 'margin-notes' }
  },
  {
    ...conversation,
    id: 'share-your-ai-chats-after-dark',
    appearance: { templateId: 'midnight-observatory' }
  }
]

export function getMarketingExample(id: string) {
  return marketingExamples.find((example) => example.id === id)
}

import type { CardAppearance } from './card-appearance'
import type { Message } from './domain'
import { message } from './messages'

// Authored product examples share one conversation and differ only in card style.
const conversation = {
  title: 'Why the test passed locally but failed in CI',
  highlights: [
    'A finished click does not mean the save request has finished',
    'Wait for the save confirmation before reloading the page',
    'Give each test its own record so parallel runs cannot overwrite it'
  ],
  messages: [
    message(
      'example-question',
      'user',
      'Our browser test edits a note, clicks Save, then reloads the page to check the text. It passes locally but sometimes shows the old text in CI. Adding a two-second sleep helped, but I don’t want slower tests. What should we check?'
    ),
    message(
      'example-answer',
      'assistant',
      `The reload may be racing the save request. A completed click means the button was clicked; it does not establish that the server has saved the note.

**Wait for the result the user sees.** If the app shows “Saved” only after the request succeeds, wait for that confirmation before reloading. A fixed sleep is a guess: it can be too long on your machine and too short in CI.

Also check whether parallel tests edit the same note. A correct save can still be overwritten by another test.`
    ),
    message(
      'example-follow-up',
      'user',
      'The app shows “Saving…” while the request is running and “Saved” after it succeeds. We also reuse the same seeded note in every test.'
    ),
    message(
      'example-resolution',
      'assistant',
      `There are two things to separate:

1. **Save completion.** Wait for the new save confirmation before reloading, then check the reloaded text. Remove the fixed sleep.
2. **Test isolation.** Create a fresh note for each test and clean it up afterward, so parallel tests cannot change the same record.

Run the test repeatedly on its own, then with the parallel suite. That helps distinguish a timing problem from shared test data. Keep a failure trace if it still flakes; these changes address the two likely causes, but the next run should verify them.`
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

export const featuredExample = marketingExamples[0]!

export function getMarketingExample(id: string) {
  return marketingExamples.find((example) => example.id === id)
}

# Saved message model

Passage uses the Responses vocabulary for message identity, roles, typed content, and assistant phases. OpenAI's API defines message items with `role` and `content`, `input_text`/`output_text` text blocks, and optional assistant `commentary`/`final_answer` phases. [Responses reference](https://developers.openai.com/api/reference/typescript/resources/responses)

The local model is deliberately smaller than the API's full item union:

```ts
type Message = {
  id: string
  type: 'message'
  role: 'user' | 'assistant' | 'system' | 'developer' | 'tool'
  content: MessageContent[]
  phase?: 'commentary' | 'final_answer'
}

type MessageContent =
  | { type: 'input_text' | 'output_text'; text: string }
  | {
      type: 'omitted'
      kind:
        | 'image'
        | 'audio'
        | 'video'
        | 'file'
        | 'tool'
        | 'artifact'
        | 'thinking'
        | 'unknown'
      reason: 'not_exposed' | 'unsupported'
      count?: number
    }
```

`text` retains original Markdown. Assistant text uses `output_text`; other roles use `input_text`. Content order and block boundaries are saved. Phase is retained only when the provider supplies it, without guessing a final answer from message position.

Two local extensions describe saved public conversations: `tool` preserves visible tool contributions, and `omitted` records content known to exist but unavailable through the public share or unsupported by extraction. These records are not directly replayable Responses API inputs; that API represents tool calls/results as separate item types. [Responses item types](https://developers.openai.com/api/reference/typescript/resources/responses)

The reader's `messageMarkdown` projection includes omission labels. The summarizer's `messageText` projection contains only extracted text. Neither projection is stored as a second copy of the message.

This change establishes typed content boundaries. Current adapters do not download or render remote image, audio, video, or file payloads. Supporting those payloads later requires explicit content variants and a retrieval/rendering policy; a typed omission does not claim that the media itself was captured.

The local migration wraps previously saved Markdown as text content without changing message identity, order, or roles. Historical omission labels already flattened into Markdown remain verbatim; only new adapter captures can recover structured omission metadata.

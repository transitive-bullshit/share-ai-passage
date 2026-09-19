import { describe, expect, it } from 'vitest'
import { parsePassageUrl } from '@/lib/passage-urls'

const id = '06e7af29-ad1d-4d8f-aafa-515e74576848'
const origin = 'http://localhost:3000'

describe('Passage input URLs', () => {
  it.each([
    `https://www.share-ai-passage.com/chatgpt/${id}`,
    `https://share-ai-passage.com/chatgpt/${id.toUpperCase()}/?utm_source=test#chat`,
    `${origin}/chatgpt/${id}`
  ])('recognizes a publication reference: %s', (url) => {
    expect(parsePassageUrl(url, origin)).toEqual({
      provider: 'chatgpt',
      publicationId: id
    })
  })

  it.each(['claude', 'gemini'])(
    'supports %s and the configured deployment origin',
    (provider) => {
      expect(
        parsePassageUrl(
          `https://preview.example/${provider}/${id}`,
          'https://preview.example'
        )
      ).toEqual({ provider, publicationId: id })
    }
  )

  it.each([
    `http://www.share-ai-passage.com/chatgpt/${id}`,
    `https://www.share-ai-passage.com:8443/chatgpt/${id}`,
    `https://user@www.share-ai-passage.com/chatgpt/${id}`,
    `https://www.share-ai-passage.com.evil.example/chatgpt/${id}`,
    `https://evil.example/chatgpt/${id}`,
    `https://www.share-ai-passage.com/chatgpt/${id}/image`,
    `https://www.share-ai-passage.com/codex/${id}`,
    'https://www.share-ai-passage.com/chatgpt/not-an-id',
    'not a URL',
    `https://www.share-ai-passage.com/chatgpt/${id}?${'a'.repeat(2048)}`
  ])('rejects invalid or untrusted references: %s', (url) => {
    expect(parsePassageUrl(url, origin)).toBeNull()
  })
})

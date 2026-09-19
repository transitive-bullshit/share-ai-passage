import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseGemini, geminiRequestBody } from '../../lib/providers/gemini'
import { classifyResponse } from '../../lib/providers'
import {
  parseSourceUrl,
  upstreamUrl,
  isAllowedRedirect
} from '../../lib/providers/urls'

const id = '27eb2f855eff'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/gemini.json', import.meta.url), 'utf8')
)
function response(data: unknown = fixture) {
  const chunk = JSON.stringify([
    ['wrb.fr', 'ujx1Bf', JSON.stringify(data), null, null, null, 'generic']
  ])
  return `)]}'\n\n${Buffer.byteLength(chunk)}\n${chunk}\n`
}

describe('Gemini public shares', () => {
  it('canonicalizes direct and short links without forwarding copied parameters', () => {
    for (const url of [
      `https://gemini.google.com/share/${id.toUpperCase()}/?x=1#message`,
      `https://g.co/gemini/share/${id}`
    ]) {
      expect(parseSourceUrl(url)).toEqual({
        provider: 'gemini',
        shareId: id,
        canonicalUrl: `https://gemini.google.com/share/${id}`
      })
    }
  })
  it('rejects private routes, lookalike hosts and invalid IDs', () => {
    for (const url of [
      'https://gemini.google.com/app/27eb2f855eff',
      'https://gemini.google.com.evil.test/share/27eb2f855eff',
      'https://g.co/other/27eb2f855eff',
      'https://gemini.google.com/share/abc',
      'https://user@gemini.google.com/share/27eb2f855eff'
    ])
      expect(() => parseSourceUrl(url)).toThrow()
  })
  it('uses the bounded anonymous RPC with a source-specific body', () => {
    const source = parseSourceUrl(`https://g.co/gemini/share/${id}`)
    expect(upstreamUrl(source).href).toBe(
      'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=ujx1Bf&rt=c'
    )
    expect(
      JSON.parse(new URLSearchParams(geminiRequestBody(id)).get('f.req')!)
    ).toEqual([[['ujx1Bf', JSON.stringify([null, id, [4]]), null, 'generic']]])
    expect(
      isAllowedRedirect(new URL('https://accounts.google.com/'), source)
    ).toBe(false)
  })
  it('preserves ordered messages and Markdown from the selected response', () => {
    const result = classifyResponse(
      parseSourceUrl(`https://gemini.google.com/share/${id}`),
      {
        status: 200,
        contentType: 'application/json',
        challenged: false,
        body: response()
      }
    )
    expect(result.status).toBe('available')
    if (result.status !== 'available') return
    expect(result.conversation.title).toBe('A sanitized Gemini conversation')
    expect(result.conversation.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ])
    expect(result.conversation.messages[1]!.content).toEqual([
      {
        type: 'output_text',
        text: 'Use **Markdown**.\n\n```ts\nconst x = 1\n```'
      }
    ])
  })
  it('keeps missing, mismatched, malformed and challenged shares inconclusive', () => {
    for (const body of [
      '<html>Sign in</html>',
      ')]}\'\n[["wrb.fr","ujx1Bf",null,null,null,[5]]]',
      response([[]]),
      response().replace(id, 'aaaaaaaaaaaa')
    ])
      expect(parseGemini(body, 200, id).status).toBe('inconclusive')
    expect(parseGemini(response(), 404, id).status).toBe('inconclusive')
    const data = structuredClone(fixture)
    data[0][1][1][2][0] = [42]
    expect(parseGemini(response(data), 200, id).status).toBe('inconclusive')
  })
})

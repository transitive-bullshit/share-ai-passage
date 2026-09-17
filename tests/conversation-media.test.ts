import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '../app/[provider]/[publicationId]/media/[sha256]/route'
import { SavedMessage } from '../components/saved-message'
import { groupReaderMessages } from '../lib/reader'
import { message } from '../lib/messages'

const service = vi.hoisted(() => ({
  getPublication: vi.fn<typeof import('../lib/service').getPublication>()
}))
const storage = vi.hoisted(() => ({
  readConversationImage:
    vi.fn<typeof import('../lib/conversation-images').readConversationImage>()
}))
vi.mock('../lib/service', () => service)
vi.mock('../lib/conversation-images', () => storage)
const image = {
  sha256: 'a'.repeat(64),
  objectKey: `assets/conversations/${'b'.repeat(64)}/${'a'.repeat(64)}.webp`,
  width: 1254,
  height: 1254
}
const entry = message('generated', 'tool', [{ type: 'image', ...image }])
const path = '/chatgpt/1baa1dfa-3650-46e6-b1fc-1f1f6dd0b300/media'
const request = () =>
  GET(new Request(`https://passage.example${path}/${image.sha256}`), {
    params: Promise.resolve({
      provider: 'chatgpt',
      publicationId: '1baa1dfa-3650-46e6-b1fc-1f1f6dd0b300',
      sha256: image.sha256
    })
  })
beforeEach(() => {
  vi.resetAllMocks()
})

describe('publication image delivery', () => {
  it('renders captured images on the reader and keeps generated images visible', () => {
    const html = renderToStaticMarkup(
      createElement(SavedMessage, {
        message: entry,
        index: 0,
        imageBasePath: path
      })
    )
    expect(html).toContain(`src="${path}/${image.sha256}"`)
    expect(html).toContain('width="1254"')
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain(image.objectKey)
    expect(groupReaderMessages([entry])[0]!.type).toBe('message')
    const forged = message(
      'forged',
      'assistant',
      `![Forged](passage-image:${image.sha256})\n\n![Remote](https://untrusted.example/image.png)`
    )
    expect(
      renderToStaticMarkup(
        createElement(SavedMessage, {
          message: forged,
          index: 0,
          imageBasePath: path
        })
      )
    ).not.toContain('<img')
  })

  it('serves only images bound to an available publication', async () => {
    service.getPublication.mockResolvedValue({
      disabled: false,
      snapshot: { messages: [entry] }
    } as Awaited<ReturnType<typeof service.getPublication>>)
    storage.readConversationImage.mockResolvedValue(Buffer.from('webp fixture'))
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('private, no-cache')
    expect(await response.text()).toBe('webp fixture')
  })

  it.each([
    null,
    { disabled: true, snapshot: { messages: [entry] } },
    { disabled: false, snapshot: { messages: [] } }
  ])(
    'does not read R2 for missing, disabled, or unrelated images',
    async (record) => {
      service.getPublication.mockResolvedValue(
        record as Awaited<ReturnType<typeof service.getPublication>>
      )
      expect((await request()).status).toBe(404)
      expect(storage.readConversationImage).not.toHaveBeenCalled()
    }
  )
})

import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  captureConversationImages,
  imageSourceUrl,
  normalizeConversationImage,
  readConversationImage
} from '../lib/conversation-images'
import { message, messageText } from '../lib/messages'
import { parseCodex } from '../lib/providers/codex'
import { parseSourceUrl } from '../lib/providers/urls'

const storage = vi.hoisted(() => ({
  putImmutableAsset: vi.fn<typeof import('../lib/r2').putImmutableAsset>(),
  readAssetBytes: vi.fn<typeof import('../lib/r2').readAssetBytes>()
}))
const network = vi.hoisted(() => ({
  fetchPublicResource:
    vi.fn<typeof import('../lib/providers/safe-fetch').fetchPublicResource>()
}))
vi.mock('../lib/r2', () => storage)
vi.mock('../lib/providers/safe-fetch', () => network)

const source = parseSourceUrl(
  'https://chatgpt.com/s/cx_6aabdbb96e14819193ffb70414fdf0cc'
)
const png = () =>
  sharp({
    create: { width: 12, height: 8, channels: 3, background: '#326da8' }
  })
    .png()
    .toBuffer()
beforeEach(() => {
  vi.clearAllMocks()
})

describe('saved conversation images', () => {
  it('preserves multiple distinct images in source order', async () => {
    network.fetchPublicResource.mockResolvedValueOnce({
      status: 200,
      challenged: false,
      contentType: 'image/png',
      body: await png()
    })
    network.fetchPublicResource.mockResolvedValueOnce({
      status: 200,
      challenged: false,
      contentType: 'image/png',
      body: await sharp({
        create: { width: 8, height: 12, channels: 3, background: '#ffffff' }
      })
        .png()
        .toBuffer()
    })
    const original = message(
      'answer',
      'assistant',
      'Before\n\n![First](https://images.example/first.png)\n\nBetween\n\n![Second](https://images.example/second.png)\n\nAfter'
    )
    const captured = await captureConversationImages(
      { title: 'Pictures', parserVersion: 'fixture', messages: [original] },
      source
    )
    expect(storage.putImmutableAsset).toHaveBeenCalledTimes(2)
    expect(
      captured.messages[0]!.images!.map((image) => [image.width, image.height])
    ).toEqual([
      [12, 8],
      [8, 12]
    ])
    expect(messageText(captured.messages[0]!)).toBe(messageText(original))
    const text = captured.messages[0]!.content[0]
    if (text?.type !== 'output_text') throw new Error('Expected text')
    expect(text.text.indexOf('![First]')).toBeLessThan(
      text.text.indexOf('![Second]')
    )
  })
  it('captures generated and user images once, preserves order, and removes transient references', async () => {
    const result = parseCodex(
      {
        version: 1,
        turns: [
          {
            items: [
              {
                type: 'userMessage',
                content: [
                  { type: 'text', text: 'Describe this.' },
                  { type: 'image', url: 'codex:shared-asset/asset-1' }
                ]
              },
              {
                type: 'imageGeneration',
                status: 'completed',
                result: 'codex:shared-asset/asset-1'
              },
              { type: 'agentMessage', text: 'Here is the image.' }
            ]
          }
        ]
      },
      200
    )
    if (result.status !== 'available') throw new Error(result.reason)
    network.fetchPublicResource.mockResolvedValue({
      status: 200,
      contentType: 'image/png',
      challenged: false,
      body: await png()
    })
    const captured = await captureConversationImages(
      result.conversation,
      source
    )
    expect(captured.imageSources).toBeUndefined()
    expect(captured.messages[0]!.content.map((block) => block.type)).toEqual([
      'input_text',
      'image'
    ])
    expect(captured.messages[1]!.content[0]).toMatchObject({
      type: 'image',
      width: 12,
      height: 8
    })
    expect(captured.messages.map(messageText)).toEqual(
      result.conversation.messages.map(messageText)
    )
    expect(JSON.stringify(captured)).not.toContain('codex:shared-asset')
    expect(result.conversation.messages[1]!.content[0]!.type).toBe('omitted')
    expect(network.fetchPublicResource).toHaveBeenCalledTimes(1)
    expect(network.fetchPublicResource.mock.calls[0]![0].pathname).toBe(
      `/backend-api/wham/shared_threads/${source.shareId}/assets/asset-1`
    )
    expect(storage.putImmutableAsset).toHaveBeenCalledTimes(1)
    expect(storage.putImmutableAsset.mock.calls[0]![0]).toMatchObject({
      visibility: 'private',
      contentType: 'image/webp'
    })
  })

  it('captures inline and reference Markdown images without fetching code examples or ordinary links', async () => {
    network.fetchPublicResource.mockResolvedValue({
      status: 200,
      contentType: 'image/png',
      challenged: false,
      body: await png()
    })
    const original = message(
      'answer',
      'assistant',
      '![A diagram](https://images.example/image.png)\n\n![Second][picture]\n\n[picture]: https://images.example/image.png\n\n[Website](https://other.example/)\n\n```md\n![Example](https://example.com/sample.png)\n```'
    )
    const captured = await captureConversationImages(
      { title: 'Diagram', parserVersion: 'fixture', messages: [original] },
      source
    )
    expect(network.fetchPublicResource).toHaveBeenCalledTimes(1)
    expect(captured.messages[0]!.images).toHaveLength(1)
    expect(messageText(captured.messages[0]!)).toBe(messageText(original))
    expect(JSON.stringify(captured)).toContain('passage-image:')
  })

  it('retains omissions for unavailable/unsupported images but fails when readable bytes cannot be saved', async () => {
    const conversation = {
      title: 'Picture',
      parserVersion: 'fixture',
      messages: [
        message(
          'answer',
          'assistant',
          '![Picture](https://images.example/image.png)'
        )
      ]
    }
    network.fetchPublicResource.mockResolvedValueOnce({
      status: 403,
      contentType: '',
      challenged: false,
      body: Buffer.from('')
    })
    const captured = await captureConversationImages(conversation, source)
    expect(captured.messages[0]!.images).toBeUndefined()
    expect(JSON.stringify(captured)).toContain('passage-image:unavailable')
    network.fetchPublicResource.mockResolvedValue({
      status: 200,
      contentType: 'image/png',
      challenged: false,
      body: await png()
    })
    storage.putImmutableAsset.mockRejectedValueOnce(
      new Error('Storage unavailable')
    )
    await expect(
      captureConversationImages(conversation, source)
    ).rejects.toThrow('Storage unavailable')
  })

  it('validates raster bytes and rejects active/animated/malformed formats', async () => {
    expect(await normalizeConversationImage(await png())).toMatchObject({
      width: 12,
      height: 8
    })
    await expect(
      normalizeConversationImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
        )
      )
    ).rejects.toThrow('Unsupported image format')
    await expect(
      normalizeConversationImage(Buffer.from('not an image'))
    ).rejects.toThrow()
  })

  it('rejects unsafe references before network access and bounds image count', async () => {
    for (const url of [
      'file:///tmp/image.png',
      'http://example.com/image.png',
      'https://user:pass@example.com/image.png',
      'https://example.com:8443/image.png',
      'codex:shared-asset/../secret'
    ])
      expect(() => imageSourceUrl(url, source)).toThrow()
    const conversation = {
      title: 'Pictures',
      parserVersion: 'fixture',
      messages: [
        message(
          'answer',
          'assistant',
          Array.from(
            { length: 21 },
            (_, index) => `![Image](https://images.example/${index}.png)`
          ).join('\n\n')
        )
      ]
    }
    await expect(
      captureConversationImages(conversation, source)
    ).rejects.toThrow('20-image limit')
    expect(network.fetchPublicResource).not.toHaveBeenCalled()
  })

  it('verifies immutable image bytes before delivery', async () => {
    const image = await normalizeConversationImage(await png())
    const saved = {
      sha256: image.sha256,
      width: image.width,
      height: image.height,
      objectKey: `assets/conversations/${'a'.repeat(64)}/${image.sha256}.webp`
    }
    storage.readAssetBytes.mockResolvedValueOnce(image.bytes)
    expect(await readConversationImage(saved)).toEqual(image.bytes)
    storage.readAssetBytes.mockResolvedValueOnce(Buffer.from('different bytes'))
    await expect(readConversationImage(saved)).rejects.toThrow(
      'Invalid saved image content'
    )
  })
})

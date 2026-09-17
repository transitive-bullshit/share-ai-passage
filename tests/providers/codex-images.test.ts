import { expect, it } from 'vitest'

import { parseCodex } from '../../lib/providers/codex'

it('retains the readable shared image reference in the observed public Codex format', () => {
  const result = parseCodex(
    {
      version: 1,
      assets: { 'asset-1': { width: 1254, height: 1254 } },
      turns: [
        {
          items: [
            { type: 'agentMessage', text: 'Here is the illustration.' },
            {
              type: 'imageGeneration',
              status: 'completed',
              result: 'codex:shared-asset/asset-1'
            }
          ]
        }
      ]
    },
    200
  )
  expect(result.status).toBe('available')
  if (result.status !== 'available') throw new Error(result.reason)
  expect(result.conversation).toHaveProperty('imageSources', [
    {
      messageId: 'codex-0-1',
      contentIndex: 0,
      url: 'codex:shared-asset/asset-1'
    }
  ])
})

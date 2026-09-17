import type { ImageSource } from '../domain'
import { record } from './normalize'

/** Only exposed image URLs; private provider file pointers remain omissions. */
export function exposedImage(
  block: Record<string, unknown>,
  imageSources: ImageSource[],
  messageId: string,
  contentIndex: number
) {
  const source = record(block.source)
  const url = block.url ?? source?.url ?? block.asset_pointer
  if (typeof url === 'string' && url.startsWith('https://'))
    imageSources.push({ messageId, contentIndex, url })
}

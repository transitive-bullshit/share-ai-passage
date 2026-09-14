import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

import { renderCard } from '../lib/card'
import { featuredExample } from '../lib/marketing-examples'

const response = await renderCard(
  {
    title: featuredExample.title,
    highlights: featuredExample.highlights,
    provider: 'chatgpt'
  },
  featuredExample.appearance
)
const source = Buffer.from(await response.arrayBuffer())
const image = await sharp(source).webp({ quality: 75, effort: 6 }).toBuffer()

await mkdir('public/images', { recursive: true })
await writeFile('public/images/landing-passage-card.webp', image)
console.log(
  `Landing card: ${source.length.toLocaleString()} → ${image.length.toLocaleString()} bytes`
)

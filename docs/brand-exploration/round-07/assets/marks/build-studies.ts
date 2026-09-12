import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const round = join(here, '../..')
const require = createRequire(import.meta.url)
const openType = createRequire(require.resolve('satori'))(
  '@shuding/opentype.js'
) as {
  parse: (bytes: ArrayBuffer) => Promise<{
    getPath: (
      text: string,
      x: number,
      y: number,
      size: number
    ) => { toPathData: (precision: number) => string }
  }>
}
const fonts = await Promise.all(
  [400, 500].map(async (weight) => {
    const bytes = await readFile(
      join(here, '../fonts', `inter-latin-${weight}-normal.woff`)
    )
    return {
      weight,
      bytes,
      parsed: await openType.parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer
      )
    }
  })
)

const concepts = [
  {
    id: 'excerpt',
    name: 'Excerpt',
    note: 'A useful part, brought forward.',
    geometry:
      '<rect x="4" y="4" width="18" height="4" rx="0.5" fill="currentColor"/><rect x="10" y="14" width="18" height="4" rx="0.5" fill="currentColor"/><rect x="4" y="24" width="18" height="4" rx="0.5" fill="currentColor"/>',
    lines: [
      'One line steps out from the surrounding text.',
      'The shift makes the selected passage visible',
      'without drawing another document outline.'
    ],
    tradeoff: [
      'Most direct connection to the content.',
      'The abstract text rhythm is less ownable.'
    ]
  },
  {
    id: 'open-passage',
    name: 'Open passage',
    note: 'Recommended starting point',
    geometry:
      '<path d="M4 4H10V28H4Z" fill="currentColor"/><path d="M12 4H18C24.6 4 28 7.6 28 13C28 18.4 24.6 22 18 22H12V16H18C20.8 16 22 15 22 13C22 11 20.8 10 18 10H12Z" fill="currentColor"/>',
    lines: [
      'A spine and an open curve quietly suggest P.',
      'The narrow passage between them keeps',
      'the shape open, with a strong small silhouette.'
    ],
    tradeoff: [
      'A compact signature for the Passage name.',
      'More abstract than an explicit reading symbol.'
    ]
  },
  {
    id: 'paragraph',
    name: 'Paragraph',
    note: 'A mark from the language of reading.',
    geometry:
      '<path d="M12 4H28V9H25V28H20V9H17V28H12V20C6.5 20 3 17 3 12C3 7 6.5 4 12 4Z" fill="currentColor"/>',
    lines: [
      'A custom pilcrow treats a passage of text',
      'as the central object. The solid bowl and',
      'paired stems give it a clear graphic rhythm.'
    ],
    tradeoff: [
      'Strongest literary association.',
      'A familiar editorial symbol, with less ownership.'
    ]
  }
]

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const editable: string[] = []
const outlined: string[] = []
function add(svg: string) {
  editable.push(svg)
  outlined.push(svg)
}
function text(
  value: string,
  x: number,
  y: number,
  size: number,
  weight = 400,
  fill = '#171717'
) {
  const font = fonts.find((font) => font.weight === weight)!
  editable.push(
    `<text x="${x}" y="${y}" font-family="study-${weight}" font-size="${size}" fill="${fill}">${escape(value)}</text>`
  )
  outlined.push(
    `<path d="${font.parsed.getPath(value, x, y, size).toPathData(2)}" fill="${fill}"/>`
  )
}
function mark(
  geometry: string,
  x: number,
  y: number,
  size: number,
  color = '#171717'
) {
  add(
    `<g transform="translate(${x} ${y}) scale(${size / 32})" color="${color}">${geometry}</g>`
  )
}
function rect(x: number, y: number, w: number, h: number, color: string) {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`)
}

rect(0, 0, 1600, 1080, '#FFFFFF')
text('Passage / icon studies', 72, 76, 32, 500)
text(
  'One brand. Three proposed marks. Charcoal on white.',
  72,
  112,
  17,
  400,
  '#737373'
)
text('ROUND 07', 1434, 76, 13, 400, '#737373')
rect(72, 146, 1456, 1, '#E5E5E5')

for (const [index, concept] of concepts.entries()) {
  const x = 72 + index * 504
  if (index > 0) rect(x - 28, 180, 1, 817, '#E5E5E5')
  text(`0${index + 1}`, x, 200, 13, 400, '#737373')
  text(concept.name, x, 242, 27, 500)
  text(concept.note, x, 271, 14, 400, index === 1 ? '#171717' : '#737373')
  mark(concept.geometry, x + 152, 319, 128)

  mark(concept.geometry, x + 90, 491, 34)
  text('Passage', x + 132, 519, 35, 500)

  text('ACTUAL SIZES', x, 585, 11, 400, '#737373')
  for (const [j, size] of [16, 24, 32].entries()) {
    const position = x + j * 127
    mark(concept.geometry, position, 615 + (32 - size) / 2, size)
    text(`${size} px`, position + size + 12, 637, 12, 400, '#737373')
  }

  rect(x, 687, 448, 148, '#171717')
  text('REVERSE', x + 22, 716, 11, 400, '#B5B5B5')
  mark(concept.geometry, x + 21, 742, 56, '#FFFFFF')
  mark(concept.geometry, x + 198, 763, 16, '#FFFFFF')
  mark(concept.geometry, x + 264, 759, 24, '#FFFFFF')
  mark(concept.geometry, x + 338, 755, 32, '#FFFFFF')
  for (const [line, value] of concept.lines.entries())
    text(value, x, 875 + line * 25, 15)
  for (const [line, value] of concept.tradeoff.entries())
    text(value, x, 969 + line * 22, 13, 400, '#737373')

  const master = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><title>Passage — ${escape(concept.name)} proposed mark</title>${concept.geometry}</svg>\n`
  await writeFile(join(here, `${concept.id}-mark.svg`), master)
}
rect(72, 1020, 1456, 1, '#E5E5E5')
text(
  'Proposed marks for discussion. Native SVG masters retain editable geometry and use currentColor.',
  72,
  1053,
  13,
  400,
  '#737373'
)

const css = fonts
  .map(
    (font) =>
      `@font-face{font-family:study-${font.weight};src:url(data:font/woff;base64,${font.bytes.toString('base64')}) format('woff');font-style:normal;font-weight:400}`
  )
  .join('')
const svg = (body: string[], embedFonts: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1080" viewBox="0 0 1600 1080"><title>Passage icon studies — three proposed marks</title>${embedFonts ? `<style>${css}</style>` : ''}${body.join('')}</svg>\n`
await writeFile(join(round, 'icon-study.svg'), svg(editable, true))
await writeFile(
  join(round, 'icon-study.png'),
  new Resvg(svg(outlined, false), { font: { loadSystemFonts: false } })
    .render()
    .asPng()
)
console.log('Built three native marks and icon-study.svg/png (1600 × 1080).')

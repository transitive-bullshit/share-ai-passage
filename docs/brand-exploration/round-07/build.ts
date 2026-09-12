import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
await import('./assets/marks/build-studies')
const req = createRequire(import.meta.url)
type Font = {
  getAdvanceWidth: (text: string, size: number) => number
  getPath: (
    text: string,
    x: number,
    y: number,
    size: number
  ) => { toPathData: (precision: number) => string }
}
const openType = createRequire(req.resolve('satori'))(
  '@shuding/opentype.js'
) as { parse: (bytes: ArrayBuffer) => Promise<Font> }
type FontKey = string
type Direction = {
  id: string
  name: string
  variant: string
  family: string
  markName: string
  markFile: string
  markStyle: 'custom'
  markRationale: string
  lockup: string
  number: string
  territory: string
  headline: string[]
  mantra: string
  character: string[]
  typeLabel: string
  fontFamily: string
  headingFont: string
  bodyFont: string
  hero: string
  colors: { name: string; value: string }[]
  rationale: string
  alt: string
  descriptor?: string
  announcement?: string
  cta?: string
}
type Data = {
  descriptor: string
  sampleTitle: string
  sampleTitleLines: string[]
  highlights: string[]
  cardLabel: string
  cta: string
  readerAction: string
  directions: Direction[]
}
const data: Data = JSON.parse(
  await readFile(join(here, 'render-data.json'), 'utf8')
)
const fonts: Record<string, { font: Font; bytes: Buffer }> = {}
for (const d of data.directions) {
  for (const [key, weight] of [
    [d.bodyFont, 400],
    [d.headingFont, 500],
    ...(d.fontFamily === 'inter' ? [['passageSemibold', 600] as const] : [])
  ] as const) {
    const bytes = await readFile(
      join(
        here,
        'assets/fonts',
        d.fontFamily + '-latin-' + weight + '-normal.woff'
      )
    )
    fonts[key] = {
      bytes,
      font: await openType.parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer
      )
    }
  }
}
const normalize = (s: string) => s.replace(/\s+/gu, ' ').trim()
for (const d of data.directions) {
  const spec = normalize(await readFile(join(here, d.id + '.md'), 'utf8'))
  for (const value of [
    d.name,
    d.territory,
    d.headline.join(' '),
    d.mantra,
    d.descriptor ?? data.descriptor,
    data.sampleTitle,
    data.cardLabel,
    data.readerAction,
    ...data.highlights,
    d.cta ?? data.cta,
    d.typeLabel,
    d.hero,
    d.markFile,
    d.markName,
    ...d.character,
    ...d.colors.map((c) => c.value)
  ])
    assert(
      spec.includes(normalize(value)),
      d.id + ' spec/render mismatch: ' + value
    )
}
const escape = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const fontCss = Object.entries(fonts)
  .map(
    ([key, { bytes }]) =>
      '@font-face{font-family:"brand-' +
      key +
      '";src:url(data:font/woff;base64,' +
      bytes.toString('base64') +
      ') format("woff");font-weight:400;font-style:normal}'
  )
  .join('')
const images = new Map<string, string>()
for (const d of data.directions.filter((direction) => direction.hero))
  images.set(
    d.id,
    'data:image/png;base64,' +
      (await readFile(join(here, d.hero))).toString('base64')
  )
const measurementRecords: { text: string; width: number; maxWidth: number }[] =
  []
class Canvas {
  editable: string[] = []
  outlined: string[] = []
  constructor(
    public width: number,
    public height: number,
    public title: string
  ) {}
  add(s: string) {
    this.editable.push(s)
    this.outlined.push(s)
  }
  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    radius = 0,
    stroke = '',
    strokeWidth = 1
  ) {
    this.add(
      '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        width +
        '" height="' +
        height +
        '" rx="' +
        radius +
        '" fill="' +
        fill +
        '"' +
        (stroke
          ? ' stroke="' + stroke + '" stroke-width="' + strokeWidth + '"'
          : '') +
        '/>'
    )
  }
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    width = 1,
    opacity = 1
  ) {
    this.add(
      '<path d="M' +
        x1 +
        ',' +
        y1 +
        'L' +
        x2 +
        ',' +
        y2 +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        width +
        '" opacity="' +
        opacity +
        '"/>'
    )
  }
  circle(x: number, y: number, r: number, fill: string, stroke = '', sw = 1) {
    this.add(
      '<circle cx="' +
        x +
        '" cy="' +
        y +
        '" r="' +
        r +
        '" fill="' +
        fill +
        '"' +
        (stroke ? ' stroke="' + stroke + '" stroke-width="' + sw + '"' : '') +
        '/>'
    )
  }
  widthOf(s: string, size: number, font: FontKey, tracking = 0) {
    const f = fonts[font]!.font
    if (tracking)
      return (
        Array.from(s).reduce((n, ch) => n + f.getAdvanceWidth(ch, size), 0) +
        Math.max(0, s.length - 1) * tracking
      )
    return f.getAdvanceWidth(s, size)
  }
  text(
    s: string,
    x: number,
    y: number,
    size: number,
    font: FontKey,
    color: string,
    options: {
      align?: 'left' | 'center' | 'right'
      tracking?: number
      maxWidth?: number
      opacity?: number
    } = {}
  ) {
    const tracking = options.tracking || 0
    const width = this.widthOf(s, size, font, tracking)
    if (options.maxWidth) {
      measurementRecords.push({ text: s, width, maxWidth: options.maxWidth })
      assert(
        width <= options.maxWidth + 0.5,
        'Text overflow: ' + s + ' (' + width + ' > ' + options.maxWidth + ')'
      )
    }
    const start =
      x -
      (options.align === 'center'
        ? width / 2
        : options.align === 'right'
          ? width
          : 0)
    assert(
      start >= -1 && start + width <= this.width + 1,
      'Text outside canvas: ' + s
    )
    assert(y >= 0 && y <= this.height, 'Text baseline outside canvas: ' + s)
    const opacity = options.opacity ?? 1
    this.editable.push(
      '<text x="' +
        start +
        '" y="' +
        y +
        '" font-family="brand-' +
        font +
        '" font-size="' +
        size +
        '" fill="' +
        color +
        '" letter-spacing="' +
        tracking +
        '" opacity="' +
        opacity +
        '">' +
        escape(s) +
        '</text>'
    )
    let path = ''
    if (tracking) {
      let cursor = start
      for (const ch of s) {
        path += fonts[font]!.font.getPath(ch, cursor, y, size).toPathData(2)
        cursor += fonts[font]!.font.getAdvanceWidth(ch, size) + tracking
      }
    } else path = fonts[font]!.font.getPath(s, start, y, size).toPathData(2)
    this.outlined.push(
      '<path d="' + path + '" fill="' + color + '" opacity="' + opacity + '"/>'
    )
    return width
  }
  wrap(
    s: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    leading: number,
    font: FontKey,
    color: string,
    align: 'left' | 'center' = 'left'
  ) {
    const lines: string[] = []
    let line = ''
    for (const word of s.split(' ')) {
      const candidate = line ? line + ' ' + word : word
      if (line && this.widthOf(candidate, size, font) > maxWidth) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    if (line) lines.push(line)
    lines.forEach((value, i) =>
      this.text(value, x, y + i * leading, size, font, color, {
        maxWidth,
        align
      })
    )
    return y + lines.length * leading
  }
  photo(
    d: Direction,
    x: number,
    y: number,
    width: number,
    height: number,
    radius = 0,
    fit: 'slice' | 'meet' = 'slice'
  ) {
    const id = 'clip-' + d.id + '-' + x + '-' + y
    this.add(
      '<defs><clipPath id="' +
        id +
        '"><rect x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        width +
        '" height="' +
        height +
        '" rx="' +
        radius +
        '"/></clipPath></defs><image x="' +
        x +
        '" y="' +
        y +
        '" width="' +
        width +
        '" height="' +
        height +
        '" preserveAspectRatio="xMidYMid ' +
        fit +
        '" clip-path="url(#' +
        id +
        ')" href="' +
        images.get(d.id) +
        '"><title>' +
        escape(d.alt) +
        '</title></image>'
    )
  }
  nested(other: Canvas, x: number, y: number, scale: number) {
    const begin =
      '<g transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">'
    this.editable.push(begin, ...other.editable, '</g>')
    this.outlined.push(begin, ...other.outlined, '</g>')
  }
  svg(outline = false) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      this.width +
      '" height="' +
      this.height +
      '" viewBox="0 0 ' +
      this.width +
      ' ' +
      this.height +
      '" role="img"><title>' +
      escape(this.title) +
      '</title>' +
      (outline ? '' : '<defs><style>' + fontCss + '</style></defs>') +
      (outline ? this.outlined : this.editable).join('') +
      '</svg>'
    )
  }
}
const direction = data.directions[0]!
assert(data.directions.length === 1 && direction.id === 'passage')
const source = await readFile(join(here, direction.markFile), 'utf8')
await writeFile(join(here, 'assets/marks/passage-mark.svg'), source)
const viewBox = source
  .match(/viewBox="([^"]+)"/u)![1]!
  .split(/\s+/u)
  .map(Number)
assert(viewBox[0] === 0 && viewBox[1] === 0 && viewBox[2] === viewBox[3])
const markBody = source
  .replace(/^[\s\S]*?<svg[^>]*>/u, '')
  .replace(/<\/svg>[\s\S]*$/u, '')
  .replace(/<title>[\s\S]*?<\/title>/gu, '')
function mark(color: string, x: number, y: number, size: number) {
  return (
    '<g transform="translate(' +
    x +
    ' ' +
    y +
    ') scale(' +
    size / viewBox[2]! +
    ')" color="' +
    color +
    '">' +
    markBody.replaceAll('currentColor', color) +
    '</g>'
  )
}
function arrow(c: Canvas, x: number, y: number, color: string) {
  c.add(
    '<path d="M' +
      x +
      ' ' +
      (y + 14) +
      'l14 -14m-14 0h14v14" fill="none" stroke="' +
      color +
      '" stroke-width="2"/>'
  )
}
function wordmark(
  c: Canvas,
  x: number,
  y: number,
  size = 40,
  color = '#171717'
) {
  c.add(mark(color, x, y - size * 0.8, size))
  c.text('Passage', x + size + 12, y, size * 0.76, 'passageSemibold', color, {
    tracking: -0.7
  })
}
function passageCard() {
  const c = new Canvas(1200, 630, 'Passage — a shareable passage')
  c.rect(0, 0, 1200, 630, '#FFFFFF')
  wordmark(c, 64, 74, 32)
  c.text(data.cardLabel, 1136, 69, 18, 'passage', '#737373', { align: 'right' })
  c.text(data.sampleTitle, 64, 168, 60, 'passageMedium', '#171717', {
    maxWidth: 1072,
    tracking: -2.5
  })
  c.text('HIGHLIGHTS', 64, 238, 14, 'passageMedium', '#737373', {
    tracking: 1.4
  })
  data.highlights.forEach((line, i) => {
    c.rect(64, 277 + i * 54, 5, 5, '#A3A3A3', 1)
    c.text(line, 84, 292 + i * 54, 28, 'passage', '#525252', { maxWidth: 1052 })
  })
  c.line(64, 553, 1136, 553, '#E5E5E5')
  c.text('A passage from Claude', 64, 590, 17, 'passage', '#737373')
  c.text(data.readerAction, 1104, 591, 18, 'passageMedium', '#171717', {
    align: 'right'
  })
  arrow(c, 1121, 576, '#171717')
  return c
}
function poster(card: Canvas) {
  const d = direction
  const c = new Canvas(1600, 1300, d.name + ' — ' + d.headline.join(' '))
  c.rect(0, 0, 1600, 1300, '#FFFFFF')
  wordmark(c, 80, 84, 46)
  c.text(d.cta!, 1493, 77, 22, 'passageMedium', '#171717', { align: 'right' })
  arrow(c, 1506, 60, '#171717')
  d.headline.forEach((line, i) =>
    c.text(
      line,
      800,
      211 + i * 88,
      84,
      'passageMedium',
      i === 1 ? '#777777' : '#171717',
      { align: 'center', tracking: -3.3, maxWidth: 1440 }
    )
  )
  c.text(d.descriptor!, 800, 356, 28, 'passage', '#737373', {
    align: 'center',
    maxWidth: 1380
  })
  c.rect(383, 406, 550, 60, '#FFFFFF', 30, '#E8E8E8')
  c.text('Paste a public link…', 410, 444, 22, 'passage', '#737373')
  c.rect(945, 406, 272, 60, '#171717', 30)
  c.text(d.cta!, 1081, 444, 22, 'passageMedium', '#FFFFFF', {
    align: 'center',
    maxWidth: 236
  })
  c.text(
    'ChatGPT, Codex & Claude. No account needed.',
    800,
    502,
    18,
    'passage',
    '#737373',
    { align: 'center' }
  )
  c.photo(d, 80, 538, 1440, 535, 16)
  c.rect(398, 566, 804, 475, '#2E444824', 12)
  c.rect(400, 564, 800, 475, '#FFFFFF', 12, '#FFFFFF')
  c.rect(401, 565, 798, 30, '#FDFDFD', 10)
  for (const x of [422, 432, 442]) c.circle(x, 579, 3, '#DEDEDE')
  c.text('A passage', 800, 584, 13, 'passage', '#737373', { align: 'center' })
  c.text('Preview', 1178, 584, 13, 'passage', '#737373', { align: 'right' })
  c.nested(card, 400, 596, 2 / 3)
  c.line(401, 1016, 1199, 1016, '#E8E8E8')
  c.text(
    'The conversation, with its original source.',
    426,
    1032,
    12,
    'passage',
    '#737373'
  )
  arrow(c, 1167, 1021, '#737373')
  c.text(d.mantra, 80, 1113, 26, 'passageMedium', '#171717', { maxWidth: 940 })
  c.text(
    'Inter · Regular / Medium / Semibold',
    1520,
    1113,
    21,
    'passage',
    '#737373',
    { align: 'right' }
  )
  c.line(80, 1141, 1520, 1141, '#171717', 1, 0.18)
  c.text(d.character.join('  '), 80, 1191, 26, 'passageMedium', '#171717')
  d.colors.forEach((color, i) => {
    const x = 650 + i * 295
    c.rect(x, 1170, 34, 34, color.value, 17, '#171717', 0.2)
    c.text(color.name, x + 48, 1187, 21, 'passageMedium', '#171717')
    c.text(color.value, x + 48, 1216, 18, 'passage', '#737373')
  })
  c.text('Passage · Identity refinement 07', 80, 1260, 18, 'passage', '#737373')
  c.text(
    'One direction · proposed icon · illustrative passage',
    1520,
    1260,
    18,
    'passage',
    '#737373',
    { align: 'right' }
  )
  return c
}
const card = passageCard()
const sheet = poster(card)
for (const [label, canvas] of [
  ['poster', sheet],
  ['share-card', card]
] as const) {
  await writeFile(join(here, 'passage-' + label + '.svg'), canvas.svg())
  await writeFile(
    join(here, 'passage-' + label + '.png'),
    new Resvg(canvas.svg(true)).render().asPng()
  )
}
await writeFile(
  join(here, 'build-report.json'),
  JSON.stringify(
    {
      directions: ['passage'],
      poster: [1600, 1300],
      shareCard: [1200, 630],
      measuredTextRuns: measurementRecords.length,
      iconSource: 'assets/marks/passage-mark.svg',
      copy: {
        headline: direction.headline.join(' '),
        descriptor: direction.descriptor,
        cta: direction.cta,
        cardLabel: data.cardLabel,
        readerAction: data.readerAction
      }
    },
    null,
    2
  ) + '\n'
)
console.log('Built the focused Passage identity and passage specimen')

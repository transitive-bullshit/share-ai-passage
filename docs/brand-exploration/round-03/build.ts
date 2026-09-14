import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
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
const openType = req('@shuding/opentype.js') as {
  parse: (bytes: ArrayBuffer) => Promise<Font>
}
type FontKey = string
type Direction = {
  id: 'folio-pages' | 'folio-ribbon' | 'waymark' | 'along'
  name: string
  variant: string
  family: string
  markName: string
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
}
type Data = {
  descriptor: string
  sampleTitle: string
  sampleTitleLines: string[]
  highlights: string[]
  cardLabel: string
  cta: string
  directions: Direction[]
}
const data: Data = JSON.parse(
  await readFile(join(here, 'render-data.json'), 'utf8')
)
const fonts: Record<string, { font: Font; bytes: Buffer }> = {}
for (const d of data.directions) {
  for (const [key, weight] of [
    [d.bodyFont, 400],
    [d.headingFont, 500]
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
    data.descriptor,
    data.sampleTitle,
    ...data.highlights,
    data.cta,
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
for (const d of data.directions)
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
const markSources = new Map<string, string>()
for (const d of data.directions) {
  const svg = await readFile(
    join(here, 'assets/marks', d.id + '-mark.svg'),
    'utf8'
  )
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/u, '')
    .replace(/<\/svg>[\s\S]*$/u, '')
    .replace(/<title>[\s\S]*?<\/title>/gu, '')
  markSources.set(d.id, body)
}
function mark(d: Direction, color: string, x = 0, y = 0, size = 100) {
  const body = markSources
    .get(d.id)!
    .replaceAll('#2A2824', color)
    .replaceAll('currentColor', color)
  return (
    '<g transform="translate(' +
    x +
    ' ' +
    y +
    ') scale(' +
    size / 100 +
    ')">' +
    body +
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
function wordmark(c: Canvas, d: Direction, x: number, y: number, size = 40) {
  const fg = d.colors[1]!.value
  if (d.lockup === 'wordmark') {
    c.text(d.name, x, y, size * 0.9, d.headingFont, fg)
  } else {
    c.add(mark(d, fg, x, y - size * 0.8, size))
    c.text(d.name, x + size + 13, y, size * 0.76, d.headingFont, fg)
  }
}
function shareCard(d: Direction) {
  const c = new Canvas(1200, 630, d.name + ' — illustrative share card')
  const fg = d.colors[1]!.value,
    accent = d.colors[2]!.value
  const surfaces = {
    'folio-pages': '#FFFCF5',
    'folio-ribbon': '#FFFCF5',
    waymark: '#FCFAF4',
    along: '#FFFCF5'
  }
  c.rect(0, 0, 1200, 630, surfaces[d.id]!)
  const artX = 814
  c.photo(d, artX, 0, 386, 630)
  c.text(data.cardLabel, 54, 60, 21, d.bodyFont, fg, { opacity: 0.72 })
  data.sampleTitleLines.forEach((s, i) =>
    c.text(s, 51, 167 + 73 * i, 63, d.headingFont, fg, {
      maxWidth: 710,
      tracking: -0.8
    })
  )
  c.text('Highlights', 55, 321, 22, d.headingFont, fg)
  data.highlights.forEach((s, i) => {
    c.circle(58, 369 + 50 * i, 3, accent)
    c.text(s, 75, 379 + 50 * i, 29, d.bodyFont, fg, { maxWidth: 682 })
  })
  c.line(54, 520, 759, 520, fg, 1, 0.18)
  c.text('Read the conversation', 55, 577, 23, d.bodyFont, fg)
  arrow(c, 319, 559, fg)
  if (d.lockup === 'wordmark') {
    c.text(d.name, 654, 576, 32, d.headingFont, fg)
    c.add(mark(d, accent, 729, 550, 31))
  } else {
    c.add(mark(d, fg, 545, 550, 33))
    c.text(d.name, 586, 576, 31, d.headingFont, fg, { maxWidth: 191 })
  }
  return c
}
function intro(
  c: Canvas,
  d: Direction,
  x = 80,
  y = 207,
  size = 70,
  width = 735
) {
  const fg = d.colors[1]!.value
  d.headline.forEach((s, i) =>
    c.text(s, x, y + i * 80, size, d.headingFont, fg, {
      maxWidth: width,
      tracking: -size * 0.025
    })
  )
  c.wrap(
    data.descriptor,
    x + 2,
    y + 143,
    Math.min(655, width),
    30,
    42,
    d.bodyFont,
    fg
  )
  c.rect(x + 2, y + 247, 222, 60, fg, 8)
  c.text(data.cta, x + 28, y + 287, 26, d.headingFont, d.colors[0]!.value)
  c.text('ChatGPT, Claude & Codex', x + 2, y + 360, 22, d.bodyFont, fg, {
    opacity: 0.68
  })
}
function notes(c: Canvas, d: Direction, x: number, y: number, width: number) {
  const fg = d.colors[1]!.value
  c.text(d.typeLabel, x, y, 29, d.headingFont, fg, { maxWidth: width })
  c.text('Regular 400 / Medium 500', x, y + 35, 20, d.bodyFont, fg, {
    opacity: 0.65
  })
  c.wrap(d.mantra, x, y + 104, width, 33, 43, d.headingFont, fg)
  c.wrap(d.rationale, x, y + 223, width, 23, 33, d.bodyFont, fg)
}
function palette(c: Canvas, d: Direction) {
  const fg = d.colors[1]!.value
  c.line(80, 1141, 1520, 1141, fg, 1, 0.18)
  c.text(d.character.join('  '), 80, 1191, 26, d.headingFont, fg)
  d.colors.forEach((color, i) => {
    const x = 650 + i * 295
    c.rect(x, 1170, 34, 34, color.value, 17, fg, 0.2)
    c.text(color.name, x + 48, 1187, 21, d.headingFont, fg)
    c.text(color.value, x + 48, 1216, 18, d.bodyFont, fg, { opacity: 0.65 })
  })
  c.text('Proposed variation · Round 03', 80, 1260, 18, d.bodyFont, fg, {
    opacity: 0.55
  })
  c.text(
    'Concept imagery and example content',
    1520,
    1260,
    18,
    d.bodyFont,
    fg,
    { align: 'right', opacity: 0.55 }
  )
}
function poster(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    1300,
    d.name + ' / ' + d.variant + ' — proposed variation'
  )
  const bg = d.colors[0]!.value,
    fg = d.colors[1]!.value
  c.rect(0, 0, 1600, 1300, bg)
  wordmark(c, d, 80, 84, 46)
  c.text(d.variant + ' / ' + d.territory, 1520, 76, 23, d.bodyFont, fg, {
    align: 'right',
    opacity: 0.67
  })
  if (d.id === 'folio-ribbon') {
    intro(c, d, 80, 215, 60, 490)
    c.photo(d, 83, 715, 438, 292)
    c.rect(621, 216, 903, 477, '#E2D9CD', 12)
    c.nested(card, 625, 220, 0.747)
    c.text('A share, in this world', 625, 748, 21, d.bodyFont, fg, {
      opacity: 0.65
    })
    notes(c, d, 625, 804, 848)
  } else if (d.id === 'along') {
    d.headline.forEach((s, i) =>
      c.text(s, 800, 202 + i * 78, 67, d.headingFont, fg, {
        align: 'center',
        maxWidth: 1350,
        tracking: -1.2
      })
    )
    c.text(data.descriptor, 800, 350, 30, d.bodyFont, fg, {
      align: 'center',
      maxWidth: 1300
    })
    c.rect(689, 398, 222, 60, fg, 8)
    c.text(data.cta, 800, 438, 26, d.headingFont, bg, { align: 'center' })
    c.text('ChatGPT, Claude & Codex', 800, 503, 22, d.bodyFont, fg, {
      align: 'center',
      opacity: 0.68
    })
    c.photo(d, 80, 590, 455, 303)
    c.text(d.typeLabel, 80, 948, 28, d.headingFont, fg)
    c.text('Regular 400 / Medium 500', 80, 985, 20, d.bodyFont, fg, {
      opacity: 0.65
    })
    c.wrap(d.mantra, 80, 1046, 455, 28, 36, d.headingFont, fg)
    c.rect(590, 586, 930, 490, '#E2D9CD', 12)
    c.nested(card, 594, 590, 0.768)
    c.text(
      'Each share is another way into your work.',
      594,
      1120,
      23,
      d.bodyFont,
      fg,
      { opacity: 0.75 }
    )
  } else {
    intro(c, d, 80, 215, d.id === 'waymark' ? 62 : 70)
    c.photo(d, 838, 143, 681, 454, d.id === 'waymark' ? 10 : 0)
    c.rect(79, 638, 928, 489, d.id === 'waymark' ? '#E4DED2' : '#E2D9CD', 8)
    c.nested(card, 83, 642, 0.767)
    c.text('A share, in this world', 84, 619, 21, d.bodyFont, fg, {
      opacity: 0.65
    })
    notes(c, d, 1070, 688, 450)
  }
  palette(c, d)
  return c
}
function markStudy(d: Direction) {
  const c = new Canvas(1600, 900, d.name + ' / ' + d.variant + ' — mark study')
  const bg = d.colors[0]!.value,
    fg = d.colors[1]!.value,
    accent = d.colors[2]!.value
  c.rect(0, 0, 1600, 900, bg)
  c.text(d.name + ' / ' + d.variant, 80, 82, 38, d.headingFont, fg)
  c.text('Mark exploration', 1520, 76, 24, d.bodyFont, fg, {
    align: 'right',
    opacity: 0.65
  })
  c.add(mark(d, fg, 135, 175, 345))
  c.text(d.markName, 105, 575, 31, d.headingFont, fg, { maxWidth: 465 })
  c.wrap(d.markRationale, 105, 626, 465, 24, 34, d.bodyFont, fg)
  c.text(
    d.lockup === 'wordmark'
      ? 'Primary wordmark / secondary ribbon'
      : 'Primary lockup',
    660,
    184,
    23,
    d.bodyFont,
    fg,
    { opacity: 0.65 }
  )
  wordmark(c, d, 660, 315, 116)
  c.text('At small sizes', 660, 433, 23, d.bodyFont, fg, { opacity: 0.65 })
  for (const [i, size] of [48, 32, 16].entries()) {
    c.add(mark(d, fg, 660 + i * 110, 474 + (48 - size) / 2, size))
    c.text(size + ' px', 660 + i * 110, 558, 19, d.bodyFont, fg, {
      opacity: 0.65
    })
  }
  c.rect(660, 610, 230, 166, fg, 12)
  c.add(mark(d, bg, 727, 644, 96))
  c.rect(920, 610, 230, 166, bg, 12, fg, 0.5)
  c.add(mark(d, accent, 987, 644, 96))
  c.rect(1180, 610, 230, 166, accent, 12)
  c.add(mark(d, bg, 1247, 644, 96))
  c.text('Light on ink', 660, 813, 21, d.bodyFont, fg, { opacity: 0.65 })
  c.text('Accent on paper', 920, 813, 21, d.bodyFont, fg, { opacity: 0.65 })
  c.text('Light on accent', 1180, 813, 21, d.bodyFont, fg, { opacity: 0.65 })
  c.text(
    'Proposed symbols and lockups · Round 03',
    80,
    864,
    18,
    d.bodyFont,
    fg,
    { opacity: 0.55 }
  )
  c.text(
    d.id === 'along'
      ? 'Along is a working name; availability unchecked.'
      : 'A symbol is still a proposal, not a final selection.',
    1520,
    864,
    18,
    d.bodyFont,
    fg,
    { align: 'right', opacity: 0.55 }
  )
  return c
}
await mkdir(join(here, 'assets/marks'), { recursive: true })
const posters: Canvas[] = [],
  marks: Canvas[] = []
for (const d of data.directions) {
  const card = shareCard(d),
    sheet = poster(d, card),
    study = markStudy(d)
  for (const [label, canvas] of [
    ['poster', sheet],
    ['share-card', card],
    ['mark-study', study]
  ] as const) {
    await writeFile(join(here, d.id + '-' + label + '.svg'), canvas.svg())
    await writeFile(
      join(here, d.id + '-' + label + '.png'),
      new Resvg(canvas.svg(true)).render().asPng()
    )
  }
  posters.push(sheet)
  marks.push(study)
}
const contact = new Canvas(
  2400,
  1980,
  'Folio and the trail — four variations — Round 03'
)
contact.rect(0, 0, 2400, 1980, '#E9E8E4')
posters.forEach((p, i) =>
  contact.nested(p, 14 + (i % 2) * 1192, 14 + Math.floor(i / 2) * 985, 0.733)
)
await writeFile(join(here, 'contact-sheet.svg'), contact.svg())
await writeFile(
  join(here, 'contact-sheet.png'),
  new Resvg(contact.svg(true)).render().asPng()
)
const markContact = new Canvas(2400, 1380, 'Four proposed marks — Round 03')
markContact.rect(0, 0, 2400, 1380, '#E9E8E4')
marks.forEach((p, i) =>
  markContact.nested(
    p,
    14 + (i % 2) * 1192,
    14 + Math.floor(i / 2) * 685,
    0.733
  )
)
await writeFile(join(here, 'marks-overview.svg'), markContact.svg())
await writeFile(
  join(here, 'marks-overview.png'),
  new Resvg(markContact.svg(true)).render().asPng()
)
await writeFile(
  join(here, 'build-report.json'),
  JSON.stringify(
    {
      directions: data.directions.map((d) => d.id),
      poster: [1600, 1300],
      shareCard: [1200, 630],
      markStudy: [1600, 900],
      measuredTextRuns: measurementRecords.length
    },
    null,
    2
  ) + '\n'
)
console.log('Built four proposed variations, share cards, and mark studies')

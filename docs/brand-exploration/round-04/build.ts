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
function wordmark(
  c: Canvas,
  d: Direction,
  x: number,
  y: number,
  size = 40,
  ink = d.colors[1]!.value
) {
  c.add(mark(d, d.colors[2]!.value, x, y - size * 0.8, size))
  c.text(d.name, x + size + 13, y, size * 0.76, d.headingFont, ink)
}
function shareFooter(
  c: Canvas,
  d: Direction,
  y: number,
  ink: string,
  width = 1092
) {
  c.line(54, y - 57, 54 + width, y - 57, ink, 1, 0.18)
  c.text('Read the conversation', 55, y, 23, d.bodyFont, ink)
  arrow(c, 319, y - 18, ink)
  wordmark(c, d, width - 88, y, 38, ink)
}
function shareCard(d: Direction) {
  const c = new Canvas(
    1200,
    630,
    'Folio / ' + d.variant + ' — illustrative share card'
  )
  const ink = d.id === 'after-hours' ? '#29231F' : d.colors[1]!.value
  const accent = d.colors[2]!.value
  c.rect(0, 0, 1200, 630, '#FFFCF5')
  if (d.id === 'folio') {
    c.photo(d, 814, 0, 386, 630)
    c.text(data.cardLabel, 54, 60, 21, d.bodyFont, ink, { opacity: 0.72 })
    data.sampleTitleLines.forEach((s, i) =>
      c.text(s, 51, 167 + 73 * i, 63, d.headingFont, ink, {
        maxWidth: 710,
        tracking: -0.8
      })
    )
    c.text('Highlights', 55, 321, 22, d.headingFont, ink)
    data.highlights.forEach((s, i) => {
      c.circle(58, 369 + 50 * i, 3, accent)
      c.text(s, 75, 379 + 50 * i, 29, d.bodyFont, ink, { maxWidth: 682 })
    })
    c.line(54, 520, 759, 520, ink, 1, 0.18)
    c.text('Read the conversation', 55, 577, 23, d.bodyFont, ink)
    arrow(c, 319, 559, ink)
    c.add(mark(d, accent, 545, 550, 33))
    c.text(d.name, 586, 576, 31, d.headingFont, ink, { maxWidth: 191 })
  } else if (d.id === 'index') {
    c.rect(0, 0, 1200, 630, '#FFFEFA')
    c.text(data.cardLabel, 60, 57, 21, d.bodyFont, ink, { opacity: 0.64 })
    c.add(
      '<path d="M1081 0h59v111l-29.5 -18 -29.5 18z" fill="' + accent + '"/>'
    )
    data.sampleTitleLines.forEach((s, i) =>
      c.text(s, 55, 172 + i * 89, 82, d.headingFont, ink, {
        maxWidth: 1070,
        tracking: -1.6
      })
    )
    c.line(60, 309, 1140, 309, ink, 1, 0.22)
    data.highlights.forEach((s, i) => {
      c.text('0' + (i + 1), 61, 364 + i * 60, 21, d.bodyFont, accent)
      c.text(s, 117, 365 + i * 60, 30, d.bodyFont, ink, { maxWidth: 1000 })
      if (i < 2) c.line(117, 385 + i * 60, 1140, 385 + i * 60, ink, 1, 0.1)
    })
    shareFooter(c, d, 579, ink)
  } else if (d.id === 'cut-paper') {
    c.photo(d, 0, 0, 1200, 630)
    c.add(
      '<path d="M40 35L781 27 794 600 29 591Z" fill="#B6BAB2" opacity=".22"/>'
    )
    c.add('<path d="M31 28L770 31 779 589 34 592Z" fill="#FFFCF4"/>')
    c.rect(75, 72, 36, 4, accent)
    c.text(data.cardLabel, 128, 81, 21, d.bodyFont, ink, { opacity: 0.72 })
    data.sampleTitleLines.forEach((s, i) =>
      c.text(s, 70, 183 + i * 72, 64, d.headingFont, ink, {
        maxWidth: 675,
        tracking: -1
      })
    )
    c.text('Highlights', 74, 332, 22, d.headingFont, ink)
    data.highlights.forEach((s, i) => {
      c.line(75, 373 + i * 47, 89, 373 + i * 47, accent, 2)
      c.text(s, 105, 382 + i * 47, 27, d.bodyFont, ink, { maxWidth: 612 })
    })
    c.line(75, 512, 728, 512, ink, 1, 0.15)
    c.text('Read the conversation', 75, 558, 21, d.bodyFont, ink)
    arrow(c, 315, 541, ink)
    wordmark(c, d, 603, 558, 33, ink)
  } else {
    c.rect(0, 0, 1200, 630, '#F4F0E8')
    c.text(data.cardLabel, 54, 60, 21, d.bodyFont, ink, { opacity: 0.68 })
    data.sampleTitleLines.forEach((s, i) =>
      c.text(s, 51, 157 + i * 76, 70, d.headingFont, ink, {
        maxWidth: 1092,
        tracking: -1.2
      })
    )
    data.highlights.forEach((s, i) => {
      const x = 55 + i * 370
      c.circle(x + 3, 284, 3, '#B85540')
      c.wrap(s, x, 328, 330, 28, 37, d.bodyFont, ink)
    })
    shareFooter(c, d, 440, ink)
    c.photo(d, 0, 478, 1200, 152)
  }
  return c
}
function cta(c: Canvas, d: Direction, x: number, y: number) {
  const ink = d.colors[1]!.value
  c.rect(x, y, 222, 60, ink, 8)
  c.text(data.cta, x + 26, y + 40, 26, d.headingFont, d.colors[0]!.value)
}
function intro(
  c: Canvas,
  d: Direction,
  x = 80,
  y = 207,
  size = 70,
  width = 735,
  showProviders = true
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
  cta(c, d, x + 2, y + 247)
  if (showProviders)
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
  c.text('Proposed direction · Round 04', 80, 1260, 18, d.bodyFont, fg, {
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
function compactNotes(c: Canvas, d: Direction) {
  const fg = d.colors[1]!.value
  c.text(d.mantra, 80, 1103, 26, d.headingFont, fg, { maxWidth: 900 })
  c.text(d.typeLabel + ' · Regular / Medium', 1520, 1103, 21, d.bodyFont, fg, {
    align: 'right',
    opacity: 0.65
  })
}
function poster(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    1300,
    'Folio / ' + d.variant + ' — proposed direction'
  )
  const bg = d.colors[0]!.value,
    fg = d.colors[1]!.value
  c.rect(0, 0, 1600, 1300, bg)
  wordmark(c, d, 80, 84, 46)
  c.text(d.variant + ' / ' + d.territory, 1520, 76, 23, d.bodyFont, fg, {
    align: 'right',
    opacity: 0.67
  })
  if (d.id === 'folio') {
    intro(c, d, 80, 215, 70)
    c.photo(d, 838, 143, 681, 454)
    c.rect(79, 638, 928, 489, '#E2D9CD', 8)
    c.nested(card, 83, 642, 0.767)
    c.text('A share, in this world', 84, 619, 21, d.bodyFont, fg, {
      opacity: 0.65
    })
    notes(c, d, 1070, 688, 450)
  } else if (d.id === 'index') {
    c.text(d.headline.join(' '), 80, 207, 71, d.headingFont, fg, {
      maxWidth: 1440,
      tracking: -1.8
    })
    c.text(data.descriptor, 83, 274, 30, d.bodyFont, fg, { maxWidth: 1110 })
    cta(c, d, 1298, 230)
    c.line(80, 325, 1520, 325, fg, 1, 0.22)
    c.rect(194, 370, 1212, 642, '#E9E4DA')
    c.nested(card, 200, 376, 1)
    compactNotes(c, d)
  } else if (d.id === 'cut-paper') {
    c.photo(d, 735, 139, 785, 924)
    c.add(
      '<path d="M255 581L1267 557 1284 1075 270 1086Z" fill="#72848A" opacity=".25"/>'
    )
    intro(c, d, 80, 217, 70, 640, false)
    c.nested(card, 280, 563, 0.82)
    compactNotes(c, d)
  } else {
    c.text(d.headline.join(' '), 800, 203, 70, d.headingFont, fg, {
      align: 'center',
      maxWidth: 1440,
      tracking: -1.6
    })
    c.text(data.descriptor, 800, 270, 30, d.bodyFont, fg, {
      align: 'center',
      maxWidth: 1440
    })
    cta(c, d, 689, 316)
    c.photo(d, 80, 419, 1440, 635)
    c.rect(310, 480, 980, 524, '#211D1A', 4)
    c.nested(card, 320, 490, 0.8)
    compactNotes(c, d)
  }
  palette(c, d)
  return c
}
await mkdir(join(here, 'assets/marks'), { recursive: true })
const posters: Canvas[] = [],
  cards: Canvas[] = []
for (const d of data.directions) {
  const card = shareCard(d),
    sheet = poster(d, card)
  for (const [label, canvas] of [
    ['poster', sheet],
    ['share-card', card]
  ] as const) {
    await writeFile(join(here, d.id + '-' + label + '.svg'), canvas.svg())
    await writeFile(
      join(here, d.id + '-' + label + '.png'),
      new Resvg(canvas.svg(true)).render().asPng()
    )
  }
  posters.push(sheet)
  cards.push(card)
}
const contact = new Canvas(
  2400,
  1980,
  'Folio — a baseline and three new directions — Round 04'
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
const cardContact = new Canvas(
  2400,
  1380,
  'Folio — four share directions — Round 04'
)
cardContact.rect(0, 0, 2400, 1380, '#E9E8E4')
cards.forEach((card, i) => {
  const x = 14 + (i % 2) * 1192,
    y = 14 + Math.floor(i / 2) * 685
  cardContact.text(
    data.directions[i]!.variant,
    x + 15,
    y + 35,
    24,
    'folioMedium',
    '#2A2824'
  )
  cardContact.nested(card, x, y + 59, 0.975)
})
await writeFile(join(here, 'sharecards-overview.svg'), cardContact.svg())
await writeFile(
  join(here, 'sharecards-overview.png'),
  new Resvg(cardContact.svg(true)).render().asPng()
)
await writeFile(
  join(here, 'build-report.json'),
  JSON.stringify(
    {
      directions: data.directions.map((d) => d.id),
      poster: [1600, 1300],
      shareCard: [1200, 630],
      contactSheet: [2400, 1980],
      sharecardsOverview: [2400, 1380],
      measuredTextRuns: measurementRecords.length
    },
    null,
    2
  ) + '\n'
)
console.log(
  'Built Folio baseline and three new directions, share cards, and comparison overviews'
)

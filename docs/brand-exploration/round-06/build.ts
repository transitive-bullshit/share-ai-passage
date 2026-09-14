import { readFile, writeFile } from 'node:fs/promises'
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
  id: string
  name: string
  variant: string
  family: string
  markName: string
  markStyle: 'outline' | 'page-turn'
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
    ...data.highlights,
    d.cta ?? data.cta,
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
    size / (d.markStyle === 'outline' ? 32 : 100) +
    ')">' +
    (d.markStyle === 'outline'
      ? '<g fill="none" stroke="' +
        color +
        '" stroke-width="1.8">' +
        body +
        '</g>'
      : body) +
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
  const passage = d.fontFamily === 'inter'
  c.add(mark(d, passage ? '#171717' : '#B85540', x, y - size * 0.8, size))
  c.text(
    d.name,
    x + size + 13,
    y,
    size * 0.76,
    passage ? 'passageSemibold' : d.headingFont,
    d.colors[1]!.value,
    { tracking: passage ? -0.7 : 0 }
  )
}
function shareCard(d: Direction) {
  const c = new Canvas(1200, 630, d.name + ' — comparison share card')
  const ink = d.colors[1]!.value
  if (d.id === 'folio') {
    c.rect(0, 0, 1200, 630, '#FFFCF5')
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
      c.circle(58, 369 + 50 * i, 3, '#B85540')
      c.text(s, 75, 379 + 50 * i, 29, d.bodyFont, ink, { maxWidth: 682 })
    })
    c.line(54, 520, 759, 520, ink, 1, 0.18)
    c.text('Read the conversation', 55, 577, 23, d.bodyFont, ink)
    arrow(c, 319, 559, ink)
    c.add(mark(d, '#B85540', 545, 550, 33))
    c.text(d.name, 586, 576, 31, d.headingFont, ink, { maxWidth: 191 })
  } else if (d.id === 'passage') {
    c.rect(0, 0, 1200, 630, '#FFFFFF')
    c.add(mark(d, ink, 64, 47, 30))
    c.text('Passage', 105, 72, 23, 'passageMedium', ink, { tracking: -0.8 })
    c.text('Example conversation', 1136, 69, 18, 'passage', '#737373', {
      align: 'right'
    })
    c.text(data.sampleTitle, 64, 168, 60, 'passageMedium', ink, {
      maxWidth: 1072,
      tracking: -2.5
    })
    c.text('AI SUMMARY', 64, 238, 14, 'passageMedium', '#737373', {
      tracking: 1.4
    })
    data.highlights.forEach((line, i) => {
      c.rect(64, 277 + i * 54, 5, 5, '#A3A3A3', 1)
      c.text(line, 84, 292 + i * 54, 28, 'passage', '#525252', {
        maxWidth: 1052
      })
    })
    c.line(64, 553, 1136, 553, '#E5E5E5')
    c.text(
      'A passage from Claude worth sharing',
      64,
      590,
      16,
      'passage',
      '#737373'
    )
  } else {
    c.rect(0, 0, 1200, 630, '#FFFFFF')
    c.text(data.cardLabel, 54, 60, 21, 'passage', '#737373')
    c.text(data.sampleTitle, 54, 168, 60, 'passageMedium', ink, {
      maxWidth: 1092,
      tracking: -2.5
    })
    c.text('Highlights', 54, 270, 22, 'passageMedium', ink)
    data.highlights.forEach((line, i) => {
      c.rect(54, 318 + i * 55, 5, 5, '#A3A3A3', 1)
      c.text(line, 74, 331 + i * 55, 28, 'passage', '#525252', {
        maxWidth: 1072
      })
    })
    c.line(54, 520, 1146, 520, '#E8E8E8')
    c.text('Read the conversation', 55, 577, 23, 'passage', '#737373')
    arrow(c, 319, 559, '#737373')
    wordmark(c, d, 1000, 576, 38)
  }
  return c
}
function folioIntro(c: Canvas, d: Direction) {
  const fg = d.colors[1]!.value
  d.headline.forEach((s, i) =>
    c.text(s, 80, 215 + i * 80, 70, d.headingFont, fg, {
      maxWidth: 735,
      tracking: -1.75
    })
  )
  c.wrap(data.descriptor, 82, 358, 655, 30, 42, d.bodyFont, fg)
  c.rect(82, 462, 222, 60, fg, 8)
  c.text(data.cta, 108, 502, 26, d.headingFont, d.colors[0]!.value)
  c.text('ChatGPT, Claude & Codex', 82, 575, 22, d.bodyFont, fg, {
    opacity: 0.68
  })
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
  c.text('Identity comparison · Round 06', 80, 1260, 18, d.bodyFont, fg, {
    opacity: 0.55
  })
  c.text(
    d.id === 'passage'
      ? 'Existing homepage style · illustrative comparison content'
      : d.id === 'folio'
        ? 'Retained Folio direction · illustrative comparison content'
        : 'Passage visuals / Folio words · proposed combination',
    1520,
    1260,
    18,
    d.bodyFont,
    fg,
    { align: 'right', opacity: 0.55 }
  )
}
function poster(d: Direction, card: Canvas) {
  const c = new Canvas(1600, 1300, d.name + ' — proposed identity')
  const bg = d.colors[0]!.value,
    fg = d.colors[1]!.value
  c.rect(0, 0, 1600, 1300, bg)
  wordmark(c, d, 80, 84, 46)
  c.text(d.variant + ' / ' + d.territory, 1520, 76, 23, d.bodyFont, fg, {
    align: 'right',
    opacity: 0.67
  })
  if (d.id === 'folio') {
    folioIntro(c, d)
    c.photo(d, 838, 143, 681, 454)
    c.rect(79, 638, 928, 489, '#E2D9CD', 8)
    c.nested(card, 83, 642, 0.767)
    c.text('A share, in this world', 84, 619, 21, d.bodyFont, fg, {
      opacity: 0.65
    })
    c.text(d.typeLabel, 1070, 688, 29, d.headingFont, fg, { maxWidth: 450 })
    c.text('Regular 400 / Medium 500', 1070, 723, 20, d.bodyFont, fg, {
      opacity: 0.65
    })
    c.wrap(d.mantra, 1070, 792, 450, 33, 43, d.headingFont, fg)
    c.wrap(d.rationale, 1070, 911, 450, 23, 33, d.bodyFont, fg)
  } else if (d.id === 'passage') {
    c.circle(542, 139, 4, '#62A78A')
    c.text(d.announcement!, 562, 146, 21, 'passage', '#737373', {
      maxWidth: 970
    })
    d.headline.forEach((s, i) =>
      c.text(
        s,
        800,
        227 + i * 77,
        73,
        'passageMedium',
        i === 1 ? '#777777' : fg,
        { align: 'center', tracking: -3.1, maxWidth: 1440 }
      )
    )
    c.text(
      'Turn a public AI chat into a thoughtful preview,',
      800,
      356,
      27,
      'passage',
      '#737373',
      { align: 'center', maxWidth: 1320 }
    )
    c.text(
      'with the highlights up front and the full conversation behind it.',
      800,
      396,
      27,
      'passage',
      '#737373',
      { align: 'center', maxWidth: 1320 }
    )
    c.rect(443, 427, 594, 55, '#FFFFFF', 28, '#E8E8E8')
    c.text('Paste a public link…', 465, 462, 21, 'passage', '#737373')
    c.rect(1049, 427, 108, 55, '#171717', 28)
    c.text('Go', 1071, 462, 21, 'passageMedium', '#FFFFFF')
    c.add(
      '<path d="M1110 454h18m-7 -7 7 7 -7 7" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>'
    )
    c.text(
      'ChatGPT, Codex & Claude. No account needed.',
      800,
      512,
      18,
      'passage',
      '#737373',
      { align: 'center' }
    )
    c.photo(d, 80, 550, 1440, 525, 16)
    c.rect(398, 572, 804, 475, '#2E444824', 12)
    c.rect(400, 570, 800, 475, '#FFFFFF', 12, '#FFFFFF', 1)
    c.rect(401, 571, 798, 30, '#FDFDFD', 10)
    for (const x of [422, 432, 442]) c.circle(x, 585, 3, '#DEDEDE')
    c.text('A shared conversation', 800, 590, 13, 'passage', '#737373', {
      align: 'center'
    })
    c.text('Preview', 1178, 590, 13, 'passage', '#737373', { align: 'right' })
    c.nested(card, 400, 602, 2 / 3)
    c.line(401, 1022, 1199, 1022, '#E8E8E8')
    c.text(
      'The full conversation comes with it.',
      426,
      1038,
      12,
      'passage',
      '#737373'
    )
    arrow(c, 1167, 1027, '#737373')
    c.text(d.mantra, 80, 1113, 26, 'passageMedium', fg, { maxWidth: 940 })
    c.text(
      'Inter · Regular / Medium / Semibold',
      1520,
      1113,
      21,
      'passage',
      '#737373',
      { align: 'right' }
    )
  } else if (d.id === 'folio-landscape') {
    d.headline.forEach((line, i) =>
      c.text(
        line,
        800,
        225 + i * 80,
        78,
        'passageMedium',
        i === 1 ? '#777777' : fg,
        { align: 'center', tracking: -3.1, maxWidth: 1440 }
      )
    )
    c.text(data.descriptor, 800, 381, 29, 'passage', '#737373', {
      align: 'center',
      maxWidth: 1360
    })
    c.rect(676, 429, 248, 57, '#171717', 29)
    c.text(data.cta, 800, 467, 23, 'passageMedium', '#FFFFFF', {
      align: 'center'
    })
    c.text('ChatGPT, Claude & Codex', 800, 524, 19, 'passage', '#737373', {
      align: 'center'
    })
    c.photo(d, 80, 558, 1440, 517, 16)
    c.rect(358, 582, 880, 464, '#2E444818', 8)
    c.nested(card, 362, 580, 0.73)
    c.text(d.mantra, 80, 1113, 26, 'passageMedium', fg, { maxWidth: 940 })
    c.text(
      'Inter · Regular / Medium / Semibold',
      1520,
      1113,
      21,
      'passage',
      '#737373',
      { align: 'right' }
    )
  } else {
    c.photo(d, 650, 146, 870, 930, 16)
    d.headline.forEach((line, i) =>
      c.text(
        line,
        80,
        237 + i * 83,
        73,
        'passageMedium',
        i === 1 ? '#777777' : fg,
        { tracking: -3, maxWidth: 525 }
      )
    )
    c.wrap(data.descriptor, 82, 392, 510, 29, 42, 'passage', '#737373')
    c.rect(82, 513, 248, 58, '#171717', 29)
    c.text(data.cta, 206, 552, 23, 'passageMedium', '#FFFFFF', {
      align: 'center'
    })
    c.text('ChatGPT, Claude & Codex', 82, 612, 20, 'passage', '#737373')
    c.rect(676, 359, 822, 431, '#2E444824', 8)
    c.nested(card, 680, 355, 0.68)
    c.wrap(d.mantra, 80, 873, 500, 33, 43, 'passageMedium', fg)
    c.text('Inter', 80, 990, 29, 'passageMedium', fg)
    c.text(
      'Regular 400 / Medium 500 / Semibold 600',
      80,
      1030,
      20,
      'passage',
      '#737373',
      { maxWidth: 535 }
    )
  }
  palette(c, d)
  return c
}
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
  'Folio, Passage, and two combinations — Round 06'
)
contact.rect(0, 0, 2400, 1980, '#E9E8E4')
posters.forEach((poster, i) =>
  contact.nested(
    poster,
    14 + (i % 2) * 1192,
    14 + Math.floor(i / 2) * 985,
    0.733
  )
)
await writeFile(join(here, 'contact-sheet.svg'), contact.svg())
await writeFile(
  join(here, 'contact-sheet.png'),
  new Resvg(contact.svg(true)).render().asPng()
)
const overview = new Canvas(
  2400,
  1380,
  'Folio, Passage, and two combinations — share cards — Round 06'
)
overview.rect(0, 0, 2400, 1380, '#E9E8E4')
cards.forEach((card, i) => {
  const d = data.directions[i]!
  const x = 14 + (i % 2) * 1192,
    y = 14 + Math.floor(i / 2) * 685
  overview.text(
    d.id.startsWith('folio-') ? d.name + ' / ' + d.variant : d.name,
    x + 15,
    y + 35,
    24,
    'folioMedium',
    '#2A2824'
  )
  overview.nested(card, x, y + 59, 0.975)
})
await writeFile(join(here, 'sharecards-overview.svg'), overview.svg())
await writeFile(
  join(here, 'sharecards-overview.png'),
  new Resvg(overview.svg(true)).render().asPng()
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
  'Built the retained Folio and Passage identities plus two combinations'
)

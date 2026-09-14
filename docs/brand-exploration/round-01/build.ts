import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const req = createRequire(import.meta.url)
const openType = req('@shuding/opentype.js') as {
  parse: (buffer: ArrayBuffer) => Promise<Font>
}
type Font = {
  getAdvanceWidth: (text: string, size: number) => number
  getPath: (
    text: string,
    x: number,
    y: number,
    size: number
  ) => { toPathData: (precision: number) => string }
}
type FontKey =
  | 'inter'
  | 'interMedium'
  | 'interBold'
  | 'news'
  | 'newsItalic'
  | 'dm'
  | 'dmBold'
  | 'dmHeavy'
type DirectionId = 'folio' | 'trace' | 'relay' | 'commonplace'
type Direction = {
  id: DirectionId
  name: string
  number: string
  territory: string
  headline: string[]
  mantra: string
  character: string[]
  colors: { name: string; value: string }[]
  headingFont: FontKey
  bodyFont: FontKey
  hero: string
  emphasis: string
  typeLabel: string
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
const fontFiles = {
  inter: ['inter', 'inter-latin-400-normal.woff'],
  interMedium: ['inter', 'inter-latin-500-normal.woff'],
  interBold: ['inter', 'inter-latin-700-normal.woff'],
  news: ['newsreader', 'newsreader-latin-400-normal.woff'],
  newsItalic: ['newsreader', 'newsreader-latin-400-italic.woff'],
  dm: ['dm-sans', 'dm-sans-latin-400-normal.woff'],
  dmBold: ['dm-sans', 'dm-sans-latin-700-normal.woff'],
  dmHeavy: ['dm-sans', 'dm-sans-latin-900-normal.woff']
} satisfies Record<FontKey, [string, string]>
const fonts = {} as Record<FontKey, { font: Font; bytes: Buffer }>
await mkdir(join(here, 'assets/fonts'), { recursive: true })
for (const [key, [family, filename]] of Object.entries(fontFiles)) {
  const source = join(root, 'node_modules/@fontsource', family)
  const bytes = await readFile(join(source, 'files', filename))
  fonts[key as FontKey] = {
    font: await openType.parse(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    ),
    bytes
  }
  await copyFile(
    join(source, 'files', filename),
    join(here, 'assets/fonts', filename)
  )
  await copyFile(
    join(source, 'LICENSE'),
    join(here, 'assets/fonts', family + '-LICENSE.txt')
  )
}
const normalize = (s: string) => s.replace(/\s+/gu, ' ').trim()
for (const d of data.directions) {
  const spec = normalize(await readFile(join(here, d.id + '.md'), 'utf8'))
  for (const value of [
    d.name,
    d.territory,
    d.headline.join(' '),
    d.mantra,
    d.character.join(' '),
    data.descriptor,
    data.sampleTitle,
    ...data.highlights,
    data.cardLabel,
    data.cta,
    ...d.colors.map((c) => c.value)
  ])
    assert(
      spec.includes(normalize(value)),
      d.id + ' spec/render mismatch: ' + value
    )
}
assert.equal(data.sampleTitleLines.join(' '), data.sampleTitle)
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
      ') format("woff");font-weight:400;font-style:normal;}'
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
function mark(d: Direction, color: string, x = 0, y = 0, size = 100) {
  let body = ''
  if (d.id === 'folio')
    body =
      '<path d="M18 86V18H80M18 52H67M42 86V40H88" fill="none" stroke="' +
      color +
      '" stroke-width="9"/>'
  if (d.id === 'trace')
    body =
      '<path d="M28 14H12V86H28M72 14H88V86H72M28 68H42L60 32H72" fill="none" stroke="' +
      color +
      '" stroke-width="5"/><circle cx="28" cy="68" r="6" fill="' +
      color +
      '"/><circle cx="72" cy="32" r="6" fill="' +
      color +
      '"/>'
  if (d.id === 'relay')
    body =
      '<path d="M10 18L45 50L10 82M48 18L83 50L48 82" fill="none" stroke="' +
      color +
      '" stroke-width="16" stroke-linejoin="miter"/>'
  if (d.id === 'commonplace')
    body =
      '<path d="M50 82C22 76 13 52 17 18C42 22 51 45 50 82ZM50 82C78 76 87 52 83 18C58 22 49 45 50 82Z" fill="none" stroke="' +
      color +
      '" stroke-width="6"/><path d="M30 39L50 82L70 39" fill="none" stroke="' +
      color +
      '" stroke-width="4"/>'
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
function arrow(c: Canvas, x: number, y: number, color: string, size = 20) {
  c.add(
    '<path d="M' +
      x +
      ',' +
      (y + size) +
      'L' +
      (x + size) +
      ',' +
      y +
      'M' +
      x +
      ',' +
      y +
      'H' +
      (x + size) +
      'V' +
      (y + size) +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="2.5"/>'
  )
}
function button(
  c: Canvas,
  x: number,
  y: number,
  bg: string,
  fg: string,
  radius = 0
) {
  c.rect(x, y, 258, 66, bg, radius)
  c.text(data.cta, x + 22, y + 42, 24, 'interMedium', fg)
  arrow(c, x + 211, y + 23, fg, 18)
}
function masthead(c: Canvas, d: Direction, fg: string, accent: string) {
  c.text(
    d.number + ' / ' + d.territory.toUpperCase(),
    88,
    72,
    19,
    'interMedium',
    fg,
    { tracking: 2 }
  )
  c.text('PROPOSED / WORKING NAME', 1512, 72, 18, 'inter', fg, {
    align: 'right',
    tracking: 1.6
  })
  c.add(mark(d, accent, 84, 122, 66))
  c.text(
    d.name,
    167,
    177,
    d.id === 'commonplace' ? 72 : 76,
    d.id === 'relay' ? 'dmHeavy' : d.headingFont,
    fg
  )
}
function footer(c: Canvas, d: Direction, fg: string, y = 1800) {
  c.line(88, y - 30, 1512, y - 30, fg, 1, 0.23)
  c.text('PALETTE / ROLES', 88, y, 17, 'interMedium', fg, { tracking: 1.8 })
  d.colors.forEach((color, i) => {
    const x = 88 + 211 * i
    c.rect(x, y + 23, 186, 52, color.value, 0, fg, 0.6)
    c.text(color.name, x, y + 109, 20, 'interMedium', fg)
    c.text(color.value, x, y + 143, 20, 'inter', fg)
  })
  c.text('TYPE / VOICE', 867, y, 17, 'interMedium', fg, { tracking: 1.8 })
  c.text(
    'Aa / The thinking matters.',
    867,
    y + 69,
    43,
    d.id === 'trace' ? 'interMedium' : d.headingFont,
    fg,
    { maxWidth: 645 }
  )
  c.text(d.typeLabel, 867, y + 117, 23, 'inter', fg)
  c.text(
    'AI CONVERSATIONS, CONSIDERED IN PUBLIC',
    88,
    1994,
    16,
    'interMedium',
    fg,
    { tracking: 1.5 }
  )
  c.text('ROUND 01 / SEPTEMBER 2026', 1512, 1994, 16, 'inter', fg, {
    align: 'right',
    tracking: 1.5
  })
}
function shareCard(d: Direction) {
  const c = new Canvas(1200, 630, d.name + ': illustrative share card concept')
  const bg =
    d.id === 'trace'
      ? '#DFE9DE'
      : d.id === 'relay'
        ? '#FFF9E9'
        : d.id === 'commonplace'
          ? '#FFF9ED'
          : '#FFFCF5'
  const fg =
    d.id === 'trace'
      ? '#10201C'
      : d.id === 'relay'
        ? '#243EDB'
        : d.id === 'commonplace'
          ? '#183E35'
          : '#24211D'
  const accent = d.colors[2]!.value
  c.rect(0, 0, 1200, 630, bg)
  c.photo(d, 878, 0, 322, 630)
  if (d.id === 'folio') c.rect(0, 0, 11, 630, accent)
  if (d.id === 'trace') {
    for (let x = 36; x < 854; x += 42)
      for (let y = 34; y < 610; y += 42) c.circle(x, y, 1, '#B7C8B7')
  }
  if (d.id === 'relay') {
    c.rect(0, 0, 878, 9, fg)
    c.rect(0, 621, 878, 9, fg)
  }
  if (d.id === 'commonplace') c.line(48, 95, 830, 95, fg, 1, 0.25)
  c.text(data.cardLabel, 62, 63, 18, 'interMedium', fg, { tracking: 1.6 })
  const font: FontKey =
    d.id === 'trace' ? 'interBold' : d.id === 'relay' ? 'dmBold' : 'news'
  const size = d.id === 'trace' || d.id === 'relay' ? 57 : 68
  data.sampleTitleLines.forEach((text, i) =>
    c.text(text, 60, 170 + i * 78, size, font, fg, { maxWidth: 776 })
  )
  c.text('AI SUMMARY', 63, 306, 17, 'interMedium', fg, { tracking: 1.5 })
  data.highlights.forEach((text, i) => {
    if (d.id === 'relay') c.rect(63, 344 + 56 * i, 9, 9, fg)
    else c.circle(68, 349 + 56 * i, 4, fg)
    c.text(text, 87, 360 + 56 * i, 30, 'inter', fg, { maxWidth: 735 })
  })
  c.line(62, 526, 817, 526, fg, 1, 0.24)
  c.text('Read the conversation', 63, 579, 22, 'interMedium', fg)
  arrow(c, 323, 560, fg, 16)
  c.add(mark(d, fg, 669, 552, 33))
  c.text(
    d.name,
    714,
    579,
    d.id === 'commonplace' ? 20 : 24,
    d.headingFont,
    fg,
    { maxWidth: 130 }
  )
  return c
}
function folio(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    2040,
    'Folio — editorial authorship — proposed brand direction'
  )
  const bg = '#F3EFE5',
    fg = '#24211D',
    accent = '#C74B34'
  c.rect(0, 0, 1600, 2040, bg)
  masthead(c, d, fg, accent)
  c.line(88, 213, 1512, 213, fg, 1, 0.35)
  c.text(d.headline[0]!, 87, 340, 111, 'news', fg, { maxWidth: 750 })
  c.text(d.headline[1]!, 87, 455, 111, 'newsItalic', fg, { maxWidth: 750 })
  c.wrap(data.descriptor, 92, 539, 642, 29, 43, 'inter', fg)
  button(c, 92, 727, fg, bg)
  c.text('A SMALL ACT OF PUBLISHING', 92, 864, 17, 'interMedium', fg, {
    tracking: 1.8
  })
  c.text('ChatGPT / Claude / Codex', 92, 909, 27, 'inter', fg)
  c.photo(d, 846, 267, 666, 694)
  c.line(88, 1024, 1512, 1024, fg, 1, 0.35)
  c.text('A SHARE, IN THIS WORLD / CONCEPT', 88, 1070, 17, 'interMedium', fg, {
    tracking: 1.8
  })
  c.nested(card, 88, 1121, 0.77)
  c.text('THE FEELING', 1095, 1150, 17, 'interMedium', fg, { tracking: 1.8 })
  d.character.forEach((value, i) =>
    c.text(value, 1095, 1214 + i * 47, 37, 'news', fg, { maxWidth: 417 })
  )
  c.line(1095, 1360, 1512, 1360, accent, 3)
  c.wrap(d.mantra, 1095, 1440, 370, 43, 53, 'newsItalic', fg)
  footer(c, d, fg)
  return c
}
function trace(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    2040,
    'Trace — visible thinking — proposed brand direction'
  )
  const bg = '#10201C',
    fg = '#DFE9DE',
    accent = '#B7F56A'
  c.rect(0, 0, 1600, 2040, bg)
  for (let x = 88; x <= 1512; x += 89) c.line(x, 214, x, 1734, fg, 1, 0.055)
  for (let y = 214; y <= 1734; y += 89) c.line(88, y, 1512, y, fg, 1, 0.055)
  masthead(c, d, fg, accent)
  c.line(88, 213, 1512, 213, fg, 1, 0.3)
  c.text(d.headline[0]!, 87, 350, 109, 'interBold', fg, { maxWidth: 1424 })
  c.text(d.headline[1]!, 87, 472, 109, 'interBold', fg, { maxWidth: 1424 })
  c.wrap(data.descriptor, 89, 585, 350, 29, 43, 'inter', fg)
  button(c, 89, 935, accent, bg)
  c.photo(d, 494, 554, 1018, 624)
  c.text('QUESTION', 89, 1080, 16, 'interMedium', accent, { tracking: 1.5 })
  c.line(91, 1113, 408, 1113, accent, 2)
  for (const x of [91, 247, 408]) c.circle(x, 1113, 5, accent)
  c.text('REFINE', 224, 1080, 16, 'interMedium', accent, { tracking: 1.5 })
  c.text('SHARE', 346, 1080, 16, 'interMedium', accent, { tracking: 1.5 })
  c.text('THE FEELING', 88, 1275, 17, 'interMedium', accent, { tracking: 1.8 })
  d.character.forEach((value, i) =>
    c.text(value, 88, 1347 + i * 55, 43, 'interMedium', fg, { maxWidth: 400 })
  )
  c.wrap(d.mantra, 88, 1550, 367, 34, 45, 'inter', fg)
  c.text('A SHARE, IN THIS WORLD / CONCEPT', 588, 1238, 17, 'interMedium', fg, {
    tracking: 1.8
  })
  c.nested(card, 588, 1280, 0.77)
  footer(c, d, fg, 1810)
  return c
}
function relay(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    2040,
    'Relay — ideas in circulation — proposed brand direction'
  )
  const bg = '#243EDB',
    fg = '#FFF9E9',
    accent = '#EAF05C'
  c.rect(0, 0, 1600, 2040, bg)
  masthead(c, d, fg, accent)
  c.text(d.headline[0]!, 86, 330, 120, 'dmHeavy', fg, { maxWidth: 1424 })
  c.text(d.headline[1]!, 86, 454, 120, 'dmHeavy', accent, { maxWidth: 1424 })
  c.wrap(data.descriptor, 91, 533, 1370, 28, 38, 'inter', fg)
  c.photo(d, 0, 610, 1600, 574)
  c.rect(0, 1174, 1600, 600, accent)
  c.text('A SHARE, IN THIS WORLD / CONCEPT', 88, 1224, 17, 'interMedium', bg, {
    tracking: 1.8
  })
  c.nested(card, 88, 1260, 0.77)
  c.text('THE FEELING', 1095, 1275, 17, 'interMedium', bg, { tracking: 1.8 })
  c.wrap(d.character.join(' '), 1095, 1324, 415, 27, 37, 'dmBold', bg)
  c.wrap(d.mantra, 1095, 1437, 410, 56, 65, 'dmHeavy', bg)
  c.line(1095, 1672, 1460, 1672, bg, 3)
  arrow(c, 1475, 1657, bg, 24)
  footer(c, d, fg, 1810)
  return c
}
function commonplace(d: Direction, card: Canvas) {
  const c = new Canvas(
    1600,
    2040,
    'Commonplace — learning in public — proposed brand direction'
  )
  const bg = '#DDECF1',
    fg = '#183E35',
    accent = '#E88B52'
  c.rect(0, 0, 1600, 2040, bg)
  masthead(c, d, fg, fg)
  c.line(88, 213, 1512, 213, fg, 1, 0.23)
  c.text(d.headline[0]!, 800, 340, 108, 'news', fg, {
    align: 'center',
    maxWidth: 1424
  })
  c.text(d.headline[1]!, 800, 453, 108, 'newsItalic', fg, {
    align: 'center',
    maxWidth: 1424
  })
  c.wrap(data.descriptor, 800, 523, 1000, 29, 40, 'dm', fg, 'center')
  c.photo(d, 200, 596, 1200, 600, 28, 'meet')
  c.circle(207, 891, 21, accent)
  c.circle(1399, 799, 10, fg)
  c.text('A SHARE, IN THIS WORLD / CONCEPT', 88, 1220, 17, 'interMedium', fg, {
    tracking: 1.8
  })
  c.nested(card, 88, 1260, 0.77)
  c.text('THE FEELING', 1095, 1293, 17, 'interMedium', fg, { tracking: 1.8 })
  d.character.forEach((value, i) =>
    c.text(value, 1095, 1352 + i * 45, 37, 'news', fg, { maxWidth: 410 })
  )
  c.line(1095, 1500, 1512, 1500, accent, 4)
  c.wrap(d.mantra, 1095, 1569, 394, 41, 49, 'newsItalic', fg)
  footer(c, d, fg, 1810)
  return c
}
const painters = { folio, trace, relay, commonplace } satisfies Record<
  DirectionId,
  (d: Direction, card: Canvas) => Canvas
>
const posterPngs: Buffer[] = []
await mkdir(join(here, 'assets/marks'), { recursive: true })
for (const d of data.directions) {
  const card = shareCard(d)
  const poster = painters[d.id]!(d, card)
  for (const [name, canvas] of [
    [d.id + '-poster', poster],
    [d.id + '-share-card', card]
  ] as const) {
    const svg = canvas.svg()
    assert(!/href="(?!data:|#)/u.test(svg), 'External image reference found')
    const png = new Resvg(canvas.svg(true)).render().asPng()
    await writeFile(join(here, name + '.svg'), svg)
    await writeFile(join(here, name + '.png'), png)
    if (name.endsWith('-poster')) posterPngs.push(png)
  }
  const fg =
    d.id === 'trace'
      ? '#B7F56A'
      : d.id === 'relay'
        ? '#243EDB'
        : d.colors[1]!.value
  await writeFile(
    join(here, 'assets/marks', d.id + '-mark.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>' +
      d.name +
      ' proposed mark</title>' +
      mark(d, fg) +
      '</svg>'
  )
}
const contact = new Canvas(
  1648,
  2140,
  'Four proposed branding directions: Folio, Trace, Relay, Commonplace'
)
contact.rect(0, 0, 1648, 2140, '#E6E5DF')
contact.text(
  'FOUR DIRECTIONS / ROUND 01',
  24,
  35,
  18,
  'interMedium',
  '#24211D',
  { tracking: 2 }
)
posterPngs.forEach((bytes, i) => {
  const x = 16 + (i % 2) * 816
  const y = 64 + Math.floor(i / 2) * 1036
  contact.add(
    '<image x="' +
      x +
      '" y="' +
      y +
      '" width="800" height="1020" href="data:image/png;base64,' +
      bytes.toString('base64') +
      '"/>'
  )
})
await writeFile(join(here, 'contact-sheet.svg'), contact.svg())
await writeFile(
  join(here, 'contact-sheet.png'),
  new Resvg(contact.svg(true)).render().asPng()
)
await writeFile(
  join(here, 'build-report.json'),
  JSON.stringify(
    {
      status: 'proposed',
      command: 'pnpm exec tsx docs/brand-exploration/round-01/build.ts',
      posterDimensions: [1600, 2040],
      cardDimensions: [1200, 630],
      contactSheetDimensions: [1648, 2140],
      copyAndPaletteValidatedAgainst: data.directions.map((d) => d.id + '.md'),
      fontInputs: Object.values(fontFiles).map(
        ([, file]) => 'assets/fonts/' + file
      ),
      imageDependenciesEmbedded: true,
      measuredTextRuns: measurementRecords.length,
      measuredTextFits: measurementRecords.every(
        (r) => r.width <= r.maxWidth + 0.5
      ),
      editableSvgTypography: 'Text elements with embedded WOFF fonts',
      rasterTypography:
        'Outlines from the same WOFF fonts via the direct @shuding/opentype.js dependency'
    },
    null,
    2
  ) + '\n'
)
console.log(
  'Built 4 proposed posters, 4 illustrative share cards, 4 native marks, and contact sheet. Copy, palettes, image embedding, and ' +
    measurementRecords.length +
    ' text runs validated.'
)

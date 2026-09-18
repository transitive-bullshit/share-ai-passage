import { record } from './normalize'

function publicUrl(value: unknown) {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port
    )
      return
    return url.href.replace(
      /[()<>"\\\s]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    )
  } catch {
    return
  }
}

function label(text: string) {
  return text
    .replace(/[\\`*{}[\]()#+.!_<>|~-]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
}

function referenceMarkdown(
  reference: Record<string, unknown>,
  sourceUrl?: string
) {
  if (reference.type === 'followup_a') {
    const url = publicUrl(sourceUrl)
    if (
      !url ||
      typeof reference.matched_text !== 'string' ||
      typeof reference.prompt_text !== 'string' ||
      !reference.prompt_text.trim()
    )
      return
    const prompt = reference.prompt_text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, ' ')
    return `[${label(reference.matched_text)}](${url} "${prompt}")`
  }
  const items =
    reference.type === 'webpage' || reference.type === 'webpage_extended'
      ? [reference]
      : ['grouped_webpages', 'grouped_webpages_v2'].includes(
            String(reference.type)
          ) && Array.isArray(reference.items)
        ? reference.items
        : []
  const links = new Map<string, string>()
  for (const value of items) {
    const item = record(value)
    const url = publicUrl(item?.url)
    if (!url) continue
    const name =
      [item?.attribution, item?.title].find(
        (value): value is string =>
          typeof value === 'string' && Boolean(value.trim())
      ) ?? new URL(url).hostname
    links.set(url, `[${label(name)}](${url})`)
  }
  if (links.size) return `(${[...links.values()].join(', ')})`
}

/** ChatGPT offsets count Unicode code points, not UTF-16 code units. */
export function chatgptReferenceText(
  text: string,
  references: unknown,
  sourceUrl?: string,
  offset = 0
) {
  if (!Array.isArray(references)) return text
  const points = Array.from(text)
  const replacements: { start: number; end: number; markdown: string }[] = []
  for (const value of references) {
    const reference = record(value)
    if (
      !reference ||
      typeof reference.start_idx !== 'number' ||
      typeof reference.end_idx !== 'number' ||
      typeof reference.matched_text !== 'string'
    )
      continue
    let start = reference.start_idx - offset
    let end = reference.end_idx - offset
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > points.length ||
      points.slice(start, end).join('') !== reference.matched_text
    )
      continue
    const markdown = referenceMarkdown(reference, sourceUrl)
    if (!markdown) continue
    // Older ChatGPT follow-ups wrap the annotated label in a placeholder link.
    if (
      reference.type === 'followup_a' &&
      points[start - 1] === '[' &&
      points.slice(end, end + 4).join('') === '](f)'
    ) {
      start--
      end += 4
    }
    replacements.push({ start, end, markdown })
  }
  replacements.sort((a, b) => a.start - b.start)
  let cursor = 0
  let result = ''
  for (const replacement of replacements) {
    if (replacement.start < cursor) continue
    result +=
      points.slice(cursor, replacement.start).join('') + replacement.markdown
    cursor = replacement.end
  }
  return result + points.slice(cursor).join('')
}

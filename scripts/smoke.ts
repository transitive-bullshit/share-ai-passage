import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import nextEnv from '@next/env'
import { z } from 'zod'

import { SavedMessage } from '../components/saved-message'
import { closeDatabase } from '../lib/db'
import type { Message } from '../lib/domain'
import { getDraft } from '../lib/service'
import { generatedPreviewSchema } from '../lib/summary'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
nextEnv.loadEnvConfig(projectDirectory)

const appOrigin = new URL(process.env.APP_URL || 'http://localhost:3000').origin
const sourceUrls = process.argv.slice(2)
const outputDirectory = path.join(projectDirectory, 'work', 'smoke')
let stage = 'configuration'

const preparationSchema = z.strictObject({
  provider: z.enum(['chatgpt', 'claude']),
  sourceUrl: z.url(),
  draftToken: z.string().min(1),
  preview: generatedPreviewSchema
})
const publicationSchema = z.object({
  publicationId: z.uuid(),
  shareUrl: z.url()
})

type Result = {
  provider: 'chatgpt' | 'claude'
  status: 'running' | 'passed' | 'failed'
  messageCount: number
  shareUrl: string
  previewPngBytes?: number
  imageWidth?: number
  imageHeight?: number
  checks: Record<string, 'passed'>
}

type SmokeReport = {
  status: 'running' | 'passed' | 'failed'
  results: Result[]
  failure?: { stage: string; status: string }
}

const report: SmokeReport = { status: 'running', results: [] }

class SmokeFailure extends Error {}

function verify(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message)
}

async function saveReport() {
  await writeFile(
    path.join(outputDirectory, 'summary.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )
}

async function request(url: string, init: RequestInit = {}) {
  const target = new URL(url, appOrigin)
  verify(
    target.origin === appOrigin,
    'The app returned a share URL on an unexpected origin.'
  )
  return fetch(target, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(60_000)
  })
}

async function post(url: string, body: unknown) {
  return request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: appOrigin,
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Passage local smoke test/1.0'
    },
    body: JSON.stringify(body)
  })
}

function privateResponse(response: Response) {
  verify(
    response.headers.get('cache-control')?.includes('no-store'),
    'The response must not cache saved content.'
  )
  verify(
    response.headers.get('x-robots-tag')?.includes('noindex'),
    'The response must prohibit indexing.'
  )
}

async function readJson<T extends z.ZodType>(
  response: Response,
  schema: T
): Promise<z.output<T>> {
  verify(
    response.ok,
    `HTTP ${response.status}${response.headers.has('retry-after') ? ' (retry cooldown)' : ''}`
  )
  privateResponse(response)
  const result = schema.safeParse(await response.json())
  verify(result.success, 'The API response has an unexpected shape.')
  return result.data
}

async function png(response: Response) {
  verify(response.ok, `PNG returned HTTP ${response.status}.`)
  privateResponse(response)
  verify(
    response.headers.get('content-type')?.startsWith('image/png'),
    'The card must use image/png.'
  )
  const bytes = Buffer.from(await response.arrayBuffer())
  verify(
    bytes.length >= 24 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'The card does not have a PNG signature.'
  )
  verify(
    bytes.toString('ascii', 12, 16) === 'IHDR',
    'The PNG has no valid dimension header.'
  )
  verify(
    bytes.readUInt32BE(16) === 1200 && bytes.readUInt32BE(20) === 630,
    'The PNG must be 1200 by 630 pixels.'
  )
  return bytes
}

function decodeAttribute(value: string) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi,
    (entity) => {
      const named = new Map([
        ['&amp;', '&'],
        ['&quot;', '"'],
        ['&apos;', "'"],
        ['&lt;', '<'],
        ['&gt;', '>']
      ])
      const replacement = named.get(entity.toLowerCase())
      if (replacement) return replacement
      const code = /^&#x/i.test(entity)
        ? Number.parseInt(entity.slice(3, -1), 16)
        : Number.parseInt(entity.slice(2, -1), 10)
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity
    }
  )
}

function attributes(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(
      (match) => [match[1]!, decodeAttribute(match[2] ?? match[3]!)]
    )
  )
}

function validateReader(
  html: string,
  prepared: z.infer<typeof preparationSchema>,
  messages: Message[],
  shareUrl: string
) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  verify(head, 'The initial reader HTML has no head element.')
  const meta = new Map<string, string>()
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const value = attributes(match[0])
    const key = value.name || value.property
    if (key && value.content) meta.set(key, value.content)
  }
  verify(
    meta.get('og:title') === prepared.preview.title,
    'The initial Open Graph title does not match the generated preview.'
  )
  verify(
    meta.get('twitter:title') === prepared.preview.title,
    'The initial Twitter title does not match the generated preview.'
  )
  verify(
    meta.get('og:url') === shareUrl,
    'Open Graph must identify the immutable share URL.'
  )
  verify(
    meta.get('og:image') === `${shareUrl}/image`,
    'Open Graph must contain the absolute card image URL.'
  )
  verify(
    meta.get('twitter:image') === `${shareUrl}/image`,
    'Twitter must contain the absolute card image URL.'
  )
  verify(
    meta.get('og:image:width') === '1200' &&
      meta.get('og:image:height') === '630',
    'Open Graph must declare card dimensions.'
  )
  verify(
    meta.get('og:image:type') === 'image/png',
    'Open Graph must declare the PNG content type.'
  )
  verify(
    meta.get('twitter:card') === 'summary_large_image',
    'The reader must request the large Twitter card.'
  )
  verify(
    meta.get('robots')?.includes('noindex'),
    'The initial reader must include noindex metadata.'
  )

  const description = prepared.preview.highlights.join(' ')
  verify(
    meta.get('description') === description &&
      meta.get('og:description') === description &&
      meta.get('twitter:description') === description,
    'Reader and social descriptions must contain the generated highlights.'
  )
  const summary = html.match(
    /<section\b[^>]*\bclass="reader-summary"[^>]*>([\s\S]*?)<\/section>/i
  )?.[1]
  verify(summary, 'The reader must display the generated summary.')
  verify(
    /<h2\b[^>]*>\s*AI summary\s*<\/h2>/i.test(summary),
    'The generated takeaways must be labeled as an AI summary.'
  )
  const highlights = [...summary.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(
    (match) => decodeAttribute(match[1]!)
  )
  verify(
    JSON.stringify(highlights) === JSON.stringify(prepared.preview.highlights),
    'The reader must preserve every generated highlight in order.'
  )
  verify(
    !html.includes('SELECTED PASSAGE') &&
      !html.includes('class="reader-excerpt"'),
    'A generated summary must not be presented as a selected original quote.'
  )
  const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(
    (match) => attributes(match[0]).href
  )
  verify(
    links.includes(prepared.sourceUrl),
    'The reader must link to the canonical original source.'
  )
  const renderedMessages = [
    ...html.matchAll(/<article\b[^>]*\bid="message-\d+"/g)
  ].length
  verify(
    renderedMessages === messages.length,
    'The reader must preserve every prepared message in order.'
  )
  let previousOffset = -1
  for (const [index, message] of messages.entries()) {
    const expectedArticle = renderToStaticMarkup(
      createElement(SavedMessage, { message, index })
    )
    const offset = html.indexOf(expectedArticle)
    verify(
      offset > previousOffset,
      'The reader must render each complete saved message in its original order.'
    )
    previousOffset = offset
  }
}

async function smokeSource(sourceUrl: string, index: number) {
  stage = `source ${index + 1}: preparation`
  const prepared = await readJson(
    await post('/api/prepare', { url: sourceUrl }),
    preparationSchema
  )
  const draft = await getDraft(prepared.draftToken)
  verify(
    draft.snapshot.messages.length > 0 &&
      draft.source.canonicalUrl === prepared.sourceUrl &&
      JSON.stringify(draft.preview) === JSON.stringify(prepared.preview),
    'Preparation must expose the generated preview for its complete saved snapshot.'
  )
  stage = `${prepared.provider}: repeat preparation`
  const cached = await readJson(
    await post('/api/prepare', { url: sourceUrl }),
    preparationSchema
  )
  const cachedDraft = await getDraft(cached.draftToken)
  verify(
    cachedDraft.snapshot.id === draft.snapshot.id &&
      JSON.stringify(cachedDraft.snapshot.messages) ===
        JSON.stringify(draft.snapshot.messages),
    'Repeat preparation changed the saved transcript.'
  )
  verify(
    JSON.stringify(cached.preview) === JSON.stringify(prepared.preview),
    'Repeat preparation changed the cached generated preview.'
  )

  stage = `${prepared.provider}: read-only preview enforcement`
  const publishBody = { draftToken: prepared.draftToken }
  for (const route of ['/api/card', '/api/publish']) {
    for (const edit of [
      { title: 'Caller-supplied title' },
      { highlights: ['Caller-supplied summary'] },
      { preview: { ...prepared.preview, title: 'Caller-supplied title' } },
      {
        selection: {
          title: 'Caller-supplied title',
          messageId: 'custom',
          start: 0,
          end: 1
        }
      }
    ]) {
      const tampered = await post(route, { ...publishBody, ...edit })
      verify(
        tampered.status === 400,
        `${route} must reject caller-supplied preview edits with HTTP 400.`
      )
      privateResponse(tampered)
      await tampered.body?.cancel()
    }
  }

  stage = `${prepared.provider}: publication and duplicate`
  const published = await readJson(
    await post('/api/publish', publishBody),
    publicationSchema
  )
  const duplicate = await readJson(
    await post('/api/publish', publishBody),
    publicationSchema
  )
  verify(
    published.publicationId === duplicate.publicationId &&
      published.shareUrl === duplicate.shareUrl,
    'An exact duplicate must reuse its publication.'
  )
  const repeatedDraft = await readJson(
    await post('/api/publish', { draftToken: cached.draftToken }),
    publicationSchema
  )
  verify(
    repeatedDraft.publicationId === published.publicationId &&
      repeatedDraft.shareUrl === published.shareUrl,
    'A repeated preparation of the same preview must reuse its publication.'
  )
  verify(
    new URL(published.shareUrl).pathname ===
      `/${prepared.provider}/${published.publicationId}`,
    'The share route must match the saved provider.'
  )
  const result: Result = {
    provider: prepared.provider,
    status: 'running',
    messageCount: draft.snapshot.messages.length,
    shareUrl: published.shareUrl,
    checks: {
      repeatPreparation: 'passed',
      duplicatePublication: 'passed',
      readOnlyPreview: 'passed',
      repeatedDraftPublication: 'passed'
    }
  }
  report.results.push(result)
  await saveReport()

  stage = `${prepared.provider}: deterministic PNGs`
  const preview = await png(await post('/api/card', publishBody))
  const publicCard = await png(await request(`${published.shareUrl}/image`))
  verify(
    preview.equals(publicCard),
    'The draft preview and published PNG must be byte-identical.'
  )
  await writeFile(
    path.join(outputDirectory, `${index + 1}-${prepared.provider}-preview.png`),
    preview
  )
  await writeFile(
    path.join(outputDirectory, `${index + 1}-${prepared.provider}-public.png`),
    publicCard
  )
  result.previewPngBytes = preview.length
  result.imageWidth = 1200
  result.imageHeight = 630
  result.checks.previewMatchesPublicPng = 'passed'
  await saveReport()

  stage = `${prepared.provider}: initial reader and crawler metadata`
  for (const userAgent of [
    'Mozilla/5.0 PassageSmoke/1.0',
    'Twitterbot/1.0',
    'facebookexternalhit/1.1'
  ]) {
    const reader = await request(published.shareUrl, {
      headers: { 'User-Agent': userAgent }
    })
    verify(reader.ok, `Reader returned HTTP ${reader.status}.`)
    privateResponse(reader)
    validateReader(
      await reader.text(),
      prepared,
      draft.snapshot.messages,
      published.shareUrl
    )
  }
  const unchangedDraft = await getDraft(prepared.draftToken)
  verify(
    JSON.stringify(unchangedDraft.snapshot.messages) ===
      JSON.stringify(draft.snapshot.messages) &&
      JSON.stringify(unchangedDraft.preview) ===
        JSON.stringify(prepared.preview),
    'Publishing and reading must leave the stored transcript and generated summary unchanged.'
  )

  stage = `${prepared.provider}: wrong provider routes`
  const wrongProvider = prepared.provider === 'chatgpt' ? 'claude' : 'chatgpt'
  for (const suffix of ['', '/image']) {
    const wrong = await request(
      `/${wrongProvider}/${published.publicationId}${suffix}`
    )
    verify(
      wrong.status === 404,
      'A publication must return 404 under the wrong provider route.'
    )
    await wrong.body?.cancel()
  }

  result.status = 'passed'
  Object.assign(result.checks, {
    initialCrawlerMetadata: 'passed',
    allSavedMessages: 'passed',
    summaryAndMetadataMatch: 'passed',
    unchangedSnapshot: 'passed',
    originalSourceLink: 'passed',
    wrongProvider404: 'passed',
    noStoreAndNoindex: 'passed'
  })
  await saveReport()
  console.log(
    `${prepared.provider}: passed, ${draft.snapshot.messages.length} saved messages, ${published.shareUrl}`
  )
}

await mkdir(outputDirectory, { recursive: true })
try {
  const hostname = new URL(appOrigin).hostname
  verify(
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      hostname.endsWith('.localhost'),
    'Run the smoke against a local application origin.'
  )
  verify(
    sourceUrls.length > 0,
    'Usage: pnpm smoke <public-share-url> [another-public-share-url]'
  )
  for (const [index, sourceUrl] of sourceUrls.entries())
    await smokeSource(sourceUrl, index)
  report.status = 'passed'
  await saveReport()
  console.log(`Smoke checks passed. Summary and PNGs: ${outputDirectory}`)
} catch (err) {
  const status =
    err instanceof SmokeFailure
      ? err.message
      : err instanceof Error
        ? err.name
        : 'Unexpected failure'
  report.status = 'failed'
  const current = report.results.at(-1)
  if (current?.status === 'running') current.status = 'failed'
  report.failure = { stage, status }
  await saveReport()
  console.error(`Smoke check failed at ${stage}: ${status}`)
  process.exitCode = 1
} finally {
  await closeDatabase()
}

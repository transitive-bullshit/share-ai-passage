import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import nextEnv from '@next/env'
import { and, eq } from 'drizzle-orm'

import { renderCard } from '../lib/card'
import type { CardAppearance } from '../lib/card-appearance'
import { appUrl } from '../lib/config'
import { closeDatabase, getDb } from '../lib/db'
import { publications, snapshots, sources } from '../lib/db/schema'
import { createDraftToken } from '../lib/drafts'
import { webpDimensions } from '../lib/webp'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
nextEnv.loadEnvConfig(projectDirectory)

const appOrigin = new URL(process.env.PASSAGE_URL || appUrl()).origin
const sourceId = randomUUID()
const sourceShareId = randomUUID()
const snapshotId = randomUUID()
const publicationIds = [randomUUID(), randomUUID()]
const appearances: CardAppearance[] = [
  { templateId: 'margin-notes' },
  { templateId: 'midnight-observatory' }
]
const marker = `REMOVAL_MARKER_${sourceShareId.replaceAll('-', '')}`
const text = `Synthetic transcript ${marker}. This authored fixture checks removal enforcement only.`
const canonicalUrl = `https://chatgpt.com/share/${sourceShareId}`
const preview = {
  title: `Removal ${sourceShareId}`,
  highlights: [
    `This synthetic fixture checks removal for ${marker}.`,
    'Confirmed source removal disables saved readers and social previews.'
  ]
}
const outputDirectory = path.join(projectDirectory, 'work', 'smoke')
let stage = 'configuration'
let fixtureTouched = false

type RemovalReport = {
  status: 'running' | 'passed' | 'failed'
  checkScope: 'presentation enforcement; provider checking is covered by lifecycle integration tests'
  publicationCount: number
  fixtureSourcesRemoved: number
  checks: Record<string, 'passed'>
  failure?: { stage: string; status: string }
}

const report: RemovalReport = {
  status: 'running',
  checkScope:
    'presentation enforcement; provider checking is covered by lifecycle integration tests',
  publicationCount: publicationIds.length,
  fixtureSourcesRemoved: 0,
  checks: {}
}

class SmokeFailure extends Error {}

function verify(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message)
}

function failureStatus(err: unknown) {
  return err instanceof SmokeFailure
    ? err.message
    : err instanceof Error
      ? err.name
      : 'Unexpected failure'
}

function privateResponse(response: Response) {
  verify(
    response.headers.get('cache-control')?.includes('no-store'),
    'The response must prohibit storing saved content.'
  )
  verify(
    response.headers.get('x-robots-tag')?.includes('noindex'),
    'The response must prohibit indexing.'
  )
}

async function request(route: string, init: RequestInit = {}) {
  return fetch(new URL(route, appOrigin), {
    ...init,
    redirect: init.redirect ?? 'error',
    signal: AbortSignal.timeout(60_000)
  })
}

function sharePath(id: string) {
  return `/chatgpt/${id}`
}

function assertNoSavedContent(value: string) {
  verify(
    !value.includes(marker) &&
      !value.includes(preview.title) &&
      preview.highlights.every((highlight) => !value.includes(highlight)),
    'A disabled response exposed its original title, summary, or transcript marker.'
  )
}

async function readText(response: Response) {
  verify(response.status === 200, `Reader returned HTTP ${response.status}.`)
  privateResponse(response)
  return response.text()
}

async function webpDigest(response: Response) {
  verify(response.status === 200, `Card returned HTTP ${response.status}.`)
  privateResponse(response)
  verify(
    response.headers.get('content-type')?.startsWith('image/webp'),
    'The card must be served as image/webp.'
  )
  const bytes = Buffer.from(await response.arrayBuffer())
  const dimensions = webpDimensions(bytes)
  verify(dimensions, 'The card has no valid WebP dimension header.')
  verify(
    dimensions.width === 1200 && dimensions.height === 630,
    'The card must be 1200 by 630 pixels.'
  )
  return createHash('sha256').update(bytes).digest('hex')
}

async function unavailableReader(route: string, init?: RequestInit) {
  const body = await readText(await request(route, init))
  assertNoSavedContent(body)
  verify(
    body.toLowerCase().includes('unavailable'),
    'The disabled reader must explain that the original is unavailable.'
  )
}

async function rsc(route: string) {
  const headers = { RSC: '1', Accept: 'text/x-component' }
  let response = await request(route, { headers, redirect: 'manual' })
  // Next 16.3 canonicalizes its RSC cache key before serving the component payload.
  // Follow that one observed correction only, never a changed origin or reader path.
  if (response.status === 307 || response.status === 308) {
    const location = response.headers.get('location')
    verify(location, 'The RSC redirect must supply its destination.')
    const originalUrl = new URL(route, appOrigin)
    const destination = new URL(location, originalUrl)
    verify(
      destination.origin === appOrigin &&
        destination.pathname === originalUrl.pathname &&
        !destination.username &&
        !destination.password,
      'The RSC correction must stay on the same local reader path.'
    )
    await response.body?.cancel()
    response = await request(destination.href, { headers, redirect: 'manual' })
  }
  verify(
    response.headers.get('content-type')?.includes('text/x-component'),
    'The RSC check must receive a React Server Component response.'
  )
  return readText(response)
}

async function rejectedDraft(
  route: string,
  draftToken: string,
  format?: 'html'
) {
  const response = await request(route, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: appOrigin,
      'Sec-Fetch-Site': 'same-origin'
    },
    body: JSON.stringify({ draftToken, format })
  })
  verify(
    response.status === 410,
    `The stale draft endpoint must return 410, received ${response.status}.`
  )
  privateResponse(response)
  assertNoSavedContent(await response.text())
}

try {
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
  verify(
    loopback.has(new URL(appOrigin).hostname) ||
      new URL(appOrigin).hostname.endsWith('.localhost'),
    'Run the removal smoke against a local application origin.'
  )
  verify(
    process.env.DATABASE_URL &&
      loopback.has(new URL(process.env.DATABASE_URL).hostname),
    'Run the removal smoke against a local PostgreSQL database.'
  )

  stage = 'synthetic fixture setup'
  const db = getDb()
  fixtureTouched = true
  await db.transaction(async (tx) => {
    const now = new Date()
    // These authored fixtures are never fetched from the provider. Fresh availability
    // prevents ordinary reader visits from launching an automatic upstream check.
    await tx.insert(sources).values({
      id: sourceId,
      provider: 'chatgpt',
      providerShareId: sourceShareId,
      canonicalUrl,
      availability: 'available',
      lastCheckedAt: now,
      lastAttemptAt: now,
      latestSnapshotVerifiedAt: now
    })
    await tx.insert(snapshots).values({
      id: snapshotId,
      sourceId,
      title: preview.title,
      contentHash: createHash('sha256').update(text).digest('hex'),
      messages: [
        {
          id: 'synthetic-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }]
        }
      ],
      parserVersion: 'synthetic-removal-smoke-v1',
      preview,
      capturedAt: now
    })
    await tx
      .update(sources)
      .set({ latestSnapshotId: snapshotId })
      .where(eq(sources.id, sourceId))
    await tx.insert(publications).values(
      publicationIds.map((id, index) => ({
        id,
        sourceId,
        snapshotId,
        fingerprint: randomUUID(),
        ...preview,
        appearance: appearances[index]!,
        cardVersion: 3
      }))
    )
  })
  const draftToken = createDraftToken(snapshotId, 0, preview)

  stage = 'active reader, RSC, and cards'
  const activeDigests = []
  for (const [index, id] of publicationIds.entries()) {
    const html = await readText(await request(sharePath(id)))
    verify(
      html.includes(preview.title) && html.includes(marker),
      'The active fixture must expose its authored title and transcript before removal.'
    )
    verify(
      html.includes('class="reader-summary"') &&
        preview.highlights.every((highlight) => html.includes(highlight)),
      'The publication must display its saved AI summary.'
    )
    const componentResponse = await rsc(sharePath(id))
    verify(
      componentResponse.includes(marker),
      'The active RSC fixture must contain the authored transcript before removal.'
    )
    activeDigests.push(
      await webpDigest(await request(`${sharePath(id)}/image`))
    )
    const draftCardDigest = await webpDigest(
      await request('/api/card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: appOrigin,
          'Sec-Fetch-Site': 'same-origin'
        },
        body: JSON.stringify({ draftToken, appearance: appearances[index]! })
      })
    )
    verify(
      draftCardDigest === activeDigests[index],
      'The styled draft card must match its active publication card.'
    )
  }
  verify(
    activeDigests[0] !== activeDigests[1],
    'The same generated preview must produce distinct cards for different styles.'
  )
  report.checks.activeReaderRscAndDistinctCards = 'passed'
  report.checks.generatedSummaryPresentation = 'passed'
  report.checks.styledDraftsMatchPublications = 'passed'

  stage = 'simulate confirmed source unavailability'
  // This tests HTTP presentation enforcement. The provider evidence, source leases,
  // and checker transitions are independently covered by tests/lifecycle.test.ts.
  await db.transaction(async (tx) => {
    await tx
      .select()
      .from(sources)
      .where(eq(sources.id, sourceId))
      .for('update')
    const now = new Date()
    await tx
      .update(sources)
      .set({ availability: 'unavailable', lastCheckedAt: now, updatedAt: now })
      .where(eq(sources.id, sourceId))
    await tx
      .update(publications)
      .set({ disabledAt: now })
      .where(eq(publications.sourceId, sourceId))
  })

  const genericDigest = await webpDigest(await renderCard({ disabled: true }))
  stage = 'disabled reader, HEAD, crawler, RSC, and cache variants'
  for (const [index, id] of publicationIds.entries()) {
    const route = sharePath(id)
    for (const suffix of ['', `?arbitrary-cache-key=${randomUUID()}`]) {
      await unavailableReader(`${route}${suffix}`)
      await unavailableReader(`${route}${suffix}`, {
        headers: { 'User-Agent': 'Twitterbot/1.0' }
      })
      const head = await request(`${route}${suffix}`, { method: 'HEAD' })
      verify(head.status === 200, `Disabled HEAD returned HTTP ${head.status}.`)
      privateResponse(head)
      assertNoSavedContent(JSON.stringify([...head.headers]))
      verify(
        (await head.text()).length === 0,
        'HEAD must not contain a response body.'
      )
      const digest = await webpDigest(await request(`${route}/image${suffix}`))
      verify(
        digest === genericDigest && digest !== activeDigests[index],
        'A disabled image must serve only the generic unavailable card.'
      )
    }
    const componentResponse = await rsc(`${route}?_rsc=${randomUUID()}`)
    assertNoSavedContent(componentResponse)
    verify(
      componentResponse.toLowerCase().includes('unavailable'),
      'The disabled RSC response must render the generic unavailable reader.'
    )
    for (const suffix of ['', '/image']) {
      const wrongProvider = await request(
        `/claude/${id}${suffix}?cache=${randomUUID()}`
      )
      verify(
        wrongProvider.status === 404,
        'A mismatched provider must return 404.'
      )
      assertNoSavedContent(await wrongProvider.text())
    }
  }
  Object.assign(report.checks, {
    disabledReaderHeadAndCrawler: 'passed',
    disabledRscContainsNoSavedContent: 'passed',
    genericImagesAndCacheVariants: 'passed',
    wrongProvider404: 'passed'
  })

  stage = 'disabled draft preview and publish endpoints'
  await rejectedDraft('/api/card', draftToken)
  await rejectedDraft('/api/card', draftToken, 'html')
  await rejectedDraft('/api/publish', draftToken)
  report.checks.staleDraftPreviewAndPublish410 = 'passed'

  stage = 'source recovery preserves disabled publications'
  await db
    .update(sources)
    .set({
      availability: 'available',
      publicationGeneration: 1,
      lastCheckedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(sources.id, sourceId))
  for (const id of publicationIds) {
    await unavailableReader(`${sharePath(id)}?recovered=${randomUUID()}`)
    verify(
      (await webpDigest(
        await request(`${sharePath(id)}/image?recovered=${randomUUID()}`)
      )) === genericDigest,
      'Source recovery must not revive an old publication card.'
    )
  }
  await rejectedDraft('/api/card', draftToken)
  await rejectedDraft('/api/card', draftToken, 'html')
  await rejectedDraft('/api/publish', draftToken)
  report.checks.recoveredSourceKeepsOldPublicationsDisabled = 'passed'
  report.status = 'passed'
} catch (err) {
  report.status = 'failed'
  report.failure = { stage, status: failureStatus(err) }
} finally {
  if (fixtureTouched) {
    try {
      // Never remove app-wide budgets or any real source. Cascades remove only this
      // uniquely identified source's synthetic snapshots and publications.
      const removed = await getDb()
        .delete(sources)
        .where(
          and(
            eq(sources.id, sourceId),
            eq(sources.providerShareId, sourceShareId),
            eq(sources.canonicalUrl, canonicalUrl)
          )
        )
        .returning({ id: sources.id })
      report.fixtureSourcesRemoved = removed.length
    } catch (err) {
      report.status = 'failed'
      report.failure = { stage: 'fixture cleanup', status: failureStatus(err) }
    }
  }
  await closeDatabase()
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(
    path.join(outputDirectory, 'removal.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )
}

if (report.status === 'passed') {
  console.log(
    `Removal presentation smoke passed for ${report.publicationCount} synthetic publications. Fixture source removed: ${report.fixtureSourcesRemoved}.`
  )
} else {
  console.error(
    `Removal smoke failed at ${report.failure?.stage}: ${report.failure?.status}`
  )
  process.exitCode = 1
}

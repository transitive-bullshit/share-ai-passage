import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { renderCard, renderCardPreview } from '../lib/card'
import { messageText } from '../lib/messages'
import { socialTemplates } from '../lib/social-templates'
import { summaryInput, validateGeneratedPreview } from '../lib/summary'
import { reviewFixtures } from './share-card-review/fixtures'
import {
  assertComparable,
  countWords,
  hash,
  validateSnapshot
} from './share-card-review/checks'
import type { ReviewCase, ReviewSnapshot } from './share-card-review/model'
import { renderReviewReport } from './share-card-review/report'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(project, 'work/share-card-review')
const taskFiles = [
  'lib/suggestions.ts',
  'lib/summary.ts',
  'lib/messages.ts',
  'lib/domain.ts',
  'pnpm-lock.yaml'
]
const renderFiles = [
  'lib/card.tsx',
  'lib/social-card.tsx',
  'lib/social-templates.ts',
  'lib/card-fonts.ts',
  'lib/card-appearance.ts',
  'lib/card-text-fit.ts',
  'lib/brand.ts',
  'components/brand-mark.tsx',
  'public/social-templates',
  'assets/fonts',
  'pnpm-lock.yaml'
]
const usage = `Share card review

  pnpm cards:review start <run> [--from <snapshot>] [--generate]
  pnpm cards:review update <run> [--generate]
  pnpm cards:review serve [--port <port>]

Start freezes the before once; --from imports its saved images and summaries.
Update replaces the after only when its full capture succeeds. Keep using
the same <run>.html page for each tweak. Each chat keeps one representative style.
--generate calls the current AI task once per chat (paid), using the same inputs.
Without it, update preserves the latest candidate's summaries (or before text first).
Reports and complete source chats stay in ignored work/share-card-review.

Historical capture tools remain available:
  pnpm cards:review capture <name> [--from <snapshot>] [--generate]
  pnpm cards:review compare <before> <after>
`

function name(value: string | undefined) {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) {
    throw new Error(
      'Use a snapshot name with 1–64 lowercase letters, numbers, or hyphens.'
    )
  }
  return value
}

async function readSnapshot(id: string) {
  const value: unknown = JSON.parse(
    await readFile(join(output, name(id), 'snapshot.json'), 'utf8')
  )
  const snapshot = validateSnapshot(value)
  if (snapshot.name !== id)
    throw new Error('Snapshot name does not match its directory.')
  return snapshot
}

async function exists(path: string) {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT')
      return false
    throw err
  }
}

function captureOptions(args: string[], allowFrom = true) {
  let from: string | undefined
  let generate = false
  while (args.length) {
    const flag = args.shift()
    if (flag === '--from' && allowFrom && !from) from = name(args.shift())
    else if (flag === '--generate' && !generate) generate = true
    else throw new Error('Unknown or repeated option. Use --help.')
  }
  if (
    generate &&
    (process.env.CI || process.env.VITEST || process.env.NODE_ENV === 'test')
  ) {
    throw new Error('Live generation is disabled in CI and test environments.')
  }
  return { from, generate }
}

async function verifyArtifacts(
  snapshot: ReviewSnapshot,
  directory = join(output, snapshot.name)
) {
  for (const entry of snapshot.cases) {
    for (const card of entry.cards) {
      if (
        hash(await readFile(join(directory, card.image))) !== card.imageHash ||
        hash(await readFile(join(directory, card.html))) !== card.htmlHash
      ) {
        throw new Error(
          `Saved card changed in ${snapshot.name}; restore the capture before comparing.`
        )
      }
    }
  }
}

async function saveSnapshot(snapshot: ReviewSnapshot, directory: string) {
  validateSnapshot(snapshot)
  await writeFile(
    join(directory, 'snapshot.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    { flag: 'wx' }
  )
}

async function fingerprint(paths: string[]) {
  const digest = createHash('sha256')
  async function add(path: string) {
    const absolute = join(project, path)
    if ((await stat(absolute)).isDirectory()) {
      for (const child of (await readdir(absolute)).sort())
        await add(`${path}/${child}`)
    } else {
      digest
        .update(path)
        .update('\0')
        .update(await readFile(absolute))
        .update('\0')
    }
  }
  for (const path of paths) await add(path)
  return digest.digest('hex')
}

async function captureSnapshot(
  id: string,
  generate: boolean,
  previous?: ReviewSnapshot,
  directory = join(output, id)
) {
  const fixtures = previous?.cases ?? reviewFixtures
  if (
    fixtures.length < 1 ||
    new Set(fixtures.map((entry) => entry.id)).size !== fixtures.length
  ) {
    throw new Error('The review corpus needs unique case IDs.')
  }
  for (const fixture of fixtures) {
    name(fixture.id)
    if (!generate && !previous) validateGeneratedPreview(fixture.preview)
  }
  const selectedTemplates = fixtures.map((fixture, index) => {
    const savedCards = previous?.cases.find(
      (entry) => entry.id === fixture.id
    )?.cards
    const templateId = savedCards?.length
      ? savedCards[index % savedCards.length]!.templateId
      : socialTemplates[index % socialTemplates.length]!.id
    const template = socialTemplates.find((item) => item.id === templateId)
    if (!template)
      throw new Error(
        `Saved style ${templateId} is no longer available. Capture a new representative baseline.`
      )
    return template
  })
  await mkdir(output, { recursive: true })
  try {
    await mkdir(directory)
  } catch {
    throw new Error(
      `Capture ${id} already exists or cannot be created. Choose a new name.`
    )
  }
  try {
    let generatePreview:
      | typeof import('../lib/suggestions').suggestPreview
      | undefined
    let model: string | null = null
    if (generate) {
      const { loadEnvConfig } = await import('@next/env')
      loadEnvConfig(project)
      if (!process.env.OPENAI_API_KEY?.trim())
        throw new Error('Set OPENAI_API_KEY in .env.local for --generate.')
      if (
        process.env.AI_PROVIDER?.trim() &&
        process.env.AI_PROVIDER.trim() !== 'openai'
      ) {
        throw new Error('Live review generation requires AI_PROVIDER=openai.')
      }
      const suggestions = await import('../lib/suggestions')
      generatePreview = suggestions.suggestPreview
      model = process.env.AI_MODEL?.trim() || suggestions.defaultPreviewModel
    }
    execFileSync('pnpm', ['fonts:prepare'], { cwd: project, stdio: 'pipe' })
    const taskHash = await fingerprint(taskFiles)
    const rendererHash = await fingerprint(renderFiles)
    const cases: ReviewCase[] = []
    console.log(
      `Capturing ${fixtures.length} representative cards, one per chat${generate ? `; ${fixtures.length} live ${model} requests` : '; saved text, no model calls'}.`
    )
    for (const [index, fixture] of fixtures.entries()) {
      const saved = previous?.cases.find((entry) => entry.id === fixture.id)
      let preview =
        saved || generate
          ? fixture.preview
          : validateGeneratedPreview(fixture.preview)
      if (generatePreview) {
        try {
          preview = await generatePreview(fixture.source)
        } catch {
          throw new Error(
            `Summary generation failed for ${fixture.id}. No capture was saved; completed requests may still be billed.`
          )
        }
      }
      const entry: ReviewCase = {
        id: fixture.id,
        label: fixture.label,
        topic: fixture.topic,
        source: fixture.source,
        sourceHash: hash(fixture.source),
        preview,
        provider: fixture.provider,
        reviewNotes: fixture.reviewNotes,
        summaryOrigin: generate
          ? 'generated'
          : (saved?.summaryOrigin ?? 'authored'),
        summaryModel: generate ? model : (saved?.summaryModel ?? null),
        summaryTaskHash: generate ? taskHash : (saved?.summaryTaskHash ?? null),
        summaryGeneratedAt: generate
          ? new Date().toISOString()
          : (saved?.summaryGeneratedAt ?? null),
        inputTruncated:
          saved && !generate
            ? saved.inputTruncated
            : Boolean(JSON.parse(summaryInput(fixture.source)).truncated),
        metrics: {
          sourceWords: countWords(
            fixture.source.messages.map(messageText).join(' ')
          ),
          titleWords: countWords(preview.title),
          highlightWords: countWords(preview.highlights.join(' ')),
          totalWords: countWords(
            [preview.title, ...preview.highlights].join(' ')
          )
        },
        cards: []
      }
      await mkdir(join(directory, entry.id))
      const template = selectedTemplates[index]!
      const appearance = { templateId: template.id }
      const data = { ...preview, provider: fixture.provider }
      const image = `${entry.id}/${template.id}.webp`
      const html = `${entry.id}/${template.id}.html`
      const bytes = Buffer.from(
        await (await renderCard(data, appearance)).arrayBuffer()
      )
      const previewHtml = await (
        await renderCardPreview(data, appearance)
      ).text()
      await writeFile(join(directory, image), bytes, { flag: 'wx' })
      await writeFile(join(directory, html), previewHtml, { flag: 'wx' })
      entry.cards.push({
        templateId: template.id,
        image,
        html,
        imageHash: hash(bytes),
        htmlHash: hash(Buffer.from(previewHtml))
      })
      cases.push(entry)
      console.log(
        `${index + 1}/${fixtures.length} ${entry.label}: ${entry.metrics.totalWords} words`
      )
    }
    if (
      taskHash !== (await fingerprint(taskFiles)) ||
      rendererHash !== (await fingerprint(renderFiles))
    ) {
      throw new Error(
        'Summary or renderer inputs changed during capture. Capture again after the edits finish.'
      )
    }
    const snapshot: ReviewSnapshot = {
      version: 1,
      name: id,
      createdAt: new Date().toISOString(),
      revision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: project,
        encoding: 'utf8'
      }).trim(),
      dirty: Boolean(
        execFileSync('git', ['status', '--porcelain'], {
          cwd: project,
          encoding: 'utf8'
        }).trim()
      ),
      taskHash,
      rendererHash,
      corpusHash: hash(
        cases.map(({ id: caseId, sourceHash, provider }) => ({
          id: caseId,
          sourceHash,
          provider
        }))
      ),
      templates: socialTemplates
        .filter((template) => selectedTemplates.includes(template))
        .map(({ id: templateId, name: label }) => ({
          id: templateId,
          name: label
        })),
      cases
    }
    await saveSnapshot(snapshot, directory)
    return snapshot
  } catch (err) {
    await rm(directory, { recursive: true, force: true })
    throw err
  }
}

async function capture(args: string[]) {
  const id = name(args.shift())
  const { from, generate } = captureOptions(args)
  if (await exists(join(output, `${id}.html`)))
    throw new Error('That report already exists. Choose another capture name.')
  const snapshot = await captureSnapshot(
    id,
    generate,
    from ? await readSnapshot(from) : undefined
  )
  await writeFile(join(output, `${id}.html`), renderReviewReport(snapshot), {
    flag: 'wx'
  })
  console.log(`Report: ${join(output, `${id}.html`)}`)
}

function runName(value: string | undefined) {
  const id = name(value)
  if (id.length > 57)
    throw new Error('Run names must be at most 57 characters.')
  return id
}

async function withRunLock(id: string, action: () => Promise<void>) {
  await mkdir(output, { recursive: true })
  const lock = join(output, `.${id}.lock`)
  try {
    await mkdir(lock)
  } catch {
    throw new Error(
      `Review run ${id} is already being changed or cannot be locked.`
    )
  }
  try {
    await action()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

async function importBefore(
  source: ReviewSnapshot,
  id: string,
  directory: string
) {
  const snapshot = structuredClone(source)
  snapshot.name = id
  for (const [index, entry] of snapshot.cases.entries()) {
    entry.cards = [entry.cards[index % entry.cards.length]!]
  }
  const styles = new Set(
    snapshot.cases.flatMap((entry) =>
      entry.cards.map((card) => card.templateId)
    )
  )
  snapshot.templates = snapshot.templates.filter((template) =>
    styles.has(template.id)
  )
  await mkdir(directory)
  for (const entry of snapshot.cases) {
    await mkdir(join(directory, entry.id))
    for (const card of entry.cards) {
      await copyFile(
        join(output, source.name, card.image),
        join(directory, card.image)
      )
      await copyFile(
        join(output, source.name, card.html),
        join(directory, card.html)
      )
    }
  }
  await verifyArtifacts(snapshot, directory)
  await saveSnapshot(snapshot, directory)
  return snapshot
}

async function start(args: string[]) {
  const id = runName(args.shift())
  const { from, generate } = captureOptions(args)
  await withRunLock(id, async () => {
    const beforeName = `${id}-before`
    const beforePath = join(output, beforeName)
    const reportPath = join(output, `${id}.html`)
    const manifestPath = join(output, `${id}.run.json`)
    for (const path of [
      beforePath,
      join(output, `${id}-after`),
      reportPath,
      manifestPath
    ]) {
      if (await exists(path))
        throw new Error(
          `Review run ${id} already exists. Use update ${id} or choose another run name.`
        )
    }
    const staging = await mkdtemp(join(output, `.${id}-`))
    const installed: string[] = []
    try {
      const saved = from ? await readSnapshot(from) : undefined
      const before =
        saved && !generate
          ? await importBefore(saved, beforeName, join(staging, 'before'))
          : await captureSnapshot(
              beforeName,
              generate,
              saved,
              join(staging, 'before')
            )
      await writeFile(
        join(staging, 'report.html'),
        renderReviewReport(before, undefined, id)
      )
      await writeFile(
        join(staging, 'run.json'),
        `${JSON.stringify({ version: 1, name: id }, null, 2)}\n`
      )
      for (const [source, destination] of [
        [join(staging, 'before'), beforePath],
        [join(staging, 'report.html'), reportPath],
        [join(staging, 'run.json'), manifestPath]
      ] as const) {
        await rename(source, destination)
        installed.push(destination)
      }
      console.log(`Review run: http://127.0.0.1:4399/${id}.html`)
    } catch (err) {
      for (const path of installed.reverse())
        await rm(path, { recursive: true, force: true })
      throw err
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  })
}

async function update(args: string[]) {
  const id = runName(args.shift())
  const { generate } = captureOptions(args, false)
  await withRunLock(id, async () => {
    const manifest: unknown = JSON.parse(
      await readFile(join(output, `${id}.run.json`), 'utf8')
    )
    if (
      typeof manifest !== 'object' ||
      manifest === null ||
      !('version' in manifest) ||
      manifest.version !== 1 ||
      !('name' in manifest) ||
      manifest.name !== id
    ) {
      throw new Error(
        'Invalid review run. Start a new run with cards:review start.'
      )
    }
    const before = await readSnapshot(`${id}-before`)
    await verifyArtifacts(before)
    const afterName = `${id}-after`
    const afterPath = join(output, afterName)
    const input =
      !generate && (await exists(afterPath))
        ? await readSnapshot(afterName)
        : before
    assertComparable(before, input)
    if (
      before.cases.some(
        (entry, index) =>
          input.cases[index]?.cards.length !== 1 ||
          input.cases[index]?.cards[0]?.templateId !==
            entry.cards[0]!.templateId
      )
    ) {
      throw new Error(
        'A review run keeps its baseline chat/style pairings. Start a new run to change the sample.'
      )
    }
    const staging = await mkdtemp(join(output, `.${id}-`))
    let backedUp = false
    let installed = false
    let cleanup = true
    try {
      const after = await captureSnapshot(
        afterName,
        generate,
        input,
        join(staging, 'after')
      )
      assertComparable(before, after)
      await writeFile(
        join(staging, 'report.html'),
        renderReviewReport(before, after, id)
      )
      if (await exists(afterPath)) {
        await rename(afterPath, join(staging, 'previous-after'))
        backedUp = true
      }
      await rename(join(staging, 'after'), afterPath)
      installed = true
      await rename(join(staging, 'report.html'), join(output, `${id}.html`))
      console.log(`Updated review: http://127.0.0.1:4399/${id}.html`)
    } catch (err) {
      try {
        if (installed) await rm(afterPath, { recursive: true, force: true })
        if (backedUp) await rename(join(staging, 'previous-after'), afterPath)
      } catch {
        cleanup = false
        throw new Error(
          `Update could not be restored. Its recovery files remain in ${staging}.`
        )
      }
      throw err
    } finally {
      if (cleanup) await rm(staging, { recursive: true, force: true })
    }
  })
}

async function compare(args: string[]) {
  if (args.length !== 2)
    throw new Error('Usage: pnpm cards:review compare <before> <after>')
  const before = await readSnapshot(name(args[0]))
  const after = await readSnapshot(name(args[1]))
  assertComparable(before, after)
  await verifyArtifacts(before)
  await verifyArtifacts(after)
  const path = join(output, `${before.name}--${after.name}.html`)
  if (await exists(join(output, `${before.name}--${after.name}.run.json`)))
    throw new Error(
      'That name belongs to a review run. Choose different capture names.'
    )
  await writeFile(path, renderReviewReport(before, after))
  console.log(`Report: ${path}`)
}

function serve(args: string[]) {
  if (args.length && (args.length !== 2 || args[0] !== '--port'))
    throw new Error('Usage: pnpm cards:review serve [--port <port>]')
  const port = args.length ? Number(args[1]) : 4399
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Choose a port from 1024 to 65535.')
  const types = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.webp', 'image/webp'],
    ['.json', 'application/json; charset=utf-8']
  ])
  createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end()
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname === '/') {
        const files = await readdir(output)
        const runs = files
          .filter((file) => /^[a-z0-9-]+\.run\.json$/.test(file))
          .map((file) => file.slice(0, -9))
          .sort()
        const history = files
          .filter(
            (file) =>
              /^[a-z0-9-]+\.html$/.test(file) &&
              !runs.includes(file.slice(0, -5))
          )
          .sort()
        const listing = (reports: string[]) =>
          `<ul>${reports.map((file) => `<li><a href="/${file}">${file.slice(0, -5)}</a></li>`).join('')}</ul>`
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        })
        response.end(
          `<title>Share card reviews</title><h1>Share card reviews</h1><p>Each run keeps one baseline and the latest candidate at the same link.</p>${runs.length ? listing(runs.map((run) => `${run}.html`)) : '<p>Start a run with <code>pnpm cards:review start &lt;run&gt;</code>.</p>'}${history.length ? `<details><summary>Historical captures and comparisons</summary>${listing(history)}</details>` : ''}`
        )
        return
      }
      const path = resolve(output, `.${decodeURIComponent(url.pathname)}`)
      if (!path.startsWith(`${output}/`) || !types.has(extname(path))) {
        response.writeHead(404).end()
        return
      }
      const info = await stat(path)
      if (!info.isFile()) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, {
        'Content-Type': types.get(extname(path))!,
        'Content-Length': info.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      if (request.method === 'HEAD') response.end()
      else
        createReadStream(path)
          .on('error', () => response.destroy())
          .pipe(response)
    } catch {
      response.writeHead(404).end()
    }
  }).listen(port, '127.0.0.1', () =>
    console.log(`Share card reviews: http://127.0.0.1:${port}`)
  )
}

try {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help') console.log(usage)
  else if (command === 'start') await start(args)
  else if (command === 'update') await update(args)
  else if (command === 'capture') await capture(args)
  else if (command === 'compare') await compare(args)
  else if (command === 'serve') serve(args)
  else throw new Error('Unknown command. Use pnpm cards:review --help.')
} catch (err) {
  // Only our own actionable messages; filesystem/renderer/provider diagnostics can contain payloads.
  const message =
    err instanceof Error && !('code' in err)
      ? err.message
      : 'Review failed. Check paths, prepared fonts, and write access.'
  console.error(message)
  process.exitCode = 1
}

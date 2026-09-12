import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams
} from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { limits } from '../lib/domain'
import { messageText } from '../lib/messages'
import {
  SUMMARY_INPUT_LIMIT,
  summaryInput,
  validateGeneratedPreview
} from '../lib/summary'
import {
  assertComparable,
  countWords,
  hash,
  validateSnapshot
} from '../scripts/share-card-review/checks'
import { reviewFixtures } from '../scripts/share-card-review/fixtures'
import type { ReviewSnapshot } from '../scripts/share-card-review/model'
import { renderReviewReport } from '../scripts/share-card-review/report'

const execute = promisify(execFile)
const reviewOutput = join(process.cwd(), 'work/share-card-review')

function reviewCommand(...args: string[]) {
  return execute(
    process.execPath,
    ['--import', 'tsx', 'scripts/share-card-review.ts', ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI: '1',
        NODE_ENV: 'test',
        TSX_DISABLE_CACHE: '1'
      },
      timeout: 30_000
    }
  )
}

async function captureFiles(id: string) {
  const directory = join(reviewOutput, id)
  const json = await readFile(join(directory, 'snapshot.json'), 'utf8')
  const saved = validateSnapshot(JSON.parse(json))
  return [
    json,
    ...(await Promise.all(
      saved.cases.flatMap((entry) =>
        entry.cards.flatMap((card) =>
          [card.image, card.html].map(async (path) =>
            hash(await readFile(join(directory, path)))
          )
        )
      )
    ))
  ]
}

function snapshot(): ReviewSnapshot {
  const fixture = structuredClone(reviewFixtures[0]!)
  const sourceHash = hash(fixture.source)
  const titleWords = countWords(fixture.preview.title)
  const highlightWords = countWords(fixture.preview.highlights.join(' '))
  return {
    version: 1,
    name: 'baseline',
    createdAt: '2026-09-12T00:00:00.000Z',
    revision: 'test-revision',
    dirty: false,
    taskHash: hash('summary task'),
    rendererHash: hash('card renderer'),
    corpusHash: hash([
      { id: fixture.id, sourceHash, provider: fixture.provider }
    ]),
    templates: [{ id: 'margin-notes', name: 'Margin notes' }],
    cases: [
      {
        ...fixture,
        sourceHash,
        summaryOrigin: 'authored',
        summaryModel: null,
        summaryTaskHash: null,
        summaryGeneratedAt: null,
        inputTruncated: false,
        metrics: {
          sourceWords: countWords(
            fixture.source.messages.map(messageText).join(' ')
          ),
          titleWords,
          highlightWords,
          totalWords: titleWords + highlightWords
        },
        cards: [
          {
            templateId: 'margin-notes',
            image: `${fixture.id}/margin-notes.webp`,
            html: `${fixture.id}/margin-notes.html`,
            imageHash: hash('saved image'),
            htmlHash: hash('saved HTML')
          }
        ]
      }
    ]
  }
}

function refreshCorpus(snapshot: ReviewSnapshot) {
  snapshot.corpusHash = hash(
    snapshot.cases.map(({ id, sourceHash, provider }) => ({
      id,
      sourceHash,
      provider
    }))
  )
}

describe('share card review snapshots', () => {
  it('preserves a valid snapshot and refuses source or corpus mutations', () => {
    const baseline = snapshot()
    expect(validateSnapshot(baseline)).toBe(baseline)

    const changedSource = structuredClone(baseline)
    changedSource.cases[0]!.source.title = 'A different conversation'
    expect(() => validateSnapshot(changedSource)).toThrow('source changed')

    const changedCorpus = structuredClone(baseline)
    changedCorpus.cases[0]!.provider = 'claude'
    expect(() => validateSnapshot(changedCorpus)).toThrow('corpus changed')
  })

  it('refuses comparisons with different source inputs, even after valid recapture', () => {
    const baseline = snapshot()
    const candidate = structuredClone(baseline)
    const entry = candidate.cases[0]!
    candidate.name = 'candidate'
    entry.source.title = 'A different conversation'
    entry.sourceHash = hash(entry.source)
    refreshCorpus(candidate)

    expect(() => validateSnapshot(candidate)).not.toThrow()
    expect(() => assertComparable(baseline, candidate)).toThrow('inputs differ')
  })

  it('allows a new summary and renderer for the same source inputs', () => {
    const baseline = snapshot()
    const candidate = structuredClone(baseline)
    candidate.name = 'candidate'
    candidate.taskHash = hash('revised summary task')
    candidate.rendererHash = hash('revised card renderer')
    const entry = candidate.cases[0]!
    entry.preview = {
      title: 'Freeze spare bread',
      highlights: ['Thaw just the slices you need.']
    }
    entry.summaryOrigin = 'generated'
    entry.summaryModel = 'review-test-model'
    entry.summaryTaskHash = candidate.taskHash
    entry.summaryGeneratedAt = candidate.createdAt
    entry.cards[0]!.imageHash = hash('candidate image')

    expect(() => validateSnapshot(candidate)).not.toThrow()
    expect(() => assertComparable(baseline, candidate)).not.toThrow()
  })

  it('requires model and task provenance for generated summaries', () => {
    const incomplete = snapshot()
    incomplete.cases[0]!.summaryOrigin = 'generated'
    expect(() => validateSnapshot(incomplete)).toThrow('provenance')
  })

  it('accepts a representative card without requiring every listed style for each chat', () => {
    const sample = snapshot()
    sample.templates.push({ id: 'friendly-lab', name: 'Friendly lab' })
    expect(() => validateSnapshot(sample)).not.toThrow()
  })

  it('keeps historical summaries comparable when current length limits are tighter', () => {
    const baseline = snapshot()
    baseline.cases[0]!.preview = {
      title: 'A'.repeat(limits.title + 1),
      highlights: ['B'.repeat(limits.highlight + 1)]
    }
    const candidate = structuredClone(baseline)
    candidate.name = 'candidate'
    candidate.cases[0]!.preview = {
      title: 'Freeze spare bread',
      highlights: ['Thaw only the slices you need.']
    }

    expect(() => validateGeneratedPreview(baseline.cases[0]!.preview)).toThrow()
    expect(() => validateSnapshot(baseline)).not.toThrow()
    expect(() => validateSnapshot(candidate)).not.toThrow()
    expect(() => assertComparable(baseline, candidate)).not.toThrow()
    expect(renderReviewReport(baseline, candidate)).toContain(
      baseline.cases[0]!.preview.title
    )
  })

  it.each([
    ['image', '../outside.webp'],
    ['image', 'https://example.com/card.webp'],
    ['html', '/outside.html'],
    ['html', 'tiny-everyday/other-template.html']
  ] as const)(
    'refuses an unsafe or mismatched %s artifact path: %s',
    (field, path) => {
      const invalid = snapshot()
      invalid.cases[0]!.cards[0]![field] = path
      expect(() => validateSnapshot(invalid)).toThrow('invalid card path')
    }
  )

  it('refuses missing cards, duplicate cases, and duplicate templates', () => {
    const missingCard = snapshot()
    missingCard.cases[0]!.cards = []
    expect(() => validateSnapshot(missingCard)).toThrow(
      'missing rendered cards'
    )

    const duplicateCase = snapshot()
    duplicateCase.cases.push(structuredClone(duplicateCase.cases[0]!))
    expect(() => validateSnapshot(duplicateCase)).toThrow('duplicate')

    const duplicateTemplate = snapshot()
    duplicateTemplate.templates.push({ ...duplicateTemplate.templates[0]! })
    expect(() => validateSnapshot(duplicateTemplate)).toThrow('duplicate')
  })
})

describe('share card review corpus', () => {
  it.each(reviewFixtures)('keeps the authored $id preview valid', (fixture) => {
    expect(validateGeneratedPreview(fixture.preview)).toEqual(fixture.preview)
  })

  it('exercises long-input compaction without losing the first request or final answer', () => {
    const source = reviewFixtures.find(
      (fixture) => fixture.id === 'long-review'
    )!.source
    const savedSource = structuredClone(source)
    const encoded = summaryInput(source)
    const input = JSON.parse(encoded) as {
      truncated: boolean
      messages: { role: string; text: string }[]
    }
    const firstUser = source.messages.find(
      (message) => message.role === 'user'
    )!
    const finalAnswer = source.messages.findLast(
      (message) => message.role === 'assistant'
    )!

    expect(encoded.length).toBeLessThanOrEqual(SUMMARY_INPUT_LIMIT)
    expect(input.truncated).toBe(true)
    expect(input.messages.length).toBeLessThan(source.messages.length)
    expect(input.messages[0]).toEqual({
      role: 'user',
      text: messageText(firstUser)
    })
    expect(input.messages.at(-1)).toEqual({
      role: 'assistant',
      text: messageText(finalAnswer)
    })
    expect(source).toEqual(savedSource)
  })

  it.each([
    ['', 0],
    [' \n 🙂 — !?', 0],
    ['Save one note.', 3],
    ['Öl für fünf Räder.', 4],
    ['你好 世界', 2]
  ])(
    'counts words without treating whitespace or punctuation as words: %j',
    (text, expected) => {
      expect(countWords(text)).toBe(expected)
    }
  )
})

describe('share card review report', () => {
  it('escapes source, summary, and label content in text and attributes', () => {
    const baseline = snapshot()
    const entry = baseline.cases[0]!
    entry.label = '"><img src=x onerror="label">'
    entry.topic = '<b>Untrusted topic</b>'
    entry.preview.title = '<script>alert("summary")</script>'
    entry.reviewNotes = '<img src=x onerror="notes">'
    entry.source.messages[0]!.content = [
      { type: 'input_text', text: '</pre><script>source()</script><pre>' }
    ]
    const report = renderReviewReport(baseline)

    expect(report).not.toContain(entry.label)
    expect(report).not.toContain(entry.topic)
    expect(report).not.toContain(entry.preview.title)
    expect(report).not.toContain(entry.reviewNotes)
    expect(report).not.toContain('</pre><script>source()')
    expect(report).toContain(
      '&lt;script&gt;alert(&quot;summary&quot;)&lt;/script&gt;'
    )
    expect(report).toContain(
      '&lt;/pre&gt;&lt;script&gt;source()&lt;/script&gt;&lt;pre&gt;'
    )
    expect(report).toContain('sandbox=""')
  })

  it('distinguishes summary, image, and HTML changes using saved captures', () => {
    const baseline = snapshot()
    const candidate = structuredClone(baseline)
    candidate.name = 'candidate'
    candidate.cases[0]!.preview.title = 'Freeze spare bread'
    expect(renderReviewReport(baseline, candidate)).toContain(
      '>Summary changed</span>'
    )

    candidate.cases[0]!.preview = structuredClone(baseline.cases[0]!.preview)
    candidate.cases[0]!.cards[0]!.imageHash = hash('new image')
    expect(renderReviewReport(baseline, candidate)).toContain(
      '>Image changed</span>'
    )
    candidate.cases[0]!.cards[0]!.imageHash =
      baseline.cases[0]!.cards[0]!.imageHash
    candidate.cases[0]!.cards[0]!.htmlHash = hash('new HTML')
    const htmlChange = renderReviewReport(baseline, candidate)
    expect(htmlChange).toContain('>HTML changed</span>')
    expect(htmlChange).toContain(
      'data-template="margin-notes" data-changed="true"'
    )
    expect(renderReviewReport(baseline, baseline)).toContain(
      '>Unchanged</span>'
    )
  })

  it('includes added and removed styles in the comparison and filters', () => {
    const baseline = snapshot()
    const candidate = structuredClone(baseline)
    candidate.name = 'candidate'
    candidate.templates = [{ id: 'new-style', name: 'New style' }]
    const entry = candidate.cases[0]!
    entry.cards = [
      {
        templateId: 'new-style',
        image: `${entry.id}/new-style.webp`,
        html: `${entry.id}/new-style.html`,
        imageHash: hash('new style image'),
        htmlHash: hash('new style HTML')
      }
    ]
    const report = renderReviewReport(baseline, candidate)

    expect(() => validateSnapshot(candidate)).not.toThrow()
    expect(() => assertComparable(baseline, candidate)).not.toThrow()
    expect(report).toContain('>Style added</span>')
    expect(report).toContain('>Style removed</span>')
    expect(report).toContain('No card in this capture')
    expect(report).toContain('data-template="margin-notes" data-changed="true"')
    expect(report).toContain('data-template="new-style" data-changed="true"')
    expect(report).toContain(
      '<option value="margin-notes">Margin notes</option>'
    )
    expect(report).toContain('<option value="new-style">New style</option>')
  })
})

describe('share card review runs', () => {
  it('keeps one live URL, freezes imported assets, and preserves the last candidate after failure', async () => {
    const run = `test-review-${process.pid}-${Date.now().toString(36)}`
    const savedName = `${run}-saved`
    const reportPath = join(reviewOutput, `${run}.html`)
    const saved = snapshot()
    saved.name = savedName
    const entry = saved.cases[0]!
    const card = entry.cards[0]!
    card.imageHash = hash(Buffer.from('saved image'))
    card.htmlHash = hash(Buffer.from('saved HTML'))
    let server: ChildProcessWithoutNullStreams | undefined
    try {
      await mkdir(join(reviewOutput, savedName, entry.id), { recursive: true })
      await writeFile(
        join(reviewOutput, savedName, 'snapshot.json'),
        JSON.stringify(saved)
      )
      await writeFile(join(reviewOutput, savedName, card.image), 'saved image')
      await writeFile(join(reviewOutput, savedName, card.html), 'saved HTML')
      await reviewCommand('start', run, '--from', savedName)
      const before = await captureFiles(`${run}-before`)
      expect(
        await readFile(join(reviewOutput, `${run}-before`, card.image), 'utf8')
      ).toBe('saved image')
      expect(validateSnapshot(JSON.parse(before[0]!)).createdAt).toBe(
        saved.createdAt
      )
      await expect(
        reviewCommand('start', run, '--from', savedName)
      ).rejects.toThrow('already exists')

      const listener = createServer()
      listener.listen(0, '127.0.0.1')
      await once(listener, 'listening')
      const address = listener.address()
      if (!address || typeof address === 'string')
        throw new Error('No local test port')
      const port = address.port
      await new Promise<void>((resolve, reject) =>
        listener.close((err) => (err ? reject(err) : resolve()))
      )
      server = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          'scripts/share-card-review.ts',
          'serve',
          '--port',
          String(port)
        ],
        {
          env: {
            ...process.env,
            CI: '1',
            NODE_ENV: 'test',
            TSX_DISABLE_CACHE: '1'
          },
          stdio: 'pipe'
        }
      )
      await once(server.stdout, 'data')
      const url = `http://127.0.0.1:${port}/${run}.html`
      expect((await fetch(url)).status).toBe(200)

      await reviewCommand('update', run)
      const firstAfter = await captureFiles(`${run}-after`)
      const firstReport = await (await fetch(url)).text()
      expect(firstReport).toContain(`${run}-before/${card.image}`)
      expect(firstReport).toContain(`${run}-after/${card.image}`)
      // Simulate a completed summary iteration without a paid model request.
      const generated = validateSnapshot(JSON.parse(firstAfter[0]!))
      const generatedCase = generated.cases[0]!
      generatedCase.preview = {
        title: 'Freeze only the bread you need',
        highlights: ['Toast slices straight from frozen.']
      }
      generatedCase.summaryOrigin = 'generated'
      generatedCase.summaryModel = 'test-generated-model'
      generatedCase.summaryTaskHash = hash('candidate summary task')
      generatedCase.summaryGeneratedAt = generated.createdAt
      generatedCase.metrics.titleWords = countWords(generatedCase.preview.title)
      generatedCase.metrics.highlightWords = countWords(
        generatedCase.preview.highlights.join(' ')
      )
      generatedCase.metrics.totalWords =
        generatedCase.metrics.titleWords + generatedCase.metrics.highlightWords
      await writeFile(
        join(reviewOutput, `${run}-after`, 'snapshot.json'),
        JSON.stringify(generated)
      )
      await reviewCommand('update', run)
      const currentAfter = await captureFiles(`${run}-after`)
      expect(currentAfter[0]).not.toBe(firstAfter[0])
      expect(
        validateSnapshot(JSON.parse(currentAfter[0]!)).cases[0]
      ).toMatchObject({
        preview: generatedCase.preview,
        summaryOrigin: 'generated',
        summaryModel: generatedCase.summaryModel,
        summaryTaskHash: generatedCase.summaryTaskHash,
        summaryGeneratedAt: generatedCase.summaryGeneratedAt
      })
      expect(await captureFiles(`${run}-before`)).toEqual(before)
      const currentReport = await readFile(reportPath, 'utf8')
      expect(await (await fetch(url)).text()).toBe(currentReport)
      const index = await (await fetch(`http://127.0.0.1:${port}/`)).text()
      expect(index).toContain(`href="/${run}.html"`)
      expect(index).not.toContain(`href="/${run}-after.html"`)
      expect(
        (await readdir(reviewOutput)).filter(
          (file) => file.startsWith(run) && file.endsWith('.html')
        )
      ).toEqual([`${run}.html`])

      await expect(reviewCommand('update', run, '--generate')).rejects.toThrow(
        'Live generation is disabled'
      )
      expect(await captureFiles(`${run}-before`)).toEqual(before)
      expect(await captureFiles(`${run}-after`)).toEqual(currentAfter)
      expect(await readFile(reportPath, 'utf8')).toBe(currentReport)

      // A real filesystem failure after capture exercises replacement rollback.
      await rm(reportPath)
      await mkdir(reportPath)
      await writeFile(join(reportPath, 'keep'), currentReport)
      await expect(reviewCommand('update', run)).rejects.toThrow()
      expect(await captureFiles(`${run}-before`)).toEqual(before)
      expect(await captureFiles(`${run}-after`)).toEqual(currentAfter)
      expect(await readFile(join(reportPath, 'keep'), 'utf8')).toBe(
        currentReport
      )
    } finally {
      if (server) {
        const stopped = once(server, 'exit')
        server.kill()
        await stopped
      }
      for (const file of await readdir(reviewOutput)) {
        if (file.startsWith(run) || file.startsWith(`.${run}`))
          await rm(join(reviewOutput, file), { recursive: true, force: true })
      }
    }
  }, 60_000)
})

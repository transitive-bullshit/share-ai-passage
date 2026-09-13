import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL(
    '../.agents/skills/passage-share/scripts/passage.mjs',
    import.meta.url
  )
)
const sourceUrl = 'https://chatgpt.com/codex/tasks/task_e_1234567890abcdef'
const preview = {
  title: 'Make the first step small',
  highlights: [
    'Start with one useful change.',
    'Use feedback to choose the next step.'
  ]
}
const draftToken = `${Buffer.from(
  JSON.stringify({
    previewHash: createHash('sha256')
      .update(JSON.stringify(preview))
      .digest('hex')
  })
).toString('base64url')}.test-signature`
const prepared = { draftToken, provider: 'chatgpt', sourceUrl, preview }
const publicationId = '00000000-0000-4000-8000-000000000001'

type RecordedRequest = {
  route: string | undefined
  method: string | undefined
  origin: string | undefined
  body: Record<string, unknown>
}

let baseUrl: string
let foreignUrl: string
let directory: string
let foreignRequests = 0
let requests: RecordedRequest[] = []
let respond: (request: IncomingMessage, response: ServerResponse) => void

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  requests.push({
    route: request.url,
    method: request.method,
    origin: request.headers.origin,
    body: JSON.parse(Buffer.concat(chunks).toString())
  })
  respond(request, response)
})

const foreignServer = createServer((_request, response) => {
  foreignRequests++
  json(response, { error: 'A redirected request reached another origin.' })
})

function run(args: string[], passageUrl = baseUrl) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [cliPath, ...args], {
        env: { ...process.env, PASSAGE_URL: passageUrl },
        stdio: ['pipe', 'pipe', 'pipe'],
        // Reap a stuck CLI before Vitest times out and closes its local servers.
        timeout: 5000,
        killSignal: 'SIGKILL'
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (value) => {
        stdout += value
      })
      child.stderr.setEncoding('utf8').on('data', (value) => {
        stderr += value
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code, stdout, stderr }))
      child.stdin.end()
    }
  )
}

async function savedDraft(
  name = 'draft.json',
  changes: Record<string, unknown> = {}
) {
  const file = path.join(directory, name)
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      status: 'prepared',
      baseUrl,
      ...prepared,
      ...changes
    })
  )
  return file
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'passage-cli-'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  await new Promise<void>((resolve) =>
    foreignServer.listen(0, '127.0.0.1', resolve)
  )
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  foreignUrl = `http://127.0.0.1:${(foreignServer.address() as AddressInfo).port}`
})

beforeEach(() => {
  requests = []
  foreignRequests = 0
  respond = (request, response) => {
    if (request.url === '/api/prepare') json(response, prepared)
    else if (request.url === '/api/publish')
      json(response, {
        publicationId,
        shareUrl: `${baseUrl}/chatgpt/${publicationId}`
      })
    else json(response, { error: 'Unexpected endpoint.' }, 404)
  }
})

afterAll(async () => {
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => foreignServer.close(() => resolve()))
  ])
  await rm(directory, { recursive: true, force: true })
})

describe('portable Passage CLI', () => {
  it('saves a prepared draft and later publishes its exact token at the original server', async () => {
    const file = path.join(directory, 'prepared.json')
    const preparation = await run([
      'prepare',
      sourceUrl,
      '--out',
      file,
      '--json'
    ])
    expect(preparation.code).toBe(0)
    expect(preparation.stderr).toBe('')
    const draft = JSON.parse(preparation.stdout)
    expect(draft).toEqual({
      version: 1,
      status: 'prepared',
      baseUrl,
      ...prepared
    })
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(draft)
    expect(requests).toEqual([
      {
        route: '/api/prepare',
        method: 'POST',
        origin: baseUrl,
        body: { url: sourceUrl }
      }
    ])

    const publication = await run(['publish', file, '--json'], foreignUrl)
    expect(publication.code).toBe(0)
    expect(JSON.parse(publication.stdout)).toMatchObject({
      status: 'published',
      preview,
      shareUrl: `${baseUrl}/chatgpt/${publicationId}`
    })
    expect(requests.slice(1)).toEqual([
      {
        route: '/api/publish',
        method: 'POST',
        origin: baseUrl,
        body: { draftToken }
      }
    ])
    expect(foreignRequests).toBe(0)
  })

  it('refuses a mismatched explicit publish server before sending the token', async () => {
    const file = await savedDraft('bound.json')
    const result = await run([
      'publish',
      file,
      '--base-url',
      foreignUrl,
      '--json'
    ])
    expect(result.code).toBe(2)
    expect(JSON.parse(result.stderr).error).toMatch(
      /does not match the saved draft/
    )
    expect(requests).toHaveLength(0)
    expect(foreignRequests).toBe(0)
  })

  it('refuses edited preview text without attempting publication', async () => {
    const file = await savedDraft('edited.json', {
      preview: { ...preview, title: 'A different title' }
    })
    const result = await run(['publish', file, '--json'])
    expect(result.code).toBe(2)
    expect(JSON.parse(result.stderr).error).toMatch(/preview does not match/)
    expect(requests).toHaveLength(0)
  })

  it('returns a prepared JSON draft for a noninteractive share without --yes', async () => {
    const result = await run(['share', sourceUrl, '--json'])
    expect(result.code).toBe(0)
    expect(requests.map((request) => request.route)).toEqual(['/api/prepare'])
    expect(JSON.parse(result.stdout).status).toBe('prepared')
  })

  it('displays the preview without publishing when a URL is passed directly without --yes', async () => {
    const result = await run([sourceUrl])
    expect(result.code).toBe(0)
    expect(requests.map((request) => request.route)).toEqual(['/api/prepare'])
    expect(result.stdout).toContain(preview.title)
    expect(result.stdout).toContain(preview.highlights[0])
    expect(result.stdout).toContain('Nothing has been published.')
  })

  it('shares with explicit --yes using the prepared token and no editable fields', async () => {
    const result = await run(['share', sourceUrl, '--yes', '--json'])
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'published',
      preview
    })
    expect(requests.map((request) => [request.route, request.body])).toEqual([
      ['/api/prepare', { url: sourceUrl }],
      ['/api/publish', { draftToken }]
    ])
  })

  it('never follows a publish redirect to another origin', async () => {
    const file = await savedDraft('redirect.json')
    respond = (_request, response) => {
      response.writeHead(307, { Location: `${foreignUrl}/api/publish` })
      response.end()
    }
    const result = await run(['publish', file, '--json'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr).error).toMatch(
      /redirects are not followed/
    )
    expect(requests).toHaveLength(1)
    expect(foreignRequests).toBe(0)
  })

  it('preserves rate-limit status and Retry-After without retrying a mutation', async () => {
    respond = (_request, response) => {
      response.setHeader('Retry-After', '45')
      json(response, { error: 'Please wait before preparing again.' }, 429)
    }
    const result = await run(['prepare', sourceUrl, '--json'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr)).toMatchObject({
      status: 429,
      retryAfter: '45',
      exitCode: 1
    })
    expect(requests).toHaveLength(1)
  })

  // Check each rejection boundary through the CLI without repeating every text limit.
  it.each([
    {
      name: 'invalid preview',
      value: { ...prepared, preview: { title: '', highlights: ['Short.'] } },
      error: /invalid response shape/
    },
    {
      name: 'invalid token',
      value: { ...prepared, draftToken: 'opaque-invalid-token' },
      error: /invalid publication token/
    }
  ])('rejects an $name before publishing', async ({ value, error }) => {
    respond = (_request, response) => json(response, value)
    const result = await run(['share', sourceUrl, '--yes', '--json'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr).error).toMatch(error)
    expect(requests.map((request) => request.route)).toEqual(['/api/prepare'])
    expect(result.stdout).toBe('')
  })

  it('does not overwrite a draft or publish when saving --out fails', async () => {
    const file = await savedDraft('existing.json')
    const original = await readFile(file, 'utf8')
    const result = await run([
      'share',
      sourceUrl,
      '--yes',
      '--out',
      file,
      '--json'
    ])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr).error).toMatch(/already exists/)
    expect(await readFile(file, 'utf8')).toBe(original)
    expect(requests.map((request) => request.route)).toEqual(['/api/prepare'])
  })

  it('validates publication URLs rather than trusting an unexpected origin', async () => {
    const file = await savedDraft('publication-origin.json')
    respond = (_request, response) =>
      json(response, {
        publicationId,
        shareUrl: `${foreignUrl}/chatgpt/${publicationId}`
      })
    const result = await run(['publish', file, '--json'])
    expect(result.code).toBe(1)
    expect(JSON.parse(result.stderr).error).toMatch(
      /outside the expected publication route/
    )
  })

  it('rejects unsupported editing options without making any requests', async () => {
    const invalid = await run([
      'prepare',
      sourceUrl,
      '--title',
      'Edit',
      '--json'
    ])
    expect(invalid.code).toBe(2)
    expect(JSON.parse(invalid.stderr).error).toMatch(/Unknown option/)
    expect(requests).toHaveLength(0)
  })
})

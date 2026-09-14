#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'

const defaultBaseUrl = 'https://www.share-ai-passage.com'
const maxResponseBytes = 64 * 1024
const help = `Passage — share a public ChatGPT, Codex, or Claude conversation

Usage:
  passage.mjs prepare <url> [--out draft.json] [--json] [--base-url URL]
  passage.mjs publish <draft.json> [--json] [--base-url URL]
  passage.mjs share <url> [--out draft.json] [--yes] [--json] [--base-url URL]
  passage.mjs <url> [options]       Alias for share

prepare prints a generated title and highlights without publishing.
--out saves that exact draft to a new file; existing files are never overwritten.
publish uses the saved draft and its original Passage server, without regenerating.
share displays the preview, then asks before publishing in an interactive terminal.
Without a terminal, or with --json, share only prepares unless --yes is provided.

Options:
  --base-url URL  Passage server origin (default: PASSAGE_URL or ${defaultBaseUrl})
  --out PATH     Save the prepared draft for later review and publication
  --yes          Explicitly publish after preparation (share only)
  --json         Machine-readable JSON on stdout; JSON errors on stderr
  --help, -h     Show this help

Draft files contain a private publication token. Their preview is read-only.
Requests time out after 60 seconds and do not follow redirects.
Exit codes: 0 success or unpublished preview, 1 API/network/file error, 2 invalid input.
`

class CliError extends Error {
  constructor(message, exitCode = 1, details = {}) {
    super(message)
    this.exitCode = exitCode
    this.details = details
  }
}

function safeText(value) {
  return String(value)
    // oxlint-disable-next-line eslint/no-control-regex -- Strip terminal controls from untrusted output.
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .slice(0, 500)
}

function parseOptions(args) {
  const options = { json: false, yes: false, help: false }
  const positional = []
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--json') options.json = true
    else if (argument === '--yes') options.yes = true
    else if (argument === '--base-url' || argument === '--out') {
      const value = args[++index]
      if (!value || value.startsWith('--'))
        throw new CliError(`${argument} needs a value.`, 2)
      const key = argument === '--base-url' ? 'baseUrl' : 'out'
      if (options[key]) throw new CliError(`${argument} was provided twice.`, 2)
      options[key] = value
    } else if (argument.startsWith('-'))
      throw new CliError(
        `Unknown option: ${safeText(argument)}. Use --help.`,
        2
      )
    else positional.push(argument)
  }
  if (options.help || args.length === 0) return { ...options, help: true }
  const alias = /^https?:\/\//u.test(positional[0] || '')
  const command = alias ? 'share' : positional.shift()
  if (
    !['prepare', 'publish', 'share'].includes(command) ||
    positional.length !== 1
  )
    throw new CliError(
      'Expected prepare <url>, publish <draft.json>, or share <url>. Use --help.',
      2
    )
  if (options.yes && command !== 'share')
    throw new CliError('--yes is only available with share.', 2)
  if (options.out && command === 'publish')
    throw new CliError('--out is only available with prepare or share.', 2)
  return { ...options, command, target: positional[0] }
}

function parseUrl(value, label, exitCode = 2) {
  try {
    const url = new URL(value)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Invalid URL')
    return url
  } catch {
    throw new CliError(
      `${label} must be an absolute HTTP or HTTPS URL without credentials.`,
      exitCode
    )
  }
}

function baseOrigin(value, exitCode = 2) {
  const url = parseUrl(value, 'The Passage base URL', exitCode)
  if (url.pathname !== '/' || url.search || url.hash)
    throw new CliError(
      'The Passage base URL must be an origin without a path, query, or fragment.',
      exitCode
    )
  return url.origin
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validText(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Array.from(value).length <= maxLength &&
    // oxlint-disable-next-line eslint/no-control-regex -- Preview text must not contain terminal controls.
    !/[\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value)
  )
}

function validatePrepared(value, exitCode = 1) {
  if (
    !isRecord(value) ||
    !['chatgpt', 'claude'].includes(value.provider) ||
    typeof value.sourceUrl !== 'string' ||
    typeof value.draftToken !== 'string' ||
    value.draftToken.length > 1024 ||
    !isRecord(value.preview) ||
    !validText(value.preview.title, 60) ||
    !Array.isArray(value.preview.highlights) ||
    value.preview.highlights.length < 1 ||
    value.preview.highlights.length > 3 ||
    !value.preview.highlights.every((highlight) => validText(highlight, 100))
  )
    throw new CliError(
      'The prepared draft has an invalid response shape.',
      exitCode
    )

  parseUrl(value.sourceUrl, 'The draft source URL', exitCode)
  const preview = {
    title: value.preview.title,
    highlights: value.preview.highlights
  }
  let expectedHash
  try {
    const [payload, signature, extra] = value.draftToken.split('.')
    if (!payload || !signature || extra) throw new Error('Invalid token')
    expectedHash = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ).previewHash
  } catch {
    throw new CliError(
      'The prepared draft has an invalid publication token.',
      exitCode
    )
  }
  const actualHash = createHash('sha256')
    .update(JSON.stringify(preview))
    .digest('hex')
  if (expectedHash !== actualHash)
    throw new CliError(
      'The preview does not match its saved publication token. Use the original unedited draft.',
      exitCode
    )

  return {
    draftToken: value.draftToken,
    provider: value.provider,
    sourceUrl: value.sourceUrl,
    preview
  }
}

async function readResponse(response) {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxResponseBytes) {
        await reader.cancel()
        throw new CliError(
          'The Passage server returned an unexpectedly large response.'
        )
      }
      chunks.push(value)
    }
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().startsWith('application/json')) return null
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      return null
    }
  } finally {
    reader.releaseLock()
  }
}

async function post(baseUrl, route, body) {
  try {
    const response = await fetch(new URL(route, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: baseUrl,
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Passage CLI/1.0'
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(60_000)
    })
    const result = await readResponse(response)
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after')
      const message =
        isRecord(result) && typeof result.error === 'string'
          ? safeText(result.error)
          : 'The Passage request failed.'
      const details = { status: response.status }
      if (retryAfter) details.retryAfter = safeText(retryAfter)
      throw new CliError(
        `${message} (HTTP ${response.status})${retryAfter ? ` Retry after: ${safeText(retryAfter)}.` : ''}`,
        1,
        details
      )
    }
    if (!isRecord(result))
      throw new CliError(
        'The Passage server did not return a valid JSON object.'
      )
    return result
  } catch (err) {
    if (err instanceof CliError) throw err
    if (err instanceof Error && err.name === 'TimeoutError')
      throw new CliError('The Passage request timed out after 60 seconds.')
    throw new CliError(
      'Could not reach the Passage server. Check its URL and availability; redirects are not followed.'
    )
  }
}

function displayPreview(draft) {
  process.stdout.write(`\n${draft.preview.title}\n\n`)
  for (const highlight of draft.preview.highlights)
    process.stdout.write(`• ${highlight}\n`)
  process.stdout.write(`\nSource: ${safeText(draft.sourceUrl)}\n\n`)
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function saveDraft(file, draft) {
  try {
    await writeFile(file, `${JSON.stringify(draft, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600
    })
  } catch (err) {
    if (err?.code === 'EEXIST')
      throw new CliError(
        'The draft output file already exists. Choose a new --out path.'
      )
    throw new CliError(
      'Could not save the draft file. Check its parent directory and permissions.'
    )
  }
}

async function loadDraft(file) {
  let value
  try {
    const info = await stat(file)
    if (!info.isFile() || info.size > maxResponseBytes)
      throw new Error('Invalid file')
    value = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    throw new CliError(
      'Could not read the draft file as JSON (maximum 64 KB).',
      2
    )
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.status !== 'prepared' ||
    typeof value.baseUrl !== 'string'
  )
    throw new CliError(
      'Use a draft file created by prepare --out or prepare --json.',
      2
    )
  return {
    version: 1,
    status: 'prepared',
    baseUrl: baseOrigin(value.baseUrl),
    ...validatePrepared(value, 2)
  }
}

async function publishDraft(draft) {
  const result = await post(draft.baseUrl, '/api/publish', {
    draftToken: draft.draftToken
  })
  if (
    typeof result.publicationId !== 'string' ||
    !result.publicationId ||
    typeof result.shareUrl !== 'string'
  )
    throw new CliError(
      'The Passage server returned an invalid publication response.'
    )
  const shareUrl = parseUrl(result.shareUrl, 'The published share URL', 1)
  if (
    shareUrl.origin !== draft.baseUrl ||
    shareUrl.search ||
    shareUrl.hash ||
    shareUrl.pathname !== `/${draft.provider}/${result.publicationId}`
  )
    throw new CliError(
      'The Passage server returned a share URL outside the expected publication route.'
    )
  return {
    status: 'published',
    publicationId: result.publicationId,
    shareUrl: result.shareUrl,
    provider: draft.provider,
    sourceUrl: draft.sourceUrl,
    preview: draft.preview
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(help)
    return
  }

  if (options.command === 'publish') {
    const draft = await loadDraft(options.target)
    if (options.baseUrl && baseOrigin(options.baseUrl) !== draft.baseUrl)
      throw new CliError(
        'The supplied base URL does not match the saved draft. Publish with its original Passage server.',
        2
      )
    if (!options.json) displayPreview(draft)
    const result = await publishDraft(draft)
    if (options.json) printJson(result)
    else process.stdout.write(`Published: ${result.shareUrl}\n`)
    return
  }

  const baseUrl = baseOrigin(
    options.baseUrl || process.env.PASSAGE_URL || defaultBaseUrl
  )
  const sourceUrl = options.target.trim()
  parseUrl(sourceUrl, 'The conversation URL')
  const draft = {
    version: 1,
    status: 'prepared',
    baseUrl,
    ...validatePrepared(await post(baseUrl, '/api/prepare', { url: sourceUrl }))
  }
  if (options.out) await saveDraft(options.out, draft)
  if (!options.json) displayPreview(draft)

  let publish = options.command === 'share' && options.yes
  if (
    options.command === 'share' &&
    !publish &&
    !options.json &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    const prompt = createInterface({
      input: process.stdin,
      output: process.stdout
    })
    try {
      const answer = await prompt.question(
        'Publish this preview and the saved conversation? [y/N] '
      )
      publish = /^(?:y|yes)$/iu.test(answer.trim())
    } finally {
      prompt.close()
    }
  }

  if (publish) {
    const result = await publishDraft(draft)
    if (options.json) printJson(result)
    else process.stdout.write(`Published: ${result.shareUrl}\n`)
  } else if (options.json) printJson(draft)
  else {
    process.stdout.write('Preview prepared. Nothing has been published.\n')
    if (options.out)
      process.stdout.write(`Draft saved: ${safeText(options.out)}\n`)
    else
      process.stdout.write(
        'Use --out draft.json to save a draft for later publication.\n'
      )
  }
}

try {
  await main()
} catch (err) {
  const failure =
    err instanceof CliError
      ? err
      : new CliError('The command could not complete.')
  if (process.argv.includes('--json'))
    process.stderr.write(
      `${JSON.stringify({ error: failure.message, exitCode: failure.exitCode, ...failure.details })}\n`
    )
  else process.stderr.write(`Passage: ${failure.message}\n`)
  process.exitCode = failure.exitCode
}

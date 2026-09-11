import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { ExtractedConversation, GeneratedPreview } from '../lib/domain'

type SummaryFixture = {
  source: ExtractedConversation
  preview: GeneratedPreview
  model: string
  provenance: {
    kind: 'authored' | 'openai'
    generatedAt: string | null
  }
}

async function regenerate() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || args[0] !== '--regenerate') {
    console.error(
      'Usage: pnpm fixtures:summary --regenerate (makes one paid OpenAI request)'
    )
    process.exitCode = 2
    return
  }
  if (process.env.CI || process.env.VITEST || process.env.NODE_ENV === 'test') {
    console.error(
      'Summary fixture regeneration is disabled in CI and test environments.'
    )
    process.exitCode = 2
    return
  }

  // Configuration and the live provider must stay behind both guards.
  const { loadEnvConfig } = await import('@next/env')
  const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
  loadEnvConfig(projectDirectory)
  const { defaultPreviewModel, suggestPreview } =
    await import('../lib/suggestions')
  const fixturePath = fileURLToPath(
    new URL('../tests/fixtures/summary.json', import.meta.url)
  )
  const fixture = JSON.parse(
    await readFile(fixturePath, 'utf8')
  ) as SummaryFixture
  const preview = await suggestPreview(fixture.source)
  const model = process.env.AI_MODEL?.trim() || defaultPreviewModel
  await writeFile(
    fixturePath,
    `${JSON.stringify(
      {
        ...fixture,
        preview,
        model,
        provenance: { kind: 'openai', generatedAt: new Date().toISOString() }
      },
      null,
      2
    )}\n`
  )
  console.log(`${fixturePath} (${model})`)
}

try {
  await regenerate()
} catch {
  // Provider errors can include request details; never echo them or credentials.
  console.error(
    'Summary fixture regeneration failed. The saved fixture was not regenerated.'
  )
  process.exitCode = 1
}

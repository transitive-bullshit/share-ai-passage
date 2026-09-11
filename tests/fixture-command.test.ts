import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const commandPath = fileURLToPath(
  new URL('../scripts/regenerate-summary-fixture.ts', import.meta.url)
)

// Refusal tests cannot load .env or the live provider, even if a guard regresses.
const offlineLoader = `data:text/javascript,${encodeURIComponent(`
  import { registerHooks } from 'node:module'
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === '@next/env' || specifier.endsWith('/lib/suggestions')) {
        throw new Error('The refusal path loaded a live dependency')
      }
      return nextResolve(specifier, context)
    }
  })
`)}`

function run(
  args: string[],
  environment: Record<string, string | undefined> = {}
) {
  return spawnSync(
    process.execPath,
    ['--import', offlineLoader, commandPath, ...args],
    {
      encoding: 'utf8',
      env: { NODE_ENV: 'development', ...environment },
      timeout: 5000
    }
  )
}

describe('manual summary fixture regeneration', () => {
  it.each([[], ['--regenerate=true'], ['--regenerate', '--extra']])(
    'requires exactly --regenerate before loading configuration: %j',
    (...args) => {
      const result = run(args)
      expect(result.status).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(
        'Usage: pnpm fixtures:summary --regenerate'
      )
    }
  )

  it.each([{ CI: 'false' }, { VITEST: 'true' }, { NODE_ENV: 'test' }])(
    'refuses explicit regeneration in CI or tests: %j',
    (environment) => {
      const result = run(['--regenerate'], environment)
      expect(result.status).toBe(2)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('disabled in CI and test environments')
    }
  )
})

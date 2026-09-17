import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appUrl } from '../lib/config'
import {
  parseProductionArgs,
  productionNotice,
  productionPlan,
  runProduction
} from '../scripts/production'

const dependencies = vi.hoisted(() => ({
  readFile: vi.fn<(path: string, encoding: string) => Promise<string>>(),
  spawn: vi.fn<
    (
      command: string,
      args: string[],
      options: {
        cwd: string
        env: NodeJS.ProcessEnv
        stdio: string
        detached: boolean
      }
    ) => EventEmitter
  >(),
  query:
    vi.fn<(strings: TemplateStringsArray) => Promise<{ ready: boolean }[]>>(),
  end: vi.fn<(options: { timeout: number }) => Promise<void>>(),
  postgres: vi.fn<(connection: string, options: unknown) => unknown>(),
  drizzle: vi.fn<(client: unknown) => { mock: string }>(),
  migrate:
    vi.fn<
      (
        database: unknown,
        options: { migrationsFolder: string }
      ) => Promise<void>
    >()
}))
vi.mock('node:fs/promises', () => ({ readFile: dependencies.readFile }))
vi.mock('node:child_process', () => ({ spawn: dependencies.spawn }))
vi.mock('postgres', () => ({ default: dependencies.postgres }))
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: dependencies.drizzle }))
vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: dependencies.migrate
}))

const runtime =
  'postgresql://owner:runtime-secret@production-pooler.example.com/passage?sslmode=require'
const direct =
  'postgresql://owner:migration-secret@production.example.com/passage?sslmode=require'
const credentials = {
  DATABASE_URL: runtime,
  DIRECT_DATABASE_URL: direct,
  APP_SECRET: 'production-secret-with-at-least-32-characters',
  OPENAI_API_KEY: 'production-model-key',
  AI_PROVIDER: 'openai',
  AI_MODEL: 'configured-model'
}
const configuration = (overrides: Record<string, string> = {}) =>
  Object.entries({ ...credentials, ...overrides })
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')

function productionAppUrl(env: NodeJS.ProcessEnv) {
  for (const name of [
    'NODE_ENV',
    'PORT',
    'PORTLESS_URL',
    'VERCEL',
    'VERCEL_ENV',
    'VERCEL_TARGET_ENV',
    'VERCEL_URL',
    'VERCEL_BRANCH_URL',
    'VERCEL_PROJECT_PRODUCTION_URL'
  ]) {
    vi.stubEnv(name, env[name] ?? '')
  }
  return appUrl()
}

function allowExplicitCommands() {
  vi.stubEnv('CI', '')
  vi.stubEnv('VITEST', '')
  vi.stubEnv('NODE_ENV', 'development')
}

beforeEach(() => {
  vi.resetAllMocks()
  dependencies.readFile.mockResolvedValue(configuration())
  dependencies.spawn.mockImplementation(() => {
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0))
    return child
  })
  dependencies.query.mockResolvedValue([{ ready: true }])
  dependencies.end.mockResolvedValue(undefined)
  dependencies.postgres.mockReturnValue(
    Object.assign(dependencies.query, { end: dependencies.end })
  )
  dependencies.drizzle.mockReturnValue({ mock: 'database' })
  dependencies.migrate.mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('explicit production configuration', () => {
  it.each(['S3', 'R2'] as const)(
    'forwards explicit %s storage configuration and clears the other naming scheme',
    (scheme) => {
      const storage: Record<string, string> =
        scheme === 'S3'
          ? {
              S3_ACCESS_KEY_ID: 'production-storage-key',
              S3_SECRET_ACCESS_KEY: 'production-storage-secret',
              S3_API_ENDPOINT: `https://${'0'.repeat(32)}.us.r2.cloudflarestorage.com`,
              S3_BUCKET_NAME: 'production-public',
              S3_PRIVATE_BUCKET_NAME: 'production-private',
              S3_PUBLIC_URL: 'https://passage.cultural-alignment.com'
            }
          : {
              R2_ACCESS_KEY_ID: 'production-storage-key',
              R2_SECRET_ACCESS_KEY: 'production-storage-secret',
              R2_ENDPOINT: `https://${'0'.repeat(32)}.us.r2.cloudflarestorage.com`,
              R2_PUBLIC_BUCKET: 'production-public',
              R2_PRIVATE_BUCKET: 'production-private',
              R2_PUBLIC_URL: 'https://passage.cultural-alignment.com'
            }
      const plan = productionPlan(['build'], configuration(storage), {
        S3_ACCESS_KEY_ID: 'development-key',
        R2_SECRET_ACCESS_KEY: 'development-secret',
        R2_ACCOUNT_ID: 'development-account'
      })
      expect(plan.env).toMatchObject(storage)
      expect(plan.env.R2_ACCOUNT_ID).toBe('')
      expect(
        plan.env[scheme === 'S3' ? 'R2_SECRET_ACCESS_KEY' : 'S3_ACCESS_KEY_ID']
      ).toBe('')
    }
  )

  it('keeps missing production storage credentials empty to block automatic development env fallback', () => {
    const plan = productionPlan(
      ['dev'],
      configuration({
        S3_PUBLIC_URL: 'https://passage.cultural-alignment.com'
      }),
      {
        S3_ACCESS_KEY_ID: 'development-key',
        S3_SECRET_ACCESS_KEY: 'development-secret'
      }
    )
    expect(plan.env).toMatchObject({
      S3_PUBLIC_URL: 'https://passage.cultural-alignment.com',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: ''
    })
  })

  it('uses only file credentials and local app settings despite inherited deployment/test values', () => {
    const inherited = {
      PATH: '/tools',
      HOME: '/user',
      DATABASE_URL: 'inherited-database',
      DIRECT_DATABASE_URL: 'inherited-direct',
      APP_SECRET: 'inherited-secret',
      OPENAI_API_KEY: 'inherited-key',
      AI_MODEL: 'inherited-model',
      PORTLESS_URL: 'https://dev.example',
      APP_URL: 'https://hosted.example',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_TARGET_ENV: 'production',
      VERCEL_URL: 'deployment.vercel.app',
      VERCEL_BRANCH_URL: 'branch.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'production.example',
      TRUST_PROXY: 'vercel',
      TEST_DATABASE_URL: runtime,
      NODE_OPTIONS: '--require unwanted.js',
      NEXT_PUBLIC_UNRELATED: 'inherited'
    }
    const plan = productionPlan(
      ['dev'],
      configuration({ APP_URL: 'https://ignored.example' }),
      inherited
    )
    expect(plan.env).toMatchObject({
      ...credentials,
      DATABASE_URL_UNPOOLED: direct,
      PORT: '3001',
      NODE_ENV: 'development',
      PASSAGE_PRODUCTION_LOCAL: '1',
      PORTLESS_URL: '',
      TRUST_PROXY: 'none',
      VERCEL: '0',
      VERCEL_ENV: '',
      VERCEL_TARGET_ENV: '',
      VERCEL_URL: '',
      VERCEL_BRANCH_URL: '',
      VERCEL_PROJECT_PRODUCTION_URL: '',
      TEST_DATABASE_URL: '',
      PATH: '/tools',
      HOME: '/user'
    })
    expect(plan.env.APP_URL).toBeUndefined()
    vi.stubEnv('APP_URL', inherited.APP_URL)
    expect(productionAppUrl(plan.env)).toBe('http://localhost:3001')
    expect(plan.env.NODE_OPTIONS).toBeUndefined()
    expect(plan.env.NEXT_PUBLIC_UNRELATED).toBeUndefined()
    expect(inherited.DATABASE_URL).toBe('inherited-database')
  })

  it.each([
    'DATABASE_URL',
    'DIRECT_DATABASE_URL',
    'APP_SECRET',
    'OPENAI_API_KEY'
  ])('fails closed when %s is absent from the explicit file', (name) => {
    expect(() =>
      productionPlan(['dev'], configuration({ [name]: '' }), credentials)
    ).toThrow(`Set ${name} in .env.prod.local`)
  })

  it('rejects weak secrets and mismatched databases without printing connection strings', () => {
    expect(() =>
      productionPlan(['build'], configuration({ APP_SECRET: 'short' }), {})
    ).toThrow('at least 32')
    expect(() =>
      productionPlan(
        ['migrate'],
        configuration({
          DIRECT_DATABASE_URL: direct.replace('/passage?', '/other?')
        }),
        {}
      )
    ).toThrow('same production database')
    const invalid = () =>
      productionPlan(
        ['check'],
        configuration({ DATABASE_URL: 'secret-value-not-a-url' }),
        {}
      )
    expect(invalid).toThrow('valid PostgreSQL URL')
    expect(invalid).not.toThrow('secret-value')
  })

  it('rejects different Neon endpoints even when both databases are called neondb', () => {
    const contents = configuration({
      DATABASE_URL:
        'postgresql://owner:key@ep-first-pooler.us-east-2.aws.neon.tech/neondb',
      DIRECT_DATABASE_URL:
        'postgresql://owner:key@ep-second.us-east-2.aws.neon.tech/neondb'
    })
    expect(() => productionPlan(['migrate'], contents, {})).toThrow(
      'same production database and endpoint'
    )
  })

  it('prints only action, host and database in the production-data notice', () => {
    const plan = productionPlan(['migrate'], configuration(), {})
    expect(productionNotice(plan)).toBe(
      'PRODUCTION DATA: migrate · production.example.com / passage. This uses real production data.'
    )
    expect(productionNotice(plan)).not.toMatch(
      /owner|secret|sslmode|postgresql/
    )
  })

  it.each([
    {
      action: 'dev',
      mode: 'development',
      command: [
        fileURLToPath(import.meta.resolve('next/dist/bin/next')),
        'dev',
        '--hostname',
        'localhost',
        '--port',
        '3101'
      ]
    },
    {
      action: 'start',
      mode: 'production',
      command: [
        fileURLToPath(import.meta.resolve('next/dist/bin/next')),
        'start',
        '--hostname',
        'localhost',
        '--port',
        '3101'
      ]
    },
    {
      action: 'build',
      mode: 'production',
      command: [
        fileURLToPath(import.meta.resolve('next/dist/bin/next')),
        'build',
        '--webpack'
      ]
    }
  ])(
    'keeps $action origin and port consistent with an explicit override',
    ({ action, mode, command }) => {
      const plan = productionPlan(
        [action, '--port', '3101'],
        configuration(),
        {}
      )
      expect(plan.env.APP_URL).toBeUndefined()
      expect(productionAppUrl(plan.env)).toBe('http://localhost:3101')
      expect(plan.env.PORT).toBe('3101')
      expect(plan.env.NODE_ENV).toBe(mode)
      expect(plan.steps.at(-1)?.args).toEqual(command)
    }
  )

  it.each([
    ['test'],
    ['migrate', '--port', '3001'],
    ['dev', '--port'],
    ['dev', '--hostname', '0.0.0.0'],
    ['start', '--port', '0'],
    ['start', '--port', '65536'],
    ['dev', '--port', '3001', '--help']
  ])('rejects unsupported or ambiguous arguments: %j', (...args) => {
    expect(() => parseProductionArgs(args)).toThrow()
  })
})

describe('production command dispatch without live services', () => {
  it.each(['CI', 'VITEST', 'NODE_ENV'])(
    'blocks production execution under %s before reading any credential file',
    async (name) => {
      allowExplicitCommands()
      vi.stubEnv(name, name === 'NODE_ENV' ? 'test' : '1')
      await expect(runProduction(['migrate'])).rejects.toThrow(
        'disabled in CI and test'
      )
      expect(dependencies.readFile).not.toHaveBeenCalled()
      expect(dependencies.spawn).not.toHaveBeenCalled()
      expect(dependencies.postgres).not.toHaveBeenCalled()
    }
  )

  it('never falls back to another file when .env.prod.local is missing', async () => {
    allowExplicitCommands()
    dependencies.readFile.mockRejectedValue(new Error('ENOENT'))
    await expect(runProduction(['start'])).rejects.toThrow(
      'Create .env.prod.local from .env.prod.example'
    )
    expect(dependencies.readFile).toHaveBeenCalledTimes(1)
    expect(dependencies.readFile.mock.calls[0]![0]).toMatch(
      /\/\.env\.prod\.local$/
    )
    expect(dependencies.spawn).not.toHaveBeenCalled()
  })

  it('prepares fonts before building, using the isolated environment for both subprocesses', async () => {
    allowExplicitCommands()
    await runProduction(['build'])
    expect(
      dependencies.spawn.mock.calls.map(([command, args]) => [command, args])
    ).toEqual([
      [
        process.execPath,
        [
          '--import',
          'tsx',
          fileURLToPath(new URL('../scripts/prepare-fonts.ts', import.meta.url))
        ]
      ],
      [
        process.execPath,
        [
          fileURLToPath(import.meta.resolve('next/dist/bin/next')),
          'build',
          '--webpack'
        ]
      ]
    ])
    for (const [, , options] of dependencies.spawn.mock.calls) {
      expect(options.env.DATABASE_URL).toBe(runtime)
      expect(options.env.APP_URL).toBeUndefined()
      expect(productionAppUrl(options.env)).toBe('http://localhost:3001')
      expect(options.env.NODE_ENV).toBe('production')
      expect(options.env.PASSAGE_PRODUCTION_LOCAL).toBe('1')
    }
    expect(dependencies.postgres).not.toHaveBeenCalled()
  })

  it('migrates through the direct URL with no dotenv-loaded Drizzle CLI fallback', async () => {
    allowExplicitCommands()
    await runProduction(['migrate'])
    expect(dependencies.postgres.mock.calls[0]![0]).toBe(direct)
    expect(dependencies.migrate).toHaveBeenCalledWith(
      { mock: 'database' },
      {
        migrationsFolder: expect.stringMatching(/\/drizzle$/)
      }
    )
    expect(dependencies.query).not.toHaveBeenCalled()
    expect(dependencies.spawn).not.toHaveBeenCalled()
    expect(dependencies.end).toHaveBeenCalled()
  })

  it('checks application table existence through the runtime URL without reading saved content', async () => {
    allowExplicitCommands()
    await runProduction(['check'])
    expect(dependencies.postgres.mock.calls[0]![0]).toBe(runtime)
    const query = dependencies.query.mock.calls[0]![0].join('')
    expect(query).toContain("to_regclass('public.sources')")
    expect(query).not.toMatch(/insert|update|delete|truncate|from\s+public/i)
    expect(dependencies.migrate).not.toHaveBeenCalled()
    expect(dependencies.end).toHaveBeenCalled()
  })
})

describe('production subprocess lifecycle', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'targeting only the wrapper with %s stops its child listener before the wrapper exits',
    async (signal) => {
      const { spawn: realSpawn } =
        await vi.importActual<typeof import('node:child_process')>(
          'node:child_process'
        )
      const fixture = fileURLToPath(
        new URL('./fixtures/production-lifecycle.mjs', import.meta.url)
      )
      const wrapper = realSpawn(
        process.execPath,
        ['--import', 'tsx', fixture, 'wrapper'],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { NODE_ENV: 'test' },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      const lines = createInterface({ input: wrapper.stdout! })
      const output: Record<string, number | boolean>[] = []
      lines.on('line', (line) => output.push(JSON.parse(line)))
      const closed = once(wrapper, 'close')
      let ownedPids: number[] = []
      try {
        const [line] = await once(lines, 'line')
        const ready = JSON.parse(line) as {
          port: number
          listener: number
          supervisor: number
        }
        ownedPids = [ready.listener, ready.supervisor]
        wrapper.kill(signal)
        const [code, exitSignal] = await closed
        expect(code).toBe(signal === 'SIGINT' ? 130 : 143)
        expect(exitSignal).toBeNull()
        expect(output.slice(1)).toEqual([
          { listenerClosed: true },
          { supervisorClosed: true },
          { wrapperClosed: true }
        ])
        // Rebinding proves no orphaned descendant retains the listening socket.
        const probe = createServer()
        try {
          const listening = once(probe, 'listening')
          probe.listen(ready.port, '127.0.0.1')
          await listening
        } finally {
          probe.close()
        }
      } finally {
        lines.close()
        wrapper.kill('SIGKILL')
        // Cleanup is limited to PIDs reported by this test's own fixture.
        for (const pid of ownedPids) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {}
        }
      }
    }
  )
})

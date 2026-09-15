import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const projectDirectory = fileURLToPath(new URL('..', import.meta.url))
const configurationFile = '.env.prod.local'
const nextCli = fileURLToPath(import.meta.resolve('next/dist/bin/next'))
const actions = ['dev', 'build', 'start', 'migrate', 'check'] as const

type ProductionAction = (typeof actions)[number]
type Step = { command: string; args: string[] }

export type ProductionPlan = {
  action: ProductionAction
  env: NodeJS.ProcessEnv
  hostname: string
  database: string
  steps: Step[]
}

class ConfigurationError extends Error {}

export function parseProductionArgs(args: string[]) {
  const [action, option, value, ...extra] = args
  if (!actions.includes(action as ProductionAction)) {
    throw new ConfigurationError(
      'Use dev:prod, build:prod, start:prod, db:migrate:prod or db:check:prod.'
    )
  }
  const appCommand =
    action === 'dev' || action === 'build' || action === 'start'
  if (
    option !== undefined &&
    (!appCommand || option !== '--port' || value === undefined)
  ) {
    throw new ConfigurationError('App commands accept only --port <number>.')
  }
  const port = value === undefined ? 3001 : Number(value)
  if (extra.length || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('Choose a port between 1 and 65535.')
  }
  return { action: action as ProductionAction, port }
}

function required(values: Record<string, string | undefined>, name: string) {
  const value = values[name]?.trim()
  if (!value)
    throw new ConfigurationError(`Set ${name} in ${configurationFile}.`)
  return value
}

function databaseAddress(value: string, name: string) {
  try {
    const url = new URL(value)
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    ) {
      throw new Error('Invalid connection string')
    }
    return url
  } catch {
    throw new ConfigurationError(
      `Set a valid PostgreSQL URL for ${name} in ${configurationFile}.`
    )
  }
}

/** Build an isolated child environment; app credentials come only from the explicit file. */
export function productionPlan(
  args: string[],
  contents: string,
  inherited: Record<string, string | undefined>
): ProductionPlan {
  const { action, port } = parseProductionArgs(args)
  const values = parseEnv(contents)
  const databaseUrl = required(values, 'DATABASE_URL')
  const directUrl = required(values, 'DIRECT_DATABASE_URL')
  const runtime = databaseAddress(databaseUrl, 'DATABASE_URL')
  const direct = databaseAddress(directUrl, 'DIRECT_DATABASE_URL')
  const runtimeHost = runtime.hostname
    .toLowerCase()
    .replace(/-pooler(?=\.)/, '')
  if (
    runtimeHost !== direct.hostname.toLowerCase() ||
    runtime.pathname !== direct.pathname
  ) {
    throw new ConfigurationError(
      'DATABASE_URL and DIRECT_DATABASE_URL must name the same production database and endpoint.'
    )
  }
  const secret = required(values, 'APP_SECRET')
  if (secret.length < 32)
    throw new ConfigurationError(
      `APP_SECRET in ${configurationFile} must contain at least 32 characters.`
    )
  const apiKey = required(values, 'OPENAI_API_KEY')
  const provider = values.AI_PROVIDER?.trim() || 'openai'
  if (provider !== 'openai')
    throw new ConfigurationError(
      `AI_PROVIDER in ${configurationFile} must be openai.`
    )
  const authUrl = values.BETTER_AUTH_URL?.trim()
  if (
    authUrl &&
    (action === 'dev' || action === 'build' || action === 'start')
  ) {
    const localOrigin = `http://localhost:${port}`
    let matchesLocalOrigin = false
    try {
      const parsed = new URL(authUrl)
      matchesLocalOrigin =
        parsed.origin === localOrigin &&
        !parsed.username &&
        !parsed.password &&
        parsed.pathname === '/' &&
        !parsed.search &&
        !parsed.hash
    } catch {}
    if (!matchesLocalOrigin)
      throw new ConfigurationError(
        `BETTER_AUTH_URL in ${configurationFile} must match ${localOrigin}, or be omitted for the local origin default.`
      )
  }

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: action === 'dev' ? 'development' : 'production'
  }
  // Preserve operating-system tooling, not inherited app/database credentials.
  for (const name of [
    'PATH',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'TZ',
    'TERM',
    'COLORTERM',
    'NO_COLOR',
    'FORCE_COLOR'
  ]) {
    if (inherited[name] !== undefined) env[name] = inherited[name]
  }
  Object.assign(env, {
    DATABASE_URL: databaseUrl,
    DIRECT_DATABASE_URL: directUrl,
    DATABASE_URL_UNPOOLED: directUrl,
    APP_SECRET: secret,
    OPENAI_API_KEY: apiKey,
    AI_PROVIDER: provider,
    AI_MODEL: values.AI_MODEL?.trim() || '',
    // Defined values take precedence over every automatically loaded Next .env file.
    PASSAGE_PRODUCTION_LOCAL: '1',
    WORKFLOW_TARGET_WORLD: 'local',
    WORKFLOW_LOCAL_DATA_DIR: '.next-prod/workflow-data',
    WORKFLOW_LOCAL_BASE_URL: `http://localhost:${port}`,
    PORT: String(port),
    PORTLESS_URL: '',
    TRUST_PROXY: 'none',
    VERCEL: '0',
    VERCEL_ENV: '',
    VERCEL_TARGET_ENV: '',
    VERCEL_URL: '',
    VERCEL_BRANCH_URL: '',
    VERCEL_PROJECT_PRODUCTION_URL: '',
    TEST_DATABASE_URL: '',
    ANTHROPIC_API_KEY: '',
    AI_GATEWAY_API_KEY: '',
    VERCEL_OIDC_TOKEN: ''
  })
  // Empty values also block Next from loading development credentials or aliases
  // from .env.local while this child is connected to the production database.
  for (const name of [
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'CRON_SECRET',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'RESEND_REPLY_TO',
    'EMAIL_FROM',
    'EMAIL_REPLY_TO',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_UPGRADE_PORTAL_CONFIGURATION_ID',
    'STRIPE_PLUS_MONTHLY_PRICE_ID',
    'STRIPE_PLUS_ANNUAL_PRICE_ID',
    'STRIPE_PRO_MONTHLY_PRICE_ID',
    'STRIPE_PRO_ANNUAL_PRICE_ID',
    'STRIPE_IMAGE_PACK_PRICE_ID',
    'STRIPE_LIVE_CHECKOUT_ENABLED',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_PUBLIC_BUCKET',
    'R2_PRIVATE_BUCKET',
    'R2_PUBLIC_URL',
    'R2_ENDPOINT',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_API_ENDPOINT',
    'S3_BUCKET_NAME',
    'S3_PRIVATE_BUCKET_NAME',
    'S3_PUBLIC_URL',
    'IMAGE_AI_MODEL',
    'IMAGE_GENERATION_ENABLED',
    'IMAGE_AI_MONTHLY_BUDGET_USD',
    'IMAGE_GENERATION_CONCURRENCY'
  ]) {
    env[name] = values[name]?.trim() || ''
  }
  const steps: Step[] = []
  if (action === 'dev' || action === 'build') {
    steps.push({
      command: process.execPath,
      args: [
        '--import',
        'tsx',
        join(projectDirectory, 'scripts/prepare-fonts.ts')
      ]
    })
  }
  if (action === 'dev' || action === 'start') {
    steps.push({
      command: process.execPath,
      args: [nextCli, action, '--hostname', 'localhost', '--port', String(port)]
    })
  } else if (action === 'build') {
    steps.push({
      command: process.execPath,
      args: [nextCli, 'build', '--webpack']
    })
  }
  const target = action === 'migrate' ? direct : runtime
  return {
    action,
    env,
    hostname: target.hostname,
    database: target.pathname.slice(1),
    steps
  }
}

export function productionNotice(plan: ProductionPlan) {
  return `PRODUCTION DATA: ${plan.action} · ${plan.hostname} / ${plan.database}. This uses real production data.`
}

export class ProductionInterrupted extends Error {
  readonly exitCode: number

  constructor(signal: 'SIGINT' | 'SIGTERM') {
    super(`Production command interrupted by ${signal}.`)
    this.exitCode = signal === 'SIGINT' ? 130 : 143
  }
}

/** Own the child group so stopping this wrapper also stops Next's workers. */
export function runProductionStep(step: Step, env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolveStep, reject) => {
    const grouped = process.platform !== 'win32'
    const child = spawn(step.command, step.args, {
      cwd: projectDirectory,
      env,
      stdio: 'inherit',
      detached: grouped
    })
    let interrupted: 'SIGINT' | 'SIGTERM' | undefined
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const signalChild = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (grouped) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch (err) {
        // A completed child group has already released its listeners.
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    const stop = (signal: 'SIGINT' | 'SIGTERM') => {
      if (interrupted) return
      interrupted = signal
      signalChild(signal)
      killTimer = setTimeout(() => signalChild('SIGKILL'), 5000)
    }
    const onInterrupt = () => stop('SIGINT')
    const onTerminate = () => stop('SIGTERM')
    const cleanup = () => {
      clearTimeout(killTimer)
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      // Also reap descendants if the child exited before they finished.
      signalChild('SIGKILL')
    }
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    child.once('error', () => {
      cleanup()
      reject(new Error('Could not start production command.'))
    })
    child.once('close', (code) => {
      cleanup()
      if (interrupted) reject(new ProductionInterrupted(interrupted))
      else if (code === 0) resolveStep()
      else reject(new Error('Production command failed.'))
    })
  })
}

async function runDatabaseCommand(plan: ProductionPlan) {
  const { default: postgres } = await import('postgres')
  const connection =
    plan.action === 'migrate'
      ? plan.env.DIRECT_DATABASE_URL!
      : plan.env.DATABASE_URL!
  const sql = postgres(connection, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    connection: { statement_timeout: plan.action === 'check' ? 15_000 : 0 }
  })
  try {
    if (plan.action === 'migrate') {
      const { drizzle } = await import('drizzle-orm/postgres-js')
      const { migrate } = await import('drizzle-orm/postgres-js/migrator')
      await migrate(drizzle(sql), {
        migrationsFolder: join(projectDirectory, 'drizzle')
      })
      console.log('Production migrations applied.')
    } else {
      const [schema] = await sql<{ ready: boolean }[]>`
        select to_regclass('public.sources') is not null
          and to_regclass('public.snapshots') is not null
          and to_regclass('public.publications') is not null
          and to_regclass('public.rate_limits') is not null as ready
      `
      if (!schema?.ready) {
        throw new ConfigurationError(
          'Production is reachable but application tables are missing. Run pnpm db:migrate:prod.'
        )
      }
      console.log(
        'Production database is reachable and application tables exist.'
      )
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export async function runProduction(args: string[]) {
  // Check before reading credentials or opening a database connection.
  if (process.env.CI || process.env.VITEST || process.env.NODE_ENV === 'test') {
    throw new ConfigurationError(
      'Production commands are disabled in CI and test environments.'
    )
  }
  parseProductionArgs(args)
  let contents: string
  try {
    contents = await readFile(join(projectDirectory, configurationFile), 'utf8')
  } catch {
    throw new ConfigurationError(
      `Create ${configurationFile} from .env.prod.example and fill in production credentials.`
    )
  }
  const plan = productionPlan(args, contents, process.env)
  console.warn(productionNotice(plan))
  if (plan.action === 'migrate' || plan.action === 'check') {
    await runDatabaseCommand(plan)
  } else {
    for (const step of plan.steps) await runProductionStep(step, plan.env)
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runProduction(process.argv.slice(2)).catch((err: unknown) => {
    if (err instanceof ProductionInterrupted) {
      process.exitCode = err.exitCode
      return
    }
    console.error(
      err instanceof ConfigurationError
        ? err.message
        : 'Production command failed. Check the production configuration and service availability.'
    )
    process.exitCode = 1
  })
}

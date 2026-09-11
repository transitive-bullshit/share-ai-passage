import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.resolve(
  fileURLToPath(new URL('..', import.meta.url))
)
const workDirectory = path.join(projectDirectory, 'work')
const dataDirectory = path.join(workDirectory, 'postgres-data')
const ownerMarker = path.join(dataDirectory, '.ai-chat-proxy-local')
const databasePort = 55432
const databaseName = 'ai_chat_proxy'
const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/${databaseName}`
const action = process.argv[2] ?? 'start'

if (!['start', 'stop', 'status'].includes(action)) {
  throw new Error('Usage: pnpm db:local [start|stop|status]')
}

const binaryDirectories = [
  process.env.PG_BIN,
  '/Applications/Postgres.app/Contents/Versions/latest/bin',
  '/opt/homebrew/opt/postgresql@17/bin',
  '/opt/homebrew/opt/postgresql@16/bin',
  '/usr/local/opt/postgresql@17/bin',
  ...(process.env.PATH ?? '').split(path.delimiter)
].filter((directory): directory is string => Boolean(directory))

const binaryDirectory = binaryDirectories.find((directory) =>
  existsSync(path.join(directory, 'pg_ctl'))
)

if (!binaryDirectory) {
  throw new Error(
    'PostgreSQL binaries were not found. Install PostgreSQL or set PG_BIN to its bin directory. Docker Compose is also supported.'
  )
}

function run(name: string, args: string[], allowFailure = false) {
  const result = spawnSync(path.join(binaryDirectory!, name), args, {
    encoding: 'utf8',
    timeout: 30_000
  })
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(result.error?.message ?? result.stderr ?? `${name} failed.`)
  }
  return result
}

function assertOwned() {
  if (!existsSync(ownerMarker)) {
    throw new Error(
      `Refusing to operate on an unrecognized PostgreSQL directory: ${dataDirectory}`
    )
  }
}

function running() {
  return run('pg_ctl', ['-D', dataDirectory, 'status'], true).status === 0
}

async function assertPortAvailable() {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', () => {
      reject(
        new Error(
          `Port ${databasePort} is in use by another process. This script will not alter an existing database instance.`
        )
      )
    })
    server.listen(databasePort, '127.0.0.1', () =>
      server.close(() => resolve())
    )
  })
}

if (action === 'status') {
  if (!existsSync(ownerMarker)) {
    console.log('Local project PostgreSQL has not been initialized.')
  } else {
    console.log(
      running()
        ? `PostgreSQL is running: ${databaseUrl}`
        : 'PostgreSQL is stopped.'
    )
  }
} else if (action === 'stop') {
  assertOwned()
  if (running())
    run('pg_ctl', ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'])
  console.log(
    'Local project PostgreSQL is stopped. Saved data remains in work/postgres-data.'
  )
} else {
  if (!existsSync(path.join(dataDirectory, 'PG_VERSION'))) {
    await assertPortAvailable()
    mkdirSync(workDirectory, { recursive: true })
    run('initdb', [
      '-D',
      dataDirectory,
      '--username=postgres',
      '--auth-local=trust',
      '--auth-host=trust',
      '--encoding=UTF8',
      '--locale=C'
    ])
    writeFileSync(
      ownerMarker,
      'Owned by the ai-chat-proxy local development script.\n'
    )
  }
  assertOwned()
  if (!running()) {
    await assertPortAvailable()
    run('pg_ctl', [
      '-D',
      dataDirectory,
      '-l',
      path.join(workDirectory, 'postgres.log'),
      '-o',
      `-h 127.0.0.1 -p ${databasePort} -c unix_socket_directories=`,
      '-w',
      'start'
    ])
  }
  const connectionArgs = [
    '-h',
    '127.0.0.1',
    '-p',
    String(databasePort),
    '-U',
    'postgres'
  ]
  const exists = run('psql', [
    ...connectionArgs,
    '-d',
    'postgres',
    '-Atc',
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`
  ])
  if (exists.stdout.trim() !== '1')
    run('createdb', [...connectionArgs, databaseName])
  console.log(`PostgreSQL is ready: ${databaseUrl}`)
  console.log(
    'This development instance trusts local connections and listens only on 127.0.0.1.'
  )
}

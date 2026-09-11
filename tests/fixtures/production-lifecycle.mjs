import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const mode = process.argv[2]

if (mode === 'wrapper') {
  const { runProductionStep, ProductionInterrupted } =
    await import('../../scripts/production.ts')
  try {
    await runProductionStep(
      {
        command: process.execPath,
        args: [filename, 'supervisor']
      },
      { NODE_ENV: 'test' }
    )
  } catch (err) {
    if (!(err instanceof ProductionInterrupted)) throw err
    process.exitCode = err.exitCode
  }
  console.log(JSON.stringify({ wrapperClosed: true }))
} else if (mode === 'supervisor') {
  // Like next dev, supervise a separate server process and wait for its exit.
  const child = spawn(process.execPath, [filename, 'listener'], {
    stdio: 'inherit'
  })
  process.on('SIGINT', () => child.kill('SIGINT'))
  process.on('SIGTERM', () => child.kill('SIGTERM'))
  child.once('exit', () =>
    console.log(JSON.stringify({ supervisorClosed: true }))
  )
} else {
  const server = createServer()
  server.listen(0, '127.0.0.1', () => {
    console.log(
      JSON.stringify({
        port: server.address().port,
        listener: process.pid,
        supervisor: process.ppid
      })
    )
  })
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    // Ensure the wrapper actually waits for graceful child shutdown.
    setTimeout(
      () =>
        server.close(() =>
          console.log(JSON.stringify({ listenerClosed: true }))
        ),
      100
    )
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

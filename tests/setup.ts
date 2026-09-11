import { Socket } from 'node:net'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function requireLoopback(hostname: string) {
  if (!loopbackHosts.has(hostname)) {
    throw new Error(
      'Unit tests cannot access external services. Use mocked fixtures; live checks must run separately.'
    )
  }
}

// Assign directly so vi.unstubAllGlobals() restores this guard, not real fetch.
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  requireLoopback(url.hostname)
  return originalFetch(input, init)
}

// Cover Node HTTP(S), SDK clients, and redirects from a loopback fetch too.
// Provider tests can still replace their HTTP boundary with vi.mock fixtures.
// oxlint-disable-next-line typescript/unbound-method -- Reflect.apply preserves the socket receiver.
const originalConnect = Socket.prototype.connect
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  // Node internals sometimes pass an already-normalized [options, callback].
  const values = Array.isArray(args[0]) ? args[0] : args
  const first: unknown = values[0]
  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: string; path?: string }
    if (!options.path) requireLoopback(options.host ?? 'localhost')
  } else if (
    typeof first === 'number' ||
    (typeof first === 'string' && /^\d+$/.test(first))
  ) {
    requireLoopback(typeof values[1] === 'string' ? values[1] : 'localhost')
  }
  return Reflect.apply(originalConnect, this, args)
} as Socket['connect']

import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Unit tests never load developer credentials from .env or .env.local.
  envDir: false,
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Override inherited shell/CI credentials before loading test modules.
    env: {
      OPENAI_API_KEY: '',
      ANTHROPIC_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
      VERCEL_OIDC_TOKEN: ''
    },
    testTimeout: 15_000,
    hookTimeout: 30_000
  }
})

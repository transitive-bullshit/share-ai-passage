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
      RESEND_API_KEY: '',
      RESEND_FROM_EMAIL: '',
      RESEND_REPLY_TO: '',
      EMAIL_FROM: '',
      EMAIL_REPLY_TO: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GITHUB_CLIENT_ID: '',
      GITHUB_CLIENT_SECRET: '',
      BETTER_AUTH_SECRET: '',
      BETTER_AUTH_URL: '',
      ANTHROPIC_API_KEY: '',
      AI_GATEWAY_API_KEY: '',
      VERCEL_OIDC_TOKEN: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      VERCEL: '',
      VERCEL_ENV: '',
      VERCEL_TARGET_ENV: '',
      VERCEL_PROJECT_PRODUCTION_URL: '',
      VERCEL_BRANCH_URL: '',
      VERCEL_URL: '',
      PORTLESS_URL: '',
      PORT: '3000'
    },
    testTimeout: 15_000,
    hookTimeout: 30_000
  }
})

## Conventions

- use `pnpm`
- use modern typescript
- no semicolons
- oxfmt for formatting (`pnpm fix:format`)
- oxlint for linting (`pnpm fix:lint`)

## Context

Keep agent context documents under `docs/`. Read the relevant document for the task:

- Entities and terminology: [domain glossary](docs/CONTEXT.md).
- Product behavior and scope: [MVP plan](docs/MVP_PLAN.md).
- Provider extraction and supported shares: [extraction evidence](docs/EXTRACTION.md).
- Validation and known gaps: [verification notes](docs/VERIFICATION.md).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

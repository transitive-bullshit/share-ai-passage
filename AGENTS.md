## Conventions

- Keep it simple: use the existing architecture, tooling, and workflow; add complexity only for a concrete need.
- Use `pnpm` and modern TypeScript without semicolons.
- Format with `pnpm fix:format` (oxfmt); lint with `pnpm fix:lint` (oxlint).

## Context

Keep current guidance concise under `docs/`. Read the relevant document for the task:

- Setup and CLI usage: [Contributing](contributing.md).
- Customer-facing UI, marketing, README, or social assets: read [Brand identity](docs/brand-identity.md) and apply its accepted copy, visual rules, and reusable assets.
- Product behavior, scope, and remaining work: [MVP plan](docs/MVP_PLAN.md).
- Entities and terminology: [domain glossary](docs/CONTEXT.md).
- Message extraction, storage, or rendering: [message model](docs/MESSAGE_MODEL.md).
- Provider URLs, fetching, or parsing: [extraction guide](docs/EXTRACTION.md).
- Writing, running, or reviewing tests and changing CI: [testing guidelines](docs/testing.md).
- Share card visuals or AI summary task changes: use [visual-share-card-migration](.agents/skills/visual-share-card-migration/SKILL.md) to capture a baseline before editing and compare the result.
- Deployment, production data, or self-hosting: [production guide](docs/PRODUCTION.md).

Update the relevant existing document when behavior changes. `docs/archive/` holds historical reports; `docs/research/` and `docs/brand-exploration/` contain research and proposals, not current requirements.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

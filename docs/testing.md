# Testing guidelines

## Choosing permanent tests

Be relaxed about adding and keeping fast, isolated unit tests. A small, deterministic test of meaningful behavior, an edge case, or a regression can earn its place even for a reversible, low-impact change. Keep setup and assertions simple; tests that merely repeat implementation details or check arbitrary constants add little confidence.

Be more judicious with heavyweight integration and end-to-end tests. They are essential for behavior that depends on real browsers, builds, storage, process boundaries, or interactions between components, but impose greater runtime, CI, debugging, and maintenance costs. Each test should cover an important failure mode that cheaper tests cannot adequately catch. Prefer focused scenarios and representative combinations; expand provider, card-template, viewport, and lifecycle matrices when the combinations expose distinct risks.

Judge a test by its actual dependencies and cost, not its filename or runner. A test that renders images with native libraries, accesses PostgreSQL, launches a subprocess, or starts a server is an integration test even if it runs under the unit command. Use the cheapest layer that gives credible coverage. Keep real database tests for constraints, concurrency, and persistence; real CLI tests for process and file boundaries; and browser checks for rendering and native interaction that mocks cannot establish.

## Running and maintaining tests

Run tests appropriate to the change and complete required checks. Once those pass, broaden or repeat testing only when new changes, failures, or unresolved concerns justify it; otherwise, continue toward completing the task. These guidelines preserve the checks required by the affected area and release workflow.

When reviewing expensive tests, consider the unique failures they catch alongside measured runtime, flakiness, setup, and maintenance burden. Simplify duplicate scenarios and move suitable assertions to cheaper tests before removing valuable coverage. Keep critical user journeys and known regressions covered. Changing how often a heavyweight suite runs requires preserving its relevant change and release checks.

The repository check is `pnpm test`; its commands are defined in [package.json](../package.json), and test discovery and isolation live in [vitest.config.ts](../vitest.config.ts). Despite its name, `test:unit` currently includes native card rendering, CLI subprocesses, and PostgreSQL integration tests. Keep DOM-free tests in the Node environment.

PostgreSQL suites require `TEST_DATABASE_URL` pointing to a migrated, disposable local database. The native development helper does not create a separate test database; select the test target explicitly. A run without it skips those suites and is not a complete repository validation. Keep model and provider responses mocked or fixture-backed in the committed suite; retain the credential and external-network guards. Production credentials and live model calls belong outside routine tests.

## GitHub Actions budget

Keep routine GitHub Actions usage limited to the [core test job](../.github/workflows/test.yml). Preserve its database, repository, and production-build checks. Additional browser jobs, schedules, shards, and platform matrices need a concrete validation gap rather than being incidental test maintenance.

Before proposing more automation, identify the gap and estimate run frequency, total runner time, and artifact storage. Count setup, builds, every matrix entry, and reruns; a shorter wall-clock duration does not necessarily mean lower cost. Avoid duplicate push/PR runs and repeated runs on unchanged code. Bound retries, job timeouts, and artifact retention, and cancel superseded runs where appropriate.

Run relevant production HTTP smoke, removal, packaging, and browser checks separately when changes or releases need them. Record the command, tested revision, environment, result, and remaining gaps when closing a check in the [MVP plan](MVP_PLAN.md#remaining-work). Prior results are [archived evidence](archive/VERIFICATION.md), not validation of the current checkout. Reduced automatic CI does not waive relevant release checks.

## Temporary tests

Temporary tests may break these guidelines when they help validate an implementation or reproduce an issue. Before finishing, review tests added for the investigation for inclusion in the long-term, committed suite. Apply the relaxed bar to useful isolated unit tests and the higher bar to heavyweight tests; remove tests that only served the investigation.

## Manual checks

`pnpm build` verifies the production build separately from `pnpm test`. HTTP smoke checks need that build running with `pnpm start`; development mode has different cache headers.

```sh
pnpm smoke 'https://chatgpt.com/share/<uuid>' 'https://claude.ai/share/<uuid>'
pnpm smoke:removal
```

Use a local app and matching local database configuration. `PASSAGE_URL` overrides the automatically selected app origin, for example `http://localhost:3100` for a server started with `PORT=3100`. Smoke checks compare the reader with the saved database snapshot, so an unrelated remote target is insufficient.

`smoke` checks preparation, rejected preview edits, idempotent publication, reader/metadata, the HTML card preview with bundled assets, and matching draft/public WebP images, including their content type and dimensions. It creates publications and consumes two preparation attempts per source. Uncached sources can incur model charges; saved previews are reused. `smoke:removal` creates and cleans up synthetic records to check disabled HTML, RSC, metadata, images, and draft previews in both formats. Provider-check behavior is covered separately by lifecycle tests. The creation page uses an HTML preview; check its font and artwork loading, text fit, template changes, and publish readiness in a browser alongside the WebP output when changing card templates or rendering.

Reports and WebP images go to ignored `work/smoke`, excluding transcript bodies, draft tokens, credentials, and model inputs. Live provider checks, browser interaction, packaging, and actual social unfurls establish different behavior; HTTP crawler-user-agent checks do not prove a platform displayed the card.

`pnpm fixtures:summary --regenerate` is the separate paid fixture command. It makes one model request for the authored fixture in [summary.json](../tests/fixtures/summary.json) and refuses missing flags or CI/test environments. Neither fixture generation nor live smoke runs in `pnpm test` or CI.

Card visuals and structured-summary changes use the project [visual-share-card-migration skill](../.agents/skills/visual-share-card-migration/SKILL.md) and [local comparison workflow](../contributing.md#visual-share-card-review). Run `pnpm cards:review start <run>` before editing, then `update <run>` for each tweak and `serve` to review `http://127.0.0.1:4399/<run>.html`. The before stays frozen; each successful full update refreshes the latest after and the same report, while a failure preserves the prior artifacts. `start --from <saved>` copies the exact frozen baseline; adding `--generate` creates a fresh baseline from its source chats. Updates keep the baseline's source chats and style pairings. Visual-only updates retain the latest after's summaries and provenance, or the before's on the first update; AI-task updates generate once per chat with `--generate`. Model calls remain separate from routine tests and CI; offline authored output demonstrates layout only.

The gallery uses eight representative cards, one per chat spread across five styles, with the production WebP and HTML renderers. Captures record exact inputs, summary provenance, code fingerprints, and rendered images. Complete the manual review on the final sample pages and assets delivered to the user: inspect saved HTML after fonts and artwork load alongside exported WebP, plus the font-ready live `SocialCardPreview` when affected. Synthetic stress cases and height assertions alone do not establish requested ellipsis or fit. Review concision, fidelity, and visual fit in those outputs; word counts and image hashes do not score semantic quality.

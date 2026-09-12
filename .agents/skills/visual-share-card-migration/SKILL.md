---
name: visual-share-card-migration
description: Capture and visually compare Passage share cards before and after changes to card visuals or the AI task that generates structured titles and highlights. Use whenever changing templates, rendering, card assets or fonts, summary prompts, models, schemas, limits, or input selection in this repo.
---

# Visual share card migration

Preserve a visible baseline before changing output. Run from the repository root. The tool uses the production WebP renderer and HTML preview, with eight representative cards: one per authored conversation, spread across the five styles. Reuse those pairings for each comparison. Read the card review section in [contributing.md](../../../contributing.md) for commands and [testing guidance](../../../docs/testing.md) for validation boundaries.

## Start, change, update

1. Inspect the requested change and the accepted [brand identity](../../../docs/brand-identity.md). Before editing output behavior, choose a unique review name and run `pnpm cards:review start <run>`. For summary quality work, add `--generate` to run the current AI task once per chat; label an offline authored baseline as layout evidence only. To reuse a saved baseline, use `start <run> --from <saved>`: this copies its frozen snapshot and assets exactly, without rerendering. Check each case's `summaryTaskHash` and `summaryModel` against the intended baseline. The snapshot's `taskHash` records capture-time code and can differ from the task that generated reused text. Adding `--generate` to `start --from` creates a fresh baseline from those source chats using the current task.
2. Make the requested change. For visuals, run `pnpm cards:review update <run>` to keep the baseline's exact source chats and style pairings. This reuses the latest after's summaries and provenance, or the before's on the first update, so visual tweaks retain prior wording improvements. For summary task changes, add `--generate` to rerun the real task on those chats, bypassing the application's summary cache. Live generation requires local OpenAI configuration, may incur charges, and is blocked in CI/tests. Report generation failures rather than substituting authored text for model evidence.
3. Run `pnpm cards:review serve` and open `http://127.0.0.1:4399/<run>.html`. Inspect the eight card pairs, exact summaries, source conversations, word counts, and task/model provenance. Complete visual review on the final generated sample pages and assets delivered to the user: inspect saved HTML previews after fonts and artwork load, alongside their exported WebP images. When the live preview is impacted, also inspect the actual `SocialCardPreview` in the app after its fonts and artwork load. Use native size where needed to judge fit. Synthetic stress cases and height assertions alone do not establish the requested ellipsis or fit.
4. Evaluate the requested improvement alongside fidelity and visual fit. Give the user the stable report URL and concrete findings, including regressions and uncertain cases. A smaller word count or changed image is a signal for review, not an automatic quality verdict. Run focused checks appropriate to the changed code and update the relevant existing documentation.

Reuse `update <run>` for each tweak. The before stays frozen; each successful full capture replaces the latest after and refreshes the same report. A failed update preserves the previous before, after, and report. Artifacts live under ignored `work/share-card-review/`. Lower-level `capture` and `compare` remain available for importing or comparing historical snapshots.

If edits predate a baseline, capture the intended earlier revision in an isolated checkout or clearly identify the available baseline; never present current output as a historical capture. If that revision lacks the tool, copy only its review tooling into the isolated checkout, leaving the earlier production task and renderer intact. Copy the complete captured directory back into the comparison checkout's `work/share-card-review/` without replacing an existing capture or rerendering its assets, then start the review with `--from <saved>`. Reused summaries retain their original provenance.

## What to review

- **Concision:** Does a short source produce only the useful takeaways? Remove repeated meaning, filler, and unnecessary context; favor a concrete title and one idea per highlight.
- **Fidelity:** Preserve uncertainty, tradeoffs, corrections, and the difference between proposed and completed work. Compare with source text, including the long fixture's retained first request and final answer.
- **Plain language:** Can the intended reader identify the topic, find distinct takeaways, understand the wording, and decide whether to open the conversation? Preserve the source language and explain technical terms only where useful to that audience.
- **Fit:** Check legibility, wrapping, type size, clipping, footer spacing, glyph coverage, and contrast in the representative sample. Exported WebP and browser layout can differ even though they share fitted JSX.

The plain-language questions are a project interpretation informed by [ISO 24495-1:2023](https://www.iso.org/standard/78907.html). The standard's name alone is not a prompt improvement or a compliance test. Apply reader-focused principles when requested; keep the current prompt unchanged until there is a baseline and a requested revision to evaluate.

For new real-world failure cases, add a sanitized source to `scripts/share-card-review/fixtures.ts`, retain its review intent, and capture a new corpus baseline. Saved reports include complete source text. Keep real conversation artifacts local unless sharing them is part of the user's request.

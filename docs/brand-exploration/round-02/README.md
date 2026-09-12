# Round 02 — five quieter directions

Status: proposed visual exploration for review, September 11, 2026. No identity is accepted and the product has not been rebranded. Names are working direction labels; availability was not checked this round.

Open [the comparison gallery](index.html), the [PNG overview](contact-sheet.png), or [editable SVG overview](contact-sheet.svg).

| Direction | Emphasis | Typography | Poster | Example share |
| --- | --- | --- | --- | --- |
| [Folio](folio.md) | Considered presentation; retained sculptural book, revised folded-page mark | Instrument Sans | [PNG](folio-poster.png) / [SVG](folio-poster.svg) | [PNG](folio-share-card.png) |
| [Commonplace](commonplace.md) | Shared learning; retained plant and book, calmer surroundings | Hanken Grotesk | [PNG](commonplace-poster.png) / [SVG](commonplace-poster.svg) | [PNG](commonplace-share-card.png) |
| [Frame](frame.md) | Quiet gallery; the shared artifact leads | Manrope | [PNG](frame-poster.png) / [SVG](frame-poster.svg) | [PNG](frame-share-card.png) |
| [Kindred](kindred.md) | A useful idea passed from one person to another | Onest | [PNG](kindred-poster.png) / [SVG](kindred-poster.svg) | [PNG](kindred-share-card.png) |
| [Waymark](waymark.md) | Small public pieces of learning form a growing trail | Plus Jakarta Sans | [PNG](waymark-poster.png) / [SVG](waymark-poster.svg) | [PNG](waymark-share-card.png) |

## Feedback applied

Trace and Relay are removed from the active review. They remain in round 01 as exploration history. Folio and Commonplace retain the conceptual imagery the user liked, replace every serif role with sans-serif type, reduce the product wordmark, and use the simpler description: “Turn your AI chats into links you’ll be proud to share.” The fifth direction, Waymark, explicitly explores breadcrumbs and a widening public trail. This describes the founder’s learning-in-public motivation, not an audience-growth guarantee or new discovery/profile feature.

The gallery is a lightweight desktop comparison aid. A brief visual check covers readable specimens, loaded artwork and fonts, and the direction/compare controls. It is not a production website or a responsive/accessibility test exercise.

## Rebuild

Run from the repository root:

```bash
pnpm exec tsx docs/brand-exploration/round-02/build.ts
```

This command was run successfully. It uses the existing `tsx`, `@resvg/resvg-js`, and Satori’s `@shuding/opentype.js` dependency. No dependencies were added. Fonts and imagery are local. [build.ts](build.ts) reads [render-data.json](render-data.json) as a rendering projection, validates its main copy and palette against the five Markdown specs, and creates 1600×1300 editable SVG/PNG posters, 1200×630 SVG/PNG share cards, native SVG marks, and a contact sheet. The SVGs embed imagery and font data. PNGs use glyph outlines from the same font files for reliable rendering. This is not a Markdown parser.

Serve the review locally:

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/brand-exploration/round-02
```

## Asset sources

- [Typography reasoning](typography-notes.md), [font versions, sources, and hashes](assets/fonts/origins.json), and font licenses in `assets/fonts/`.
- [Frame imagegen prompt and provenance](assets/frame-provenance.md): one image, generated and inspected.
- [Kindred and Waymark exact Midjourney prompts, effective settings, result links, and downloads](assets/midjourney-provenance.md): two standard four-image jobs, completed; one candidate selected from each. No reruns, variations, HD, or setting changes.
- Folio and Commonplace images are unchanged copies from [round 01](../round-01/README.md), with their original prompts and provenance there.
- Marks are new native geometry in [assets/marks](assets/marks); they are proposals rather than final logo exports.

The Impeccable typography playbook and installed font catalog informed selection. Its optional engine could not start because the engine was not installed and its cache was not writable in the sandbox; no automated detector pass is claimed. The user’s desktop exploration scope takes precedence over production hardening.

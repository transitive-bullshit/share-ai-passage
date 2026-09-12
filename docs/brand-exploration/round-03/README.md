# Brand exploration — round 03

**Status:** Four proposed refinements for a quick desktop review. No complete identity is accepted. Folio’s font, palette, and conceptual book world are retained from positive user feedback; the previous Folio and Waymark icons are replaced. Commonplace, Frame, and Kindred are dropped from the active set. Earlier rounds remain history.

## Four directions

- **[Folio / Pages](folio-pages.md):** refine the liked system with a solid page-turn emblem.
- **[Folio / Ribbon](folio-ribbon.md):** keep the same name, typography, and palette; let the wordmark lead and use a ribbon as a secondary signature.
- **[Waymark / Open trail](waymark.md):** retain the liked trail concept and existing name for comparison, replacing growing squares with a compact cairn of three low rounded stones.
- **[Along / Breadcrumbs](along.md):** test a warmer name for the trail family using Folio’s liked Instrument Sans and palette, with a gently curving open route and detached next step.

Both Folio options keep “Your thinking, worth sharing.” Both trail options keep “Share your thinking. Leave a trail.” Every direction uses “Turn your AI chats into links you’ll be proud to share.” This preserves direct copy while names, marks, and composition are compared.

## Review

The [review gallery](index.html) has four entries and three views: **Direction**, **Compare**, and **Marks**. **Compare** is the intended default so all four options are visible together. Direction shows a complete composition; Marks focuses the decision on the new logos and lockups. Folio / Ribbon’s primary logo is the wordmark; its ribbon is deliberately secondary.

Review the feel of each mark, the need for a separate icon, the visibility of the shared work, and whether Along is a better expression of the trail idea than Waymark. Names remain working choices; no availability research was performed in this round. No new user interview is needed to continue these refinements.

This is the requested desktop-only exploration surface. Mobile implementation, accessibility audits, and full production tests are outside this quick review. It does not publish a site, roll the identity into the application, or establish a canonical brand.

## Proposed artifact set

| Direction | 1600 × 1300 poster | 1200 × 630 share card | 1600 × 900 mark study | Native mark |
| --- | --- | --- | --- | --- |
| [Folio / Pages](folio-pages.md) | [SVG](folio-pages-poster.svg) / [PNG](folio-pages-poster.png) | [SVG](folio-pages-share-card.svg) / [PNG](folio-pages-share-card.png) | [SVG](folio-pages-mark-study.svg) / [PNG](folio-pages-mark-study.png) | [SVG](assets/marks/folio-pages-mark.svg) |
| [Folio / Ribbon](folio-ribbon.md) | [SVG](folio-ribbon-poster.svg) / [PNG](folio-ribbon-poster.png) | [SVG](folio-ribbon-share-card.svg) / [PNG](folio-ribbon-share-card.png) | [SVG](folio-ribbon-mark-study.svg) / [PNG](folio-ribbon-mark-study.png) | [SVG](assets/marks/folio-ribbon-mark.svg) |
| [Waymark / Open trail](waymark.md) | [SVG](waymark-poster.svg) / [PNG](waymark-poster.png) | [SVG](waymark-share-card.svg) / [PNG](waymark-share-card.png) | [SVG](waymark-mark-study.svg) / [PNG](waymark-mark-study.png) | [SVG](assets/marks/waymark-mark.svg) |
| [Along / Breadcrumbs](along.md) | [SVG](along-poster.svg) / [PNG](along-poster.png) | [SVG](along-share-card.svg) / [PNG](along-share-card.png) | [SVG](along-mark-study.svg) / [PNG](along-mark-study.png) | [SVG](assets/marks/along-mark.svg) |

Cards use the same invented “A calmer way to build with AI” example. They are design comparisons, not product screenshots. The native marks are editable SVG geometry; [mark notes](assets/marks/notes.md) record their construction intent. Final favicon files, full wordmark export sets, and canonical brand assets follow acceptance.

## Reused assets and provenance

No new images or fonts are downloaded or generated for this round. Two existing images and two existing font families are reused:

- [Folio hero](assets/folio-hero.png): sculptural pages and ribbon from [round 01 Midjourney provenance](../round-01/assets/midjourney-provenance.md).
- [Waymark hero](assets/waymark-hero.png): paper/pebble trail from [round 02 Midjourney provenance](../round-02/assets/midjourney-provenance.md).
- Instrument Sans normal 400/500 for both Folio variants and Along.
- Plus Jakarta Sans normal 400/500 for Waymark.

The local [font directory](assets/fonts) includes these four WOFF files and their two licenses. [round-02-source.json](assets/fonts/round-02-source.json) preserves the full earlier acquisition manifest, including families not used or copied into round 03. Only Instrument Sans and Plus Jakarta Sans are round 03 rendering inputs.

## Build and verification

From `/Users/tfischer/dev/modules/ai-chat-proxy`, the documented command is:

```sh
pnpm exec tsx docs/brand-exploration/round-03/build.ts
```

**Build verified:** the command above ran successfully. All 12 PNG exports have the stated dimensions. The four posters and mark studies were visually inspected; at desktop width, the comparison, Marks, and full-direction controls work, and all mark previews load at their stated 32 px and 16 px display sizes. This was a brief review check, not a production audit.

[Four-direction overview](contact-sheet.png) · [Marks overview](marks-overview.png)

The [build source](build.ts) reads [render-data.json](render-data.json), an explicit projection of the four Markdown specs. It checks names, territories, headlines, mantras, the shared descriptor, sample copy, CTA, and palette values against those documents before export. The script does not turn the full Markdown directly into a layout.

The project already supplies Node.js, pnpm, tsx, Resvg, and Satori’s transitive OpenType dependency. Local WOFF inputs provide deterministic measurement and outlines. Editable SVGs retain vector geometry and text with embedded font/image inputs; PNGs are rendered from outlines derived from the same fonts. The build requires no new generation request or runtime font download.

The immediate review should confirm the four fixed compositions, consistent copy, readable desktop hierarchy, and the new mark shapes. Claims of broader production validation are not part of this exercise. Continue with concrete element-level feedback; liking one mark, name, or typeface does not accept a whole direction.

# Brand exploration — round 06

**Status:** Original Folio and original Passage remain as two unchanged references. The user requested two hybrids combining Passage’s colors, typography, and general visual direction with Folio’s name and copy. All four remain proposals; no canonical identity or product rollout is selected.

## Four comparison options

| Option | Name and copy | Visual system | Mark and arrangement |
| --- | --- | --- | --- |
| [Original Folio](folio.md) | Folio | Instrument Sans, warm paper, sculptural book, Ribbon accent | Retained page-turn mark and original composition |
| [Original Passage](passage.md) | Passage and its existing homepage copy | Inter, white/charcoal/gray, painted lake | Existing outlined pages and centered composition |
| [Folio / Landscape](folio-landscape.md) | Folio throughout | Passage’s Inter and neutral landscape world | Outlined pages in Charcoal; closest centered Passage composition |
| [Folio / Open page](folio-open-page.md) | Folio throughout | Passage’s Inter and neutral landscape world | Folio’s page-turn silhouette in Charcoal; left introduction and larger white share within a substantial landscape frame |

The hybrids use **“Your thinking, worth sharing.”**, **“Turn your AI chats into links you’ll be proud to share.”**, **“Give good work a good form.”**, and **“Create a share.”** Their product labels say Folio or use ordinary conversation/share language. Original Passage preserves its own headline, descriptor, mantra, and “Create a passage” creation label.

Both hybrids use Inter 600 for the wordmark, 500 for headings/actions, and 400 for body/highlights. Both use monochrome Charcoal marks and the white/charcoal/gray palette; neither carries a red ribbon accent. Original Folio retains its warm palette and accent-colored mark.

## Review and share content

The [desktop gallery](index.html) provides Compare all, Direction, and Share cards views. The [contact sheet](contact-sheet.png) and [share-card overview](sharecards-overview.png) are 2 × 2 comparison outputs. The decisions are whether Folio’s words work better in Passage’s visual world, and whether the outlined-page or page-turn mark and centered or asymmetric arrangement best support that combination.

All share specimens use the same invented title **A calmer way to build with AI** and three highlights. Passage and the hybrids use its existing unthemed white/Inter card language; the hybrid cards carry Folio labels and their designated marks. The two hybrid cards have identical layout, typography, and labels, differing only in the mark. These are native comparison adaptations, **not screenshots**. The live Passage homepage’s original “Make room for the unexpected” example remains unchanged.

This is the requested quick desktop review. It does not modify application code, publish/deploy a site, implement mobile layouts, run accessibility audits, or perform a full production test cycle. Per the project’s current AGENTS.md, `docs/brand-exploration` contains proposals, not current project requirements.

## Proposed assets

| Option | 1600 × 1300 poster | 1200 × 630 share specimen | Native mark |
| --- | --- | --- | --- |
| [Folio](folio.md) | [SVG](folio-poster.svg) / [PNG](folio-poster.png) | [SVG](folio-share-card.svg) / [PNG](folio-share-card.png) | [SVG](assets/marks/folio-mark.svg) |
| [Passage](passage.md) | [SVG](passage-poster.svg) / [PNG](passage-poster.png) | [SVG](passage-share-card.svg) / [PNG](passage-share-card.png) | [SVG](assets/marks/passage-mark.svg) |
| [Folio / Landscape](folio-landscape.md) | [SVG](folio-landscape-poster.svg) / [PNG](folio-landscape-poster.png) | [SVG](folio-landscape-share-card.svg) / [PNG](folio-landscape-share-card.png) | [SVG](assets/marks/folio-landscape-mark.svg) |
| [Folio / Open page](folio-open-page.md) | [SVG](folio-open-page-poster.svg) / [PNG](folio-open-page-poster.png) | [SVG](folio-open-page-share-card.svg) / [PNG](folio-open-page-share-card.png) | [SVG](assets/marks/folio-open-page-mark.svg) |

The mark files make the distinction explicit: original Folio and Open page share the retained page-turn geometry; original Passage and Landscape share the existing outlined-page geometry. Color follows each option’s visual system. No additional mark family is invented in this round.

## Reused inputs and provenance

No new image generation or font download is needed. See [asset provenance](assets/provenance.md) for the copied inputs and retained source geometry. Local inputs are copied from the earlier comparison and existing product assets:

- [Folio book](assets/folio-hero.png), with [original Midjourney provenance](../round-01/assets/midjourney-provenance.md), for original Folio only.
- [Passage landscape](assets/passage-landscape.png), copied from [the existing public image](../../../public/images/passage-landscape.png), for Passage and both hybrids. It remains the same 1672 × 941 painted-lake image. Historical [verification notes](../../archive/VERIFICATION.md) describe its origin; an exact original prompt was not found there.
- Instrument Sans normal 400/500 and [license](assets/fonts/instrument-sans-LICENSE.txt) for original Folio.
- Inter normal 400/500/600 and [license](assets/fonts/inter-LICENSE.txt) for Passage and both hybrids.

The existing source geometry and visual rules for Passage are linked in [passage.md](passage.md). Original references remain unchanged; the hybrid specifications identify their combinations and composition choices.

## Build and verification

From `/Users/tfischer/dev/modules/ai-chat-proxy`:

```sh
pnpm exec tsx docs/brand-exploration/round-06/build.ts
```

**Build status:** complete. The renderer passed its copy/palette checks and measured 44 bounded text runs. All eight individual PNG dimensions and both 2 × 2 overviews were verified: posters 1600 × 1300, cards 1200 × 630, contact sheet 2400 × 1980, and card overview 2400 × 1380. The original Folio and Passage share-card PNGs are byte-for-byte unchanged from round 05. All four posters/cards were visually inspected; both new direction controls and the Share cards/Compare all views were exercised on desktop, with all four card assets loading.

The [build](build.ts) reads [render-data.json](render-data.json), an explicit projection checked against the four Markdown specs. Original Passage uses its own descriptor and creation label; Folio and both hybrids use Folio’s shared copy. `markStyle` records `outline` or `page-turn`, keeping mark geometry independent of the Folio product name.

The project supplies Node.js, pnpm, tsx, Resvg, and the direct `@shuding/opentype.js` dependency. Native SVG compositions use local font/image inputs; PNG rendering uses glyph outlines derived from the same WOFF files. Regeneration submits no image jobs and makes no runtime font requests.

The completed review checked original references, Folio labels in both hybrids, Inter roles, neutral marks, recognizable landscape framing, consistent content, and readable desktop hierarchy. The user’s feedback will select or refine the next direction; no final identity, AGENTS.md brand pointer, or canonical export set is created here.

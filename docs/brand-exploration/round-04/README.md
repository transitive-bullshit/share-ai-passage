# Brand exploration — round 04

**Status:** The first Folio / Pages direction is the retained base; three significant applications of that identity are proposed for comparison. The user is still exploring. No canonical identity, production rollout, or complete final export set is selected.

## The base and three departures

- **[Folio / Baseline](folio.md):** preserve the liked font, palette, sculptural book, and page-turn mark. Change the icon to Ribbon #B85540, as requested.
- **[Folio / Index](index.md):** remove the decorative hero. The useful content becomes the visual, through a large typeset share and editorial margins.
- **[Folio / Cut paper](cut-paper.md):** reinterpret the book as a tactile collage, with a more personal and asymmetric presentation around one readable share.
- **[Folio / After hours](after-hours.md):** place a bright cream share in a warm dark reading atmosphere, using physical light and walnut tones rather than a technical dark interface.

These are four applications of **Folio**, not four new brands. The name, Instrument Sans, and native page-turn geometry remain consistent. The three departures change composition, medium, atmosphere, and the share-card treatment substantially; they are not minor icon or color variants. Product branding stays subordinate to the shared work.

Every direction retains the literal descriptor: “Turn your AI chats into links you’ll be proud to share.” Waymark, Along, and the separate Folio / Ribbon route are no longer in the active review. Their files remain history.

## Review surface

The [desktop gallery](index.html) provides **Compare all**, **Direction**, and **Share cards** views. Compare places the four complete directions together; Direction shows an individual composition; Share cards isolates the artifact a reader would encounter. The [contact sheet](contact-sheet.png) and [share-card overview](sharecards-overview.png) are included as 2 × 2 PNG comparisons.

The review focuses on whether the three departures feel meaningfully different and which setting best serves the shared content. This is a quick desktop exploration; mobile implementation, accessibility audits, and full production testing are outside the requested scope. It does not publish or deploy a site or apply the brand to application code.

## Proposed artifacts

| Direction | 1600 × 1300 poster | 1200 × 630 share card | Retained native mark |
| --- | --- | --- | --- |
| [Folio / Baseline](folio.md) | [SVG](folio-poster.svg) / [PNG](folio-poster.png) | [SVG](folio-share-card.svg) / [PNG](folio-share-card.png) | [SVG](assets/marks/folio-mark.svg) |
| [Folio / Index](index.md) | [SVG](index-poster.svg) / [PNG](index-poster.png) | [SVG](index-share-card.svg) / [PNG](index-share-card.png) | [SVG](assets/marks/index-mark.svg) |
| [Folio / Cut paper](cut-paper.md) | [SVG](cut-paper-poster.svg) / [PNG](cut-paper-poster.png) | [SVG](cut-paper-share-card.svg) / [PNG](cut-paper-share-card.png) | [SVG](assets/marks/cut-paper-mark.svg) |
| [Folio / After hours](after-hours.md) | [SVG](after-hours-poster.svg) / [PNG](after-hours-poster.png) | [SVG](after-hours-share-card.svg) / [PNG](after-hours-share-card.png) | [SVG](assets/marks/after-hours-mark.svg) |

All four native mark files contain the retained page-turn geometry. Baseline, Index, and Cut paper use #B85540; After hours uses the lighter Copper #D28C73 for its warm dark setting. There are no four new mark studies in this round. Final favicons and canonical logo exports follow the user’s eventual complete selection.

The share cards use the same invented “A calmer way to build with AI” example and three highlights. These are design specimens, not live conversations, testimonials, screenshots, or new product features.

## Imagery and font provenance

- **Baseline:** [existing Folio hero](assets/folio-hero.png), reused from [round 01 Midjourney](../round-01/assets/midjourney-provenance.md).
- **Index:** no hero image; native typography and the share itself provide the visual content.
- **Cut paper:** [new collage hero](assets/cut-paper-hero.png), created with one imagegen edit using the original Folio image as the reference. See [exact prompt and provenance](assets/cut-paper-provenance.md).
- **After hours:** [new evening hero](assets/after-hours-hero.png), selected from one completed standard four-image Midjourney batch. Candidate 3 was visually inspected and saved as a 1344 × 896 PNG. The [After hours provenance](assets/after-hours-provenance.md) records the exact submitted prompt, effective parameters, result link, selected image, download source, and selection notes. No reruns or variations were submitted.

Image generation supplies visual material only. Logos, words, share layouts, and poster composition are native code/vector work. No generated product screen is presented as proof of functionality.

All four directions use the existing Instrument Sans normal 400/500 WOFF files in [assets/fonts](assets/fonts), with the included [license](assets/fonts/instrument-sans-LICENSE.txt). The original version, download URLs, and hashes are in the [round 02 font manifest](../round-02/assets/fonts/origins.json). No new font download or project dependency change is needed.

## Build and verification

From `/Users/tfischer/dev/modules/ai-chat-proxy`:

```sh
pnpm exec tsx docs/brand-exploration/round-04/build.ts
```

**Build status:** complete. The builder passed the copy/palette checks and measured 44 bounded text runs. All eight individual PNGs and both overview PNGs have verified dimensions. The four posters and share cards were visually inspected, the Cut paper caption overlap was corrected, and the desktop gallery’s Compare all, Direction, and Share cards controls were exercised with all visible assets loading.

The [build source](build.ts) reads the explicit [render projection](render-data.json) and checks required copy and palette values against the four candidate Markdown files. It does not derive the full design by parsing Markdown. Layout, typography application, and retained mark geometry remain programmatic; raster artwork is embedded inside the SVG compositions.

The project already supplies Node.js, pnpm, tsx, Resvg, and Satori’s transitive OpenType dependency. Editable SVGs retain native geometry and text with embedded local WOFF/image inputs. PNGs use glyph outlines derived from the same fonts for reliable rendering. Regenerating the assembled artifacts does not submit further image jobs.

The completed desktop review checked composition, hierarchy, readable shared content, copy, crops, and the baseline icon’s requested accent color. The user’s next feedback decides which elements to retain; this round does not turn a prior partial preference into acceptance of the whole brand.

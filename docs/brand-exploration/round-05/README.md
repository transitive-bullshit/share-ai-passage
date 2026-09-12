# Brand exploration — round 05

**Status:** Two proposed identities for comparison: retained Folio and the current Passage homepage captured as an identity. The user rejected Index, Cut paper, and After hours and returned to original Folio. They requested the existing Passage name and visual style as the second option. No final brand is accepted.

## Two directions

- **[Folio](folio.md):** the retained Instrument Sans, warm Paper/Ink/Ribbon palette, sculptural book image, and accent-colored page-turn mark. Headline: “Your thinking, worth sharing.” Descriptor: “Turn your AI chats into links you’ll be proud to share.”
- **[Passage](passage.md):** the existing white/charcoal homepage, Inter typography, overlapping outlined pages, and painted landscape. Headline: “Good conversations. Beautifully shared.” Descriptor: “Turn a public AI chat into a thoughtful preview, with the highlights up front and the full conversation behind it.”

Passage is an extraction of the current product’s presentation, not a new visual reinterpretation. Its exact source files, type values, tokens, geometry, copy, and card behavior are documented in [passage.md](passage.md). Existing source language remains distinct from Folio’s proposed copy.

## Review and comparison content

The [desktop gallery](index.html) provides Compare all, Direction, and Share cards views. [The contact sheet](contact-sheet.png) compares the two complete identities, and [the share-card overview](sharecards-overview.png) isolates the shared artifacts. This remains the requested quick desktop review, without product rollout, deployment, mobile implementation, accessibility audits, or a broad production test cycle.

Both comparison cards use the invented title **A calmer way to build with AI** and the same three highlights. Passage’s card applies that content in its existing unthemed white/Inter rendering language. It is an adapted native comparison specimen, **not a screenshot**. The live homepage’s actual example title is **Make room for the unexpected**. No new Passage color system, typeface, mark, or image is introduced to make the comparison.

The live homepage example calls `/api/example-card` without a template parameter and therefore uses the original white card, not Margin notes. The five curated share-card styles are product options; they do not replace the homepage’s Inter-based identity in this extraction.

## Proposed artifacts

| Identity | 1600 × 1300 poster | 1200 × 630 comparison card | Native mark | Existing image |
| --- | --- | --- | --- | --- |
| [Folio](folio.md) | [SVG](folio-poster.svg) / [PNG](folio-poster.png) | [SVG](folio-share-card.svg) / [PNG](folio-share-card.png) | [SVG](assets/marks/folio-mark.svg) | [Book](assets/folio-hero.png) |
| [Passage](passage.md) | [SVG](passage-poster.svg) / [PNG](passage-poster.png) | [SVG](passage-share-card.svg) / [PNG](passage-share-card.png) | [SVG](assets/marks/passage-mark.svg) | [Landscape](assets/passage-landscape.png) |

These are proposed review artifacts. All four individual output dimensions and the two overview dimensions have been verified. Final favicon/wordmark sets and canonical identity documents remain outside this comparison until the user makes a complete selection.

## Existing assets and provenance

No new image generation was used. See the [asset and font provenance record](assets/provenance.md) for the exact reused inputs. Folio reuses its [original Midjourney book asset](../round-01/assets/midjourney-provenance.md). Passage reuses [public/images/passage-landscape.png](../../../public/images/passage-landscape.png), a 1672 × 941 PNG that is currently displayed on the homepage. Historical [verification notes](../../archive/VERIFICATION.md) describe it as generated landscape artwork but do not provide an exact generation prompt.

Folio uses the local Instrument Sans normal 400/500 inputs and [license](assets/fonts/instrument-sans-LICENSE.txt). Passage uses Inter normal 400/500/600 and its [license](assets/fonts/inter-LICENSE.txt), matching the current application imports. The copied [font assets](assets/fonts) are local rendering inputs; no dependency changes or remote font requests are part of the build.

The Passage mark copies [BrandMark](../../../components/brand-mark.tsx): two outlined rounded rectangles in a 32 × 32 viewBox, stroke 1.8. The Folio mark retains its selected page-turn geometry in Ribbon #B85540. Neither application files nor existing product assets are edited by this exploration.

## Build and verification

From `/Users/tfischer/dev/modules/ai-chat-proxy`:

```sh
pnpm exec tsx docs/brand-exploration/round-05/build.ts
```

**Build status:** complete. The renderer passed copy/palette checks and measured 26 bounded text runs. The two 1600 × 1300 posters, two 1200 × 630 cards, 2400 × 980 contact sheet, and 2400 × 690 card overview have verified PNG dimensions. Both identity posters and cards were visually inspected. The desktop gallery’s Compare all, Direction, and Share cards controls were exercised and visible assets loaded.

The [build source](build.ts) reads [render-data.json](render-data.json), an explicit projection of the two Markdown identity specs. Folio uses the shared descriptor; Passage uses its own source-derived descriptor. The projection’s copy and palette values must match the corresponding document. The build does not derive the entire layout by parsing Markdown.

The project supplies Node.js, pnpm, tsx, Resvg, and Satori’s transitive OpenType dependency. Native geometry and editable text use local WOFF/image inputs; PNGs are produced from outlines derived from the same fonts. The Passage card and poster are native compositions informed by the audited current source, with their comparative content adaptation disclosed above.

The completed desktop review checked Passage against the live homepage and source, retained Folio’s chosen elements, and checked comparison content, readable hierarchy, imagery, marks, and output files. No claim of broader product validation is made by this design comparison. Continue from the user’s concrete preferences between these two identities; rejected rounds remain history.

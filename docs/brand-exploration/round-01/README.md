# Brand exploration — round 01

Status: four proposed identities for comparison. No direction or name is accepted. The user asked to see concrete visual examples before settling the interview choices. This round uses those open questions as dimensions to explore.

Open [the comparison gallery](index.html) or [the four-direction overview](contact-sheet.png). The gallery lets you inspect each direction and compare all four. Click any poster to see its full resolution.

## The four directions

| Working label | Emphasis | Main one-liner | Main tradeoff |
| --- | --- | --- | --- |
| [Folio](folio.md) | Editorial authorship; pride in sharing considered work | Your thinking, worth sharing. | Can read as a writing or portfolio product |
| [Trace](trace.md) | Open thinking; a visible process behind the ideas | Show how you got there. | Technical expression can feel cooler and more specialized |
| [Relay](relay.md) | Ideas in circulation; visible energy and personality | Give your ideas a way out. | A bold tool identity can compete with the sharer's content |
| [Commonplace](commonplace.md) | Generous learning in public; a useful trail for others | Leave something worth finding. | Can feel closer to a notebook than a precise sharing utility |

The creative recommendation is to start by comparing Folio's care and restraint with Trace's clear belief about visible thinking. Relay and Commonplace test the expressive and human ends of the range. This is an invitation to combine specific elements, not a final selection.

These names are working labels for the visual worlds. A bounded check found adjacent existing uses for all four; Commonplace has a close sharing-product overlap, and Relay is crowded around AI products. See [naming notes](naming-notes.md). No domain is represented as available, reserved, or owned.

## Deliverables

| Direction | Complete identity poster | Illustrative share card | Native mark | Hero |
| --- | --- | --- | --- | --- |
| Folio | [SVG](folio-poster.svg) / [PNG](folio-poster.png) | [SVG](folio-share-card.svg) / [PNG](folio-share-card.png) | [SVG](assets/marks/folio-mark.svg) | [PNG](assets/folio-hero.png) |
| Trace | [SVG](trace-poster.svg) / [PNG](trace-poster.png) | [SVG](trace-share-card.svg) / [PNG](trace-share-card.png) | [SVG](assets/marks/trace-mark.svg) | [PNG](assets/trace-hero.png) |
| Relay | [SVG](relay-poster.svg) / [PNG](relay-poster.png) | [SVG](relay-share-card.svg) / [PNG](relay-share-card.png) | [SVG](assets/marks/relay-mark.svg) | [PNG](assets/relay-hero.png) |
| Commonplace | [SVG](commonplace-poster.svg) / [PNG](commonplace-poster.png) | [SVG](commonplace-share-card.svg) / [PNG](commonplace-share-card.png) | [SVG](assets/marks/commonplace-mark.svg) | [PNG](assets/commonplace-hero.png) |

Posters are 1600 × 2040. Share cards are exactly 1200 × 630. The [contact sheet](contact-sheet.png) is 1648 × 2140; its [SVG](contact-sheet.svg) is also available.

All cards use the same invented example and label it “ILLUSTRATIVE CONVERSATION.” They are concepts for comparing identities, not product screenshots. Current functionality remains public conversation input, generated title/highlights, curated style selection, and a saved conversation with its original link. Custom identity controls, accounts, analytics, and personal domains are not depicted as shipped features.

## Image generation and provenance

Midjourney supplied Folio and Relay. Exactly two normal four-image jobs were submitted, both completed, and candidate A from each was selected and downloaded. No uploads, reruns, variations, or HD jobs. Existing account Personalization was preserved. Exact prompts, effective visible parameters, result links, selection rationale, and verified local paths are in [Midjourney provenance](assets/midjourney-provenance.md).

The built-in imagegen tool supplied Trace and Commonplace, one call per distinct asset. Both original 1536 × 1024 PNGs were copied unedited into the project. Exact prompts, source paths, and observations are in [imagegen provenance](assets/provenance.md).

The native SVG marks, typography, copy hierarchy, poster layout, and share-card layout were authored with code. Generated imagery is embedded inside those compositions. It does not supply logos or typeset copy.

## Rebuild

From the repository root:

```sh
pnpm exec tsx docs/brand-exploration/round-01/build.ts
```

This command has been run successfully. It regenerates the eight SVG/PNG poster and card pairs, the four native SVG marks, the contact sheet, and [build-report.json](build-report.json). It makes no network or paid generation requests.

Runtime and dependencies are already in the project: Node.js, pnpm, tsx, @resvg/resvg-js, the three @fontsource families, and the direct @shuding/opentype.js dependency. The latter parses fonts and supplies font measurement/outlines. Use the repository's pnpm lockfile. No package or lockfile change was needed.

The source is [build.ts](build.ts), with an explicit projection in [render-data.json](render-data.json). It does not parse Markdown to produce the design. Before export it checks the projection's names, territories, main lines, mantras, character, descriptor, sample text, CTA, and palette values against the four Markdown specs. The projection's line breaks and file paths drive layout; each spec is the source of proposed brand decisions.

| Rendering input | Source |
| --- | --- |
| Name, headline, descriptor, mantra, character, palette, sample copy | render-data.json, validated against each candidate Markdown |
| Layout, native geometry, spacing, typography application | build.ts |
| Hero raster images | assets/{direction}-hero.png |
| Font data | Installed Fontsource packages, copied into assets/fonts with licenses |
| Explanations and directional rationale | Individual candidate Markdown documents |

Each poster SVG keeps editable text and vector geometry and embeds its WOFF fonts and image dependencies as data URLs. The PNG rendering uses glyph outlines derived from those same WOFF inputs, because the server SVG rasterizer does not consume the browser's embedded CSS font faces. This avoids reliance on whichever fonts happen to be installed on the machine.

The licensed font families are Newsreader, Inter, and DM Sans. Their included Fontsource licenses are copied beside the WOFF files in [assets/fonts](assets/fonts). The proposed Trace poster uses Inter with technical label spacing; it has no bundled monospace dependency.

For a local browser preview from the repository root:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/brand-exploration/round-01
```

Then open [the local gallery](http://127.0.0.1:8766/). This serves only the exploration directory on the local machine. The HTML can also be opened directly with its neighboring files present.

## Verification and next decisions

The build validates projected copy and colors, image embedding, and measured text widths. PNG formats/dimensions were checked, and the actual outputs were visually inspected for crop, spacing, clipping, and legibility. Browser verification includes the gallery and embedded SVG font rendering. The build source passes the project's formatter and lint rules. These are design artifacts; no application tests or provider/model calls were needed to verify them.

Feedback should name specific elements to keep or discard: emphasis, feeling, name, mark, imagery, typography, palette, and copy. A preference for one part does not accept its entire direction. Once a complete identity is accepted or final selection is delegated, create the canonical identity, final favicon and logo export set, and AGENTS.md pointer. Product rollout remains separate.

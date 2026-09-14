# Brand exploration — round 07

**Status:** Accepted basis for canonical rollout. The user chose **Passage**, the **Open passage** split-P mark, and **Your AI chats, worth sharing**, and authorized a persistent identity guide and one-pager followed by site and project README updates. The [canonical brand guide](../../brand-identity.md) is being prepared; this round records the focused review behind it.

The [Passage specification](passage.md) records the exact headline **Your AI chats, worth sharing**, descriptor **Turn your AI chats into links you’ll be proud to share**, and creation label **Create a passage**. Neither headline nor descriptor has a trailing period. The announcement is removed. Inter 400/500/600, White #FFFFFF, Charcoal #171717, Muted #737373, the painted landscape, and **Good conversations deserve to travel.** remain.

The example is labeled **Example passage**, with **A calmer way to build with AI**, the same three highlights, and **Read the passage**. The headline states the promise directly; controls and supporting language stay clear and respectful. The [glossary](../../CONTEXT.md) now requires the lowercase customer noun **passage**, while retaining **Publication** internally.

## Preview and assets

The [desktop preview](index.html) contains only Passage, with **Brand preview**, **Example passage**, and **Icon studies** views. The main poster and passage use **Open passage**, the accepted solid split P. Excerpt and Paragraph are recorded alternatives considered for the icon within this same identity.

| Asset | Files | Dimensions/status |
| --- | --- | --- |
| Passage poster | [SVG](passage-poster.svg), [PNG](passage-poster.png) | 1600 × 1300; new copy and accepted mark |
| Example passage | [SVG](passage-share-card.svg), [PNG](passage-share-card.png) | 1200 × 630; illustrative conversation |
| Three icon studies | [SVG](icon-study.svg), [PNG](icon-study.png) | 1600 × 1080; includes 16/24/32 px and reverse views |
| Active icon | [SVG](assets/marks/passage-mark.svg) | Native 32 × 32; Open passage accepted |
| Icon masters and rationale | [Notes](assets/marks/README.md) | Three native currentColor SVGs |
| Painted landscape | [PNG](assets/passage-landscape.png) | Reused 1672 × 941 image |
| Inter inputs | [400](assets/fonts/inter-latin-400-normal.woff), [500](assets/fonts/inter-latin-500-normal.woff), [600](assets/fonts/inter-latin-600-normal.woff), [license](assets/fonts/inter-LICENSE.txt) | Local WOFF files |
| Source and projection | [build.ts](build.ts), [render-data.json](render-data.json) | Reproducible composition |

See [provenance](assets/provenance.md) for reused imagery and fonts. Earlier rounds remain historical records; the active review has no Folio directions.

## Rebuild and verification

From `/Users/tfischer/dev/modules/ai-chat-proxy`:

```sh
pnpm exec tsx docs/brand-exploration/round-07/build.ts
```

The main build also runs the isolated [icon-study renderer](assets/marks/build-studies.ts), exports the selected icon as `passage-mark.svg`, and writes both poster and passage SVG/PNG files. It reads the JSON projection and checks its copy, palette, typography label, image path, and selected mark against [passage.md](passage.md). It does not parse the Markdown into a design. Dependencies are the existing pnpm/tsx runtime, Resvg, the direct `@shuding/opentype.js` parser, and the local font files; none were added.

**Complete:** the command ran successfully, with nine bounded text measurements and no overflow assertion. All three PNG dimensions were verified. The poster, passage, and icon overview were visually inspected; the three desktop views were exercised and all SVG assets loaded at their expected sizes. The preview asset URLs include the round number to avoid stale images when the local server switches rounds. Formatting and focused renderer lint passed.

SVG output preserves editable text and native mark geometry, with font data and the poster's raster image embedded. PNG rendering uses outlines from the same Inter files. No new raster generation, external font download, mobile review, accessibility audit, or full production test cycle was needed for this feedback round.

The accepted Passage name, headline, icon, and customer noun now form the basis for the canonical identity and authorized site/README rollout. The review assets remain here as the decision record; the [canonical guide](../../brand-identity.md) will document the persistent identity and export set.

# Passage icon studies

Three proposed marks for the single Passage identity. Inter, the white and charcoal palette, and painted landscape remain in place. These are exploratory icon options, not additional brand directions or accepted logo assets.

[Overview SVG](../../icon-study.svg) · [Overview PNG](../../icon-study.png)

| ID | Label | Native master | Rationale | Main tradeoff |
| --- | --- | --- | --- | --- |
| `excerpt` | Excerpt | [excerpt-mark.svg](excerpt-mark.svg) | One line moves out of a three-line text rhythm: the useful passage is brought forward from the conversation. | The content connection is immediate, but abstract text bars have less identity of their own. |
| `open-passage` | Open passage | [open-passage-mark.svg](open-passage-mark.svg) | A vertical spine and open curve suggest P. The narrow gap reads as a passage through the form, while the solid silhouette remains clear at small sizes. | More abstract than an explicit reading symbol. |
| `paragraph` | Paragraph | [paragraph-mark.svg](paragraph-mark.svg) | A custom pilcrow grounds the brand in a passage of text. Its filled bowl and paired stems create a compact typographic symbol. | The literary reference is familiar, so the symbol offers less distinctiveness for this brand. |

## Recommendation

Start with **Open passage**. It gives Passage a compact signature connected to its name, and the open gap adds a second reading without requiring an illustrated page or a detailed symbol. The 16 px and reverse examples remain legible. Keep this recommendation provisional until the user reviews the mark in context.

For renderer integration, each geometry child declares `fill="currentColor"` directly. The masters use a `0 0 32 32` viewBox with transparent backgrounds. The root preview can copy `open-passage-mark.svg` to its active `passage-mark.svg` after reviewing it.

## Rebuild

From the project root:

```sh
pnpm exec tsx docs/brand-exploration/round-07/assets/marks/build-studies.ts
```

The renderer uses the existing `tsx`, `@resvg/resvg-js`, and the direct `@shuding/opentype.js` dependency, plus the round's local Inter 400 and 500 WOFF files. No dependencies were added.

The command writes the three editable mark masters and the 1600 × 1080 overview SVG and PNG. The SVG contains embedded Inter font data and editable labels; the PNG render uses outlined text for consistent typography. The overview shows each mark large, in a Passage wordmark, at actual 16 / 24 / 32 px sizes, and reversed on charcoal.

The rendered overview was visually inspected for readable labels, clipping, and small-size silhouettes. This is a design review artifact, not production favicon verification.

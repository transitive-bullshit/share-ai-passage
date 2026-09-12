# Round 02 typography notes

Status: independent design assessment and proposed type system. The user explicitly rejected serif typography and requested a desktop exploration gallery. The mechanical scan and final composition are handled separately. This note does not claim mobile, accessibility, fallback-layout, or full production testing.

## What the existing files show

| Assessment | Source evidence | Consequence for round 02 |
| --- | --- | --- |
| Authority and fit | `round-01/render-data.json` assigns Newsreader to Folio and Commonplace. `round-01/build.ts` also hard-codes `news`/`newsItalic` in `folio()`, `commonplace()`, and `shareCard()`. | Changing only `headingFont` would leave rejected serif type in the artifacts. Replace all roles, including the wordmark, sample title, character lines, and mantra. |
| Families and roles | Round 01 uses Newsreader for voice and Inter/DM Sans for supporting text. Those pairings were proposals, not accepted brand constraints. | One sans family per direction is enough. Use regular and medium to establish hierarchy; five directions may use five different families because the exercise is comparing identities. |
| Hierarchy | `masthead()` uses a 72–76 px wordmark; Folio’s hero uses 111 px and its share-card title 68 px before nested scaling. Metadata labels occur throughout at 16–19 px with 1.5–2 px tracking. | The card should be the dominant product evidence. Reduce branding and editorial metadata rather than compensating with ever-larger titles. Prefer sentence-case controls and fewer labels. |
| Scale and consistency | `shareCard()` uses 68 px serif versus 57 px sans titles, while the gallery’s `.poster-image` scales the entire 1600 × 2040 poster to at most 760 px wide. | Judge scale at the actual desktop display size. A readable full-resolution poster can become a miniature in a gallery. Give each scene a usable desktop reading scale instead of relying on opening the original. |
| Reading | The previous gallery has `.intro p` at 13 px/1.6, `.description` at 14 px/1.65, and many 9–12 px labels. `folio()` wraps its descriptor at 642 px using 29 px type and 43 px leading before display scaling. | Use ordinary body copy around 16–18 rendered pixels and fewer factual labels. A short two-line subhead can deliberately be narrower than prose; longer notes should stay near 45–75 characters. |
| Stress and fallbacks | Fixed line arrays and the SVG measurement helper protect the authored specimen copy. They do not prove behavior for arbitrary content. Gallery `:root` names Inter without an `@font-face`; `.eyebrow` uses 650 and `.direction .name` uses 550. | Bundle and reference the exact font assets. Use the two actual static weights. Test the fixed desktop specimen visually; do not claim broad product text resilience from a throwaway gallery. |
| Delivery | Round 01 embeds WOFF fonts in editable SVGs and uses glyph outlines from the same font data for PNG rendering. The gallery chrome can fall back to system sans. | Self-host the selected WOFF files. Use exact normal 400/500 assets, no synthetic italics or synthetic intermediate weights. Preserve the outline workflow for reliable PNGs when needed. |

## Five distinct sans systems

| Direction | Family | Why it fits | Roles |
| --- | --- | --- | --- |
| Folio | Instrument Sans | Contemporary editorial clarity without the literary serif association | 500 display/card/wordmark; 400 supporting copy |
| Commonplace | Hanken Grotesk | A warm humanist feel that works with the plant illustration | 500 display/card/wordmark; 400 supporting copy |
| Frame | Manrope | Clean, precise shapes support a quiet frame around the work | 500 display/card/wordmark; 400 supporting copy |
| Kindred | Onest | Open, personable letterforms support a small human exchange | 500 display/card/wordmark; 400 supporting copy |
| Waymark | Plus Jakarta Sans | Soft geometric rhythm complements the gradual trail metaphor | 500 display/card/wordmark; 400 supporting copy |

These fit assessments are design judgments, not computed quality scores. All five families appear in the installed Impeccable Google Fonts fingerprint catalog as sans families. The catalog contains 3,076 fingerprints across 1,807 families. Its sampled weights are comparison fingerprints, not downloadable font files or a complete supported-weight list.

The local Impeccable launcher could not run `--help` because engine 0.1.5 was not installed and its cache directory could not be created within the read-only sandbox. This assessment read the installed `reference/typeset.md` and `scripts/data/font-index.json` directly. It does not claim a font-match ranking or completed mechanical scan.

## Desktop role proposal

Use a small set of semantic roles at the actual displayed size: a medium headline around 48–56 px with about 1.06–1.12 leading; a medium share title around 30–36 px with 1.15–1.2 leading; regular body/highlights around 16–18 px with 1.45–1.55 leading; medium action text around 14 px; and occasional metadata around 12 px. These are starting ranges, not an obligation to add every role.

Keep body tracking near normal. Display tracking can tighten slightly when the selected face and exact words benefit, without squeezing the text. Use space and a restrained weight step to separate roles. Avoid technical wide-tracked all-caps labels, dark green fields, bold promotional scale, serif italics, and new decorative type pairings. The rendered artifact should command attention before the product logo.

## Font acquisition and maintenance

Ten static normal WOFF files, five licenses, and [origins.json](assets/fonts/origins.json) are stored in `assets/fonts`. They were downloaded directly from official `@fontsource` npm package tarballs, with no package.json or lockfile changes:

- Instrument Sans 5.3.0, normal 400 and 500.
- Hanken Grotesk 5.3.0, normal 400 and 500.
- Manrope 5.3.0, normal 400 and 500.
- Onest 5.3.1, normal 400 and 500.
- Plus Jakarta Sans 5.3.0, normal 400 and 500.

The manifest records exact tarball URL, package version, archive member, weight/style, SHA-256, byte count, and license filename. All ten files were checked for the WOFF signature. The build can use these files directly and does not need a package installation or a runtime font download. Final production font loading and subset choices belong to the later implementation, after a direction is accepted.

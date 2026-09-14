# Round 05 asset provenance

No imagery was generated for this round. The comparison reuses the retained Folio assets and the current Passage homepage assets.

## Images

| Asset | Local review copy | SHA-256 |
| --- | --- | --- |
| Folio hero | [assets/folio-hero.png](folio-hero.png) | `7a344fc0ae5a7f0cc5d28f571bcdf977abe9f41058bdf99f480aabd25c2a22e5` |
| Passage landscape | [assets/passage-landscape.png](passage-landscape.png) | `d4618cc38cadbc1d14f9e36ae168ff8d648093e509361c8a709303086d83989a` |

Folio comes unchanged from round 04, originally selected in the round 01 Midjourney batch. See [original provenance](../../round-01/assets/midjourney-provenance.md).

Passage is a byte-for-byte copy of `public/images/passage-landscape.png`. The current homepage imports that exact repository asset in `components/landing-details.tsx`. The historical verification notes describe generated landscape artwork; an exact original prompt/provider record was not found, so no generation provenance is invented. The review uses the existing asset without editing it.

## Fonts

Folio uses the existing Instrument Sans normal 400/500 WOFF files and license from round 04. Their original sources and hashes are recorded in the [round 02 font manifest](../../round-02/assets/fonts/origins.json).

Passage uses Inter normal 400/500/600 copied from the installed `@fontsource/inter` package, version 5.3.0. These are the same family and weights imported in `app/layout.tsx`, not a new font selection. The license is included in [fonts/inter-LICENSE.txt](fonts/inter-LICENSE.txt).

## Native marks and composition

The Folio mark is unchanged from the retained round 04 SVG, in Ribbon #B85540. The Passage mark copies the exact native geometry from `components/brand-mark.tsx`: two outlined rounded rectangles on a 32×32 viewBox, stroke width 1.8, rendered in #171717. The [Passage SVG](marks/passage-mark.svg) is a reusable native master.

The Passage poster is a native comparison composition derived from the current homepage. It retains its name, headline, descriptor, Inter hierarchy, core colors, form shape, overlapping-page geometry, and existing landscape. It is not a homepage screenshot. The share specimen uses the homepage's original white/Inter card treatment from `lib/card.tsx`, with the same invented conversation used in the Folio comparison. The live homepage's actual example title remains “Make room for the unexpected.” The curated publication card templates are separate product styles, not the homepage brand identity.

Live reference inspected: `http://share-ai-passage.localhost:1355/`, September 11, 2026. Source files: `app/layout.tsx`, `app/globals.css`, `components/share-flow.tsx`, `components/landing-details.tsx`, `components/brand-mark.tsx`, `lib/card.tsx`, `app/api/example-card/route.ts`.

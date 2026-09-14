# Relay — Ideas in circulation

**Status:** Proposed exploration, September 11, 2026. No identity has been accepted. **Name:** Relay, title case, pronounced ree-LAY; creative territory label with no domain availability or clearance established. Relay is widely used by adjacent AI products, including Relay.app. Retain the visual idea but plan another naming pass; see the bounded [naming check](naming-notes.md).

## Identity at a glance

- **Brand idea:** A useful idea becomes more useful when it reaches another person.
- **Mantra:** Good thinking travels. Use as the internal principle and occasional campaign line.
- **Main one-liner:** Give your ideas a way out.
- **Descriptive one-liner:** Turn a public AI conversation into highlights, a styled share card, and a readable conversation.
- **Promise:** Give a useful AI conversation an immediate, recognizable introduction when you share it with your audience.
- **Primary emotion:** Energy and readiness to put work into the world.
- **Character:** Direct. Bold. In motion.

## Positioning and creative argument

Relay leads with the moment between finishing a useful conversation and posting a link. Its territory is public presence: turn an overlooked piece of work into something people can quickly recognize and understand. It serves users who already know why they share and want more care and character in how they show up.

Cobalt, warm cream, and yellow create a compact graphic language with strong recall. Oversized sans-serif type and forward-moving forms make the direction feel active and social. The product's evidence stays tangible: a clear card and a readable conversation, with no promise of reach or virality.

**Main tradeoff:** Its energy can become loud or resemble a generic social-growth tool. The actual ideas must stay more prominent than promotional decoration. The Relay name is especially crowded near AI agents and is a territory label for this round, not the recommended final name.

## Mark, typography, and imagery

**Proposed mark:** The [native SVG mark](assets/marks/relay-mark.svg) uses paired forward-facing strokes that suggest an object being passed along. Relay is set in a confident DM Sans weight. The supplied geometry is exploratory; final lockup, clear space, minimum size, and small-icon simplification remain open.

**Typography:** DM Sans 700/900 for the wordmark and large headlines; Inter 400/500 for body, explanatory copy, and controls. Give the largest type tight but readable spacing. The build uses the font copies and licenses in [assets/fonts](assets/fonts), sourced from `@fontsource/dm-sans` and `@fontsource/inter`. Fallback for live applications: sans-serif.

**Image world:** Graphic paper forms in transit, a repeated passing gesture, or sculptural ribbons crossing a frame. Flat cobalt fields, hard-edged yellow, and cream negative space dominate. Use a single signature movement rather than scattering stickers, emoji, or decorative arrows. Images are conceptual editorial compositions, not proof of an automatic distribution feature.

**Composition:** Bold scale changes, offset blocks, and a clean forward rhythm. A card demonstration can overlap a brand field, but its title and highlights stay fully readable. Avoid turning every element into a pill or sticker.

**Exploration hero:** [relay hero](assets/relay-hero.png), generated with Midjourney. Alt text: Broad dark blue and golden arcs radiate across textured cream paper. The exact prompt, source, and selection notes are recorded in the [generation provenance](assets/midjourney-provenance.md). The selected image uses deep blue and golden inks; the native vector palette remains the precise Cobalt/Cream/Yellow system below.

## Color

| Token | Value | Role and pairing |
| --- | --- | --- |
| Cobalt | #243EDB | Dominant brand field, wordmark, and headline color |
| Cream | #FFF9E9 | Main light field/text; 7.17:1 against Cobalt |
| Yellow | #EAF05C | Memorable accent and action fill; 6.14:1 against Cobalt; use Cobalt text on Yellow |

Cobalt and Cream carry most communication. Yellow is an intentional, limited emphasis. Do not set Yellow on Cream for informative text. Ratios are calculated from sRGB luminance; final raster outputs still require visual inspection.

## Voice and copy bank

Write with momentum. Use clear active verbs and short sentences. Recognize the user's desire to participate without framing every share as a growth tactic. A little attitude is welcome; no hustle vocabulary or reach guarantees.

**Short introduction:** Found something useful in a conversation with AI? Give it a clear introduction and a style worth sharing. Send people into the ideas, with the conversation ready to read.

**Supporting line:** Make the first glance count.

**Primary CTA:** Create a share

**Secondary CTA:** See it in use

**Do:** “Give people a reason to open the conversation.” **Don't:** “Turn every thread into viral content.” The first describes a clear introduction; the second promises distribution the product cannot deliver.

**Do:** “Put a useful idea into circulation.” **Don't:** “Dominate the feed.” The first supports generous participation; the second substitutes competition for substance.

## Product, audience, and scope

The fixed brief is an open-source web tool for heavy AI users who share their work publicly. It accepts public ChatGPT, Codex, and Claude conversation links, generates a title and highlights, offers five curated card styles, and publishes a share link with a readable saved conversation and a link to the original. The browser, CLI, and agent skill support the workflow. No account or payment is required in the first version. See the [working brief](../brief.md) and [MVP plan](../../MVP_PLAN.md).

The core audience is a person who uses AI deeply and cares how their work appears to peers. The secondary audience is the reader deciding whether an idea is useful enough to explore. The alternative is a native provider link, a screenshot, or a manually written recap. The immediate differentiator is a clear introduction, considered presentation, and the conversation behind it in one small workflow.

**Fixed:** current functionality, supported providers, audience, English copy, readable contrast. **Working:** direction name, promise hierarchy, voice, mark, typography, palette. **Open:** final name, domain/TLD and budget, exact mark geometry, future personal branding features. The user requested visual exploration before settling interview choices. These candidates test assumptions rather than record acceptance.

## Product language and claim boundaries

Use **conversation**, **share**, **share card**, **highlights**, and **style** as ordinary product nouns. Do not require the product name to become a new noun. Controls stay literal: Public conversation link; Review highlights; Choose a style; Publish share; Copy link; Read the conversation; Open original.

The current product supports generated title/highlights and selection among curated styles. It does not support editing the generated copy, custom logos/colors/domains, publishing profiles, collections, analytics, verified authorship, audience growth guarantees, private conversations, permanent archiving, or perfect media/tool fidelity. Published shares are fixed presentations and may be disabled after confirmed removal of the public source. Imagery and interface examples here are proposed brand applications, not shipped screens or feature promises.

## Comparable share-card example

**Label:** ILLUSTRATIVE CONVERSATION

**Title:** A calmer way to build with AI

**Highlights:**

- Start with a clear question.
- Make the tradeoffs visible.
- Keep the reasoning close.

**Reader action:** Read the conversation

This is invented demonstration content for comparing design directions, not a real conversation or testimonial. Do not add an author identity, view count, rating, or growth metric.

## Applications, assets, and maintenance

Use the strongest visual expression on the landing page, announcements, and the product's own social preview. Let the shared conversation's title and highlights dominate its card. Keep service branding subordinate. The reader should be calmer than the campaign poster and preserve familiar, literal navigation. The README opens with the descriptive one-liner and the real workflow.

The Markdown is the source for proposed decisions and exact copy. [render-data.json](render-data.json) is the explicit rendering projection for names, copy, palette, font roles, hero paths, and alt text; [build.ts](build.ts) validates the rendered copy and palette values against the candidate specifications before export. The build reads this JSON projection; it does not parse the full Markdown into a design. No canonical identity or rollout is authorized by this candidate.

Regenerate from the repository root with `pnpm exec tsx docs/brand-exploration/round-01/build.ts`. The project already supplies `tsx`, `@shuding/opentype.js`, and Resvg. Local WOFF font copies and their license files are preserved in [assets/fonts](assets/fonts). The editable SVGs embed the WOFF inputs and raster imagery. For PNG output, the build outlines text from the same WOFF fonts through the direct `@shuding/opentype.js` dependency, then renders with Resvg. See the [round README](README.md) for the full build and verification record.

| Purpose | Local asset | Format/status |
| --- | --- | --- |
| Complete direction | [relay poster SVG](relay-poster.svg) | 1600 × 2040 editable SVG; proposed identity |
| Review image | [relay poster PNG](relay-poster.png) | 1600 × 2040 PNG; proposed identity |
| Illustrative share card | [relay card SVG](relay-share-card.svg), [PNG](relay-share-card.png) | 1200 × 630; proposed application using invented example content |
| Standalone native mark | [relay mark](assets/marks/relay-mark.svg) | Native SVG geometry; proposed |
| Hero imagery | [relay hero](assets/relay-hero.png) | PNG; proposed conceptual imagery |
| Image provenance | [Generation record](assets/midjourney-provenance.md) | Exact prompt, provider, and source/selection notes |
| Rendering source and projection | [build.ts](build.ts), [render-data.json](render-data.json) | Project-local regeneration source and synchronized inputs |
| Build documentation | [README](README.md) | Regeneration and verification record |
| Font inputs and licenses | [assets/fonts](assets/fonts) | Local WOFF files and package licenses |

Final favicon, social-preview, and canonical logo exports follow only after a direction is accepted or final selection is delegated. Continue iteration from specific feedback on positioning, emotion, imagery, mark, typography, palette, and copy; selecting one element does not accept the whole direction.

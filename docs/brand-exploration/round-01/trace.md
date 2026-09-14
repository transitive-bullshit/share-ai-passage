# Trace — The open work

**Status:** Proposed exploration, September 11, 2026. No identity has been accepted. **Name:** Trace, title case, pronounced trayss; creative working label with no domain availability or clearance established. Microsoft Research already uses Trace for an open-source AI agent library; see the bounded [naming check](naming-notes.md).

## Identity at a glance

- **Brand idea:** The path through an idea is part of its value.
- **Mantra:** Make the thinking visible. Use as the internal principle and occasional manifesto line.
- **Main one-liner:** Show how you got there.
- **Descriptive one-liner:** Turn a public AI conversation into highlights, a styled share card, and a readable conversation.
- **Promise:** Help people grasp the main ideas and inspect the conversation that shaped them.
- **Primary emotion:** Confidence in showing the work.
- **Character:** Precise. Open. Capable.

## Positioning and creative argument

Trace puts the open-source analogy at the center: make the work legible enough for another person to understand and learn from. It treats the conversation as a useful source artifact and the share card as its point of entry. This is the most natural territory for AI engineers and people who care about seeing decisions and tradeoffs.

A dark, precise visual system uses paths, endpoints, indexing, and open brackets to suggest inspectability. Bright acid marks the meaningful next step. The visual language should feel like a well-made instrument without turning the public experience into developer documentation.

**Main tradeoff:** The name and aesthetic can imply tracing, observability, or hidden model reasoning. This product shares messages that appeared in a public conversation; it does not expose internal model reasoning, verify conclusions, or audit agents. Use the literal descriptor prominently. A later naming pass is needed if this territory wins.

## Mark, typography, and imagery

**Proposed mark:** The [native SVG mark](assets/marks/trace-mark.svg) places a path between two endpoints inside open brackets. The openings signify access and the path represents a visible exchange. Trace is title case in Inter. The supplied geometry is exploratory; final lockup, clear space, minimum size, and small-icon simplification remain open.

**Typography:** Inter 400/500/700 for the wordmark, direct headlines, and body, with letter-spaced technical labels. No monospace font is used in the exploration exports. The build uses the font copies and license in [assets/fonts](assets/fonts), sourced from `@fontsource/inter`. Fallback for live applications: sans-serif.

**Image world:** Traced paths, translucent planes, clear endpoints, and one bright route through a dark field. Use physical depth or print-like layering sparingly. Avoid glowing brains, neural nets, dashboards, and diagrams that imply an actual analysis feature. A conceptual hero may explore transparency and paths; logos and explanatory graphics should remain native vector.

**Composition:** A measured grid, crisp left alignment, readable indexing, and one strong directional gesture. Light mint text holds most of the information; the acid accent indicates a selected point or action.

**Exploration hero:** [trace hero](assets/trace-hero.png), generated with Imagegen. Alt text: A continuous green route winds through a sequence of translucent drafting sheets. The exact prompt, source, and selection notes are recorded in the [generation provenance](assets/provenance.md). This is a conceptual brand-world image, not a product screenshot.

## Color

| Token | Value | Role and pairing |
| --- | --- | --- |
| Field | #10201C | Dominant dark background; use Mint text |
| Mint | #DFE9DE | Main text/light panel; 13.53:1 against Field |
| Acid | #B7F56A | Primary accent/action; 13.07:1 against Field; use Field text on Acid fills |

The dark field should feel calm, not theatrical. Keep primary copy large enough to stay readable at preview size. Ratios are calculated from sRGB luminance; final raster outputs still require visual inspection.

## Voice and copy bank

Use short, exact sentences and verbs that invite inspection: see, read, follow, understand, share. Say what is visible. Technical fluency is welcome; internal terminology should not appear in ordinary product controls.

**Short introduction:** Make the main ideas easy to grasp, with the conversation close at hand. Paste a public AI conversation link, review the highlights, and choose how to share it.

**Supporting line:** The ideas up front. The conversation a click away.

**Primary CTA:** Create a share

**Secondary CTA:** Read an example

**Do:** “Read the conversation behind the highlights.” **Don't:** “Audit the model's reasoning.” The first names accessible messages; the second claims access and verification that are absent.

**Do:** “Show the questions and tradeoffs.” **Don't:** “Prove how your AI thinks.” The first celebrates visible collaboration; the second misstates what is shared.

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

Regenerate from `/Users/tfischer/dev/modules/ai-chat-proxy` with `pnpm exec tsx docs/brand-exploration/round-01/build.ts`. The project already supplies `tsx`, `@shuding/opentype.js`, and Resvg. Local WOFF font copies and their license files are preserved in [assets/fonts](assets/fonts). The editable SVGs embed the WOFF inputs and raster imagery. For PNG output, the build outlines text from the same WOFF fonts through the direct `@shuding/opentype.js` dependency, then renders with Resvg. See the [round README](README.md) for the full build and verification record.

| Purpose | Local asset | Format/status |
| --- | --- | --- |
| Complete direction | [trace poster SVG](trace-poster.svg) | 1600 × 2040 editable SVG; proposed identity |
| Review image | [trace poster PNG](trace-poster.png) | 1600 × 2040 PNG; proposed identity |
| Illustrative share card | [trace card SVG](trace-share-card.svg), [PNG](trace-share-card.png) | 1200 × 630; proposed application using invented example content |
| Standalone native mark | [trace mark](assets/marks/trace-mark.svg) | Native SVG geometry; proposed |
| Hero imagery | [trace hero](assets/trace-hero.png) | PNG; proposed conceptual imagery |
| Image provenance | [Generation record](assets/provenance.md) | Exact prompt, provider, and source/selection notes |
| Rendering source and projection | [build.ts](build.ts), [render-data.json](render-data.json) | Project-local regeneration source and synchronized inputs |
| Build documentation | [README](README.md) | Regeneration and verification record |
| Font inputs and licenses | [assets/fonts](assets/fonts) | Local WOFF files and package licenses |

Final favicon, social-preview, and canonical logo exports follow only after a direction is accepted or final selection is delegated. Continue iteration from specific feedback on positioning, emotion, imagery, mark, typography, palette, and copy; selecting one element does not accept the whole direction.

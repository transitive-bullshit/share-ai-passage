# Commonplace — Learning in public

**Status:** Proposed exploration, September 11, 2026. No identity has been accepted. **Name:** Commonplace, title case, pronounced KOM-un-place; creative territory label with no domain availability or clearance established. A directly adjacent Commonplace product already offers quote cards and source-linked previews. Preserve the visual territory for comparison, but do not advance this exact name without another naming pass; see the bounded [naming check](naming-notes.md).

## Identity at a glance

- **Brand idea:** Sharing what you learn leaves something useful for the next person.
- **Mantra:** Learn openly. Share generously. Use as the internal principle and occasional manifesto line.
- **Main one-liner:** Leave something worth finding.
- **Descriptive one-liner:** Turn a public AI conversation into highlights, a styled share card, and a readable conversation.
- **Promise:** Make a useful part of your learning understandable to other people, with the conversation available for those who want to go deeper.
- **Primary emotion:** Generosity and a sense of possibility.
- **Character:** Curious. Human. Generous.

## Positioning and creative argument

Commonplace centers the trail of learning the founder described. Each shared conversation can become a small, useful contribution: a clear idea encountered today, the context available when someone needs it tomorrow. This is the broadest and warmest direction for people who use AI deeply without identifying as engineers.

Pale blue, forest green, and a tangerine accent create a human, open visual world. An editorial serif combines with an approachable sans-serif. The signature metaphor is an open space that another person can enter, expressed through shared pages, rounded forms, or a small path through an inviting landscape.

**Main tradeoff:** The name can imply a notebook or knowledge collection, and a closely adjacent product already uses it. The atmosphere can drift into a community network or educational brand. The literal product descriptor and a real sharing example must keep the actual service clear. This is a visual territory label for this round.

## Mark, typography, and imagery

**Proposed mark:** The [native SVG mark](assets/marks/commonplace-mark.svg) uses two open leaves or pages meeting around a shared center. It suggests exchange and welcome. Commonplace is set in Newsreader. The supplied geometry is exploratory; final lockup, clear space, minimum size, and small-icon simplification remain open.

**Typography:** Newsreader 400 normal and italic for the wordmark and expressive headlines; DM Sans 400 for body, labels, and controls. Use comfortable line lengths and a generous reading rhythm. The build uses the font copies and licenses in [assets/fonts](assets/fonts), sourced from `@fontsource/newsreader` and `@fontsource/dm-sans`. Fallbacks for live applications: Georgia and sans-serif.

**Image world:** A small, inviting space built from folded paper, soft sculptural shapes, or a path through lightly textured blue-green terrain. Include one tangerine point of curiosity. Aim for warmth and possibility without cute mascots or lifestyle stock imagery. Any scene is a brand metaphor; it does not represent a discovery feed, shared notebook, or built-in community.

**Composition:** Softly asymmetrical editorial layout with rounded shape accents, clear reading zones, and breathing room. Bring the share-card example into the same visual world; keep interaction controls plain and recognizable.

**Exploration hero:** [commonplace hero](assets/commonplace-hero.png), generated with Imagegen. Alt text: A branching plant with dark green and orange leaves grows from an open notebook. The exact prompt, source, and selection notes are recorded in the [generation provenance](assets/provenance.md). The open notebook and growing plant express learning as a metaphor. They do not imply a collection, workspace, or discovery network.

## Color

| Token | Value | Role and pairing |
| --- | --- | --- |
| Sky | #DDECF1 | Dominant open background; pair with Forest |
| Forest | #183E35 | Headlines/body/mark; 9.75:1 against Sky |
| Tangerine | #E88B52 | Warm accent or occasional fill; Forest text on Tangerine is 4.63:1 |

Sky and Forest do the everyday work. Use Tangerine to create a small point of warmth, not as body text on Sky. Ratios are calculated from sRGB luminance; final raster outputs still require visual inspection.

## Voice and copy bank

Sound like a curious person sharing something useful with a peer. Use warm, clear sentences and ordinary language: learn, try, notice, share, read, question. Be generous without becoming sentimental. Avoid promises that a reader will discover the share automatically.

**Short introduction:** A good conversation can be useful beyond the people who had it. Share the ideas clearly, with the conversation close by for anyone who wants to explore.

**Supporting line:** A little context can open a new direction.

**Primary CTA:** Create a share

**Secondary CTA:** Explore an example

**Do:** “Share something you learned.” **Don't:** “Join a movement of visionary thinkers.” The first makes a small, useful invitation; the second invents a network and flatters the audience.

**Do:** “Make the idea easy to understand.” **Don't:** “Build your personal knowledge garden.” The first fits the current share workflow; the second implies collections and an ongoing workspace.

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

Regenerate from `/Users/tfischer/dev/modules/ai-chat-proxy` with `pnpm exec tsx docs/brand-exploration/round-01/build.ts`. The project already supplies `tsx`, Satori, and Resvg. Local WOFF font copies and their license files are preserved in [assets/fonts](assets/fonts). The editable SVGs embed the WOFF inputs and raster imagery. For PNG output, the build outlines text from the same WOFF fonts through Satori's transitive OpenType dependency, then renders with Resvg. See the [round README](README.md) for the full build and verification record.

| Purpose | Local asset | Format/status |
| --- | --- | --- |
| Complete direction | [commonplace poster SVG](commonplace-poster.svg) | 1600 × 2040 editable SVG; proposed identity |
| Review image | [commonplace poster PNG](commonplace-poster.png) | 1600 × 2040 PNG; proposed identity |
| Illustrative share card | [commonplace card SVG](commonplace-share-card.svg), [PNG](commonplace-share-card.png) | 1200 × 630; proposed application using invented example content |
| Standalone native mark | [commonplace mark](assets/marks/commonplace-mark.svg) | Native SVG geometry; proposed |
| Hero imagery | [commonplace hero](assets/commonplace-hero.png) | PNG; proposed conceptual imagery |
| Image provenance | [Generation record](assets/provenance.md) | Exact prompt, provider, and source/selection notes |
| Rendering source and projection | [build.ts](build.ts), [render-data.json](render-data.json) | Project-local regeneration source and synchronized inputs |
| Build documentation | [README](README.md) | Regeneration and verification record |
| Font inputs and licenses | [assets/fonts](assets/fonts) | Local WOFF files and package licenses |

Final favicon, social-preview, and canonical logo exports follow only after a direction is accepted or final selection is delegated. Continue iteration from specific feedback on positioning, emotion, imagery, mark, typography, palette, and copy; selecting one element does not accept the whole direction.

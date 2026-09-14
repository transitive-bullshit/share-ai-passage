# Folio — The considered edition

**Status:** Proposed exploration, September 11, 2026. No identity has been accepted. **Name:** Folio, title case, pronounced FOH-lee-oh; creative working label with no domain availability or clearance established. An existing Folio AI application was found in the bounded [naming check](naming-notes.md).

## Identity at a glance

- **Brand idea:** Useful thinking deserves a considered public form.
- **Mantra:** Give good work a good form. Use as the internal craft principle and occasional manifesto line.
- **Main one-liner:** Your thinking, worth sharing.
- **Descriptive one-liner:** Turn a public AI conversation into highlights, a styled share card, and a readable conversation.
- **Promise:** Give people a clear introduction to the ideas you worked through with AI, in a presentation you feel proud to share.
- **Primary emotion:** Pride in authorship and care.
- **Character:** Considered. Independent. Proud.

## Positioning and creative argument

Folio frames sharing as a small act of publishing. The user has done the thinking; the product gives it an accessible cover and an invitation to read further. The editorial world makes care visible through hierarchy, generous margins, and the relationship between a strong title and quiet supporting text. It speaks to people who want their public work to feel intentional.

This direction most directly serves personal craft and recognizable taste. Its restraint leaves room for different subject matter without turning every share into an advertisement for the tool. The open-work belief stays present in the access to the original conversation.

**Main tradeoff:** It can feel like a writing or portfolio product, and the name has other software uses. The literal descriptor must stay close to the hero. Avoid implying an editable publication suite or a collection of a person's work.

## Mark, typography, and imagery

**Proposed mark:** The [native SVG mark](assets/marks/folio-mark.svg) uses two offset page strokes forming an open F and a small edition. Folio is title case in Newsreader. The supplied geometry is exploratory; final lockup, clear space, minimum size, and small-icon simplification remain open.

**Typography:** Newsreader 400 normal and italic for the wordmark and generous editorial headlines; Inter 400/500 for descriptions, labels, and controls. Use Newsreader at expressive large sizes and Inter for small factual text. The build uses the font copies and licenses in [assets/fonts](assets/fonts). Source packages are `@fontsource/newsreader` and `@fontsource/inter`. Fallbacks for live applications: Georgia and sans-serif.

**Image world:** Tactile paper, folded planes, careful cut edges, and a small vermilion intervention. A soft sidelight reveals the construction. One generous object or composition is enough. Avoid generic bookshelves, quill pens, and dense desktop still life. The image should suggest thought taking public form; it must not look like a screenshot of an unbuilt editor.

**Composition:** An editorial masthead, a spacious hero, fine rules, and asymmetrical page-like blocks. The product example belongs in the same page system rather than inside a glossy device mockup.

**Exploration hero:** [folio hero](assets/folio-hero.png), generated with Midjourney. Alt text: A fan of ivory book pages curls around a vermilion ribbon on a warm stone surface. The exact prompt, source, and selection notes are recorded in the [generation provenance](assets/midjourney-provenance.md). This is a conceptual brand-world image, not a product screenshot.

## Color

| Token | Value | Role and pairing |
| --- | --- | --- |
| Paper | #F3EFE5 | Dominant warm background; pair with Ink |
| Ink | #24211D | Headlines/body; 13.96:1 against Paper |
| Vermilion | #C74B34 | Mark, rules, large accent type; 4.08:1 against Paper, so do not use for small normal text |

Keep the broad field warm and quiet. Vermilion occupies a small fraction of the frame and directs attention to a meaningful element. Ratios are calculated from sRGB luminance; final raster outputs still require visual inspection.

## Voice and copy bank

Write complete, lightly rhythmic sentences. Speak with the confidence of a thoughtful editor. Use thinking, work, ideas, introduction, conversation, and share. Avoid prestige language, flattery, and language that suggests the AI has authored the user's judgment.

**Short introduction:** You worked through something useful with AI. Give it a clear introduction, choose a style, and share the conversation behind it.

**Supporting line:** A clear first impression. Room to read further.

**Primary CTA:** Create a share

**Secondary CTA:** See an example

**Do:** “Choose a style for your conversation.” **Don't:** “Curate your intellectual legacy.” The first names the actual action; the second inflates the product's role.

**Do:** “Your ideas, with the conversation behind them.” **Don't:** “Publish your definitive thinking.” The first welcomes exploration; the second suggests finality and authority the product does not confer.

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
| Complete direction | [folio poster SVG](folio-poster.svg) | 1600 × 2040 editable SVG; proposed identity |
| Review image | [folio poster PNG](folio-poster.png) | 1600 × 2040 PNG; proposed identity |
| Illustrative share card | [folio card SVG](folio-share-card.svg), [PNG](folio-share-card.png) | 1200 × 630; proposed application using invented example content |
| Standalone native mark | [folio mark](assets/marks/folio-mark.svg) | Native SVG geometry; proposed |
| Hero imagery | [folio hero](assets/folio-hero.png) | PNG; proposed conceptual imagery |
| Image provenance | [Generation record](assets/midjourney-provenance.md) | Exact prompt, provider, and source/selection notes |
| Rendering source and projection | [build.ts](build.ts), [render-data.json](render-data.json) | Project-local regeneration source and synchronized inputs |
| Build documentation | [README](README.md) | Regeneration and verification record |
| Font inputs and licenses | [assets/fonts](assets/fonts) | Local WOFF files and package licenses |

Final favicon, social-preview, and canonical logo exports follow only after a direction is accepted or final selection is delegated. Continue iteration from specific feedback on positioning, emotion, imagery, mark, typography, palette, and copy; selecting one element does not accept the whole direction.

# Passage — Conversations worth sharing

**Status:** The current product homepage extracted as a second proposed identity for round 05. This documents the existing name, typography, mark, copy, color system, and imagery for comparison with Folio. It is not a newly invented Passage treatment or an accepted final brand.

## Identity and exact copy

- **Name:** Passage, title case. This is the current application name. No fixed branded domain is asserted; `lib/config.ts` derives the application URL from the runtime environment.
- **Brand idea:** Give a conversation a clear introduction, with its context available behind it. This is an interpretation of the current copy and interface.
- **Announcement:** A little more context. A much better link.
- **Main one-liner:** Good conversations. Beautifully shared.
- **Descriptive one-liner:** Turn a public AI chat into a thoughtful preview, with the highlights up front and the full conversation behind it.
- **Mantra:** Good conversations deserve to travel. This is the existing footer line, used here as a compact statement of the identity.
- **Character:** Clear. Thoughtful. Welcoming. These are descriptive interpretations, not additional live homepage claims.
- **Primary emotion:** Ease and confidence in sharing a useful conversation.
- **Rationale:** The current Passage homepage, captured as an identity: a quiet white interface, clear Inter typography, an overlapping-page mark, and a painted landscape that gives the shared work room.

The announcement, hero, and descriptor come from [share-flow.tsx](../../../components/share-flow.tsx). The application title “Passage — Conversations worth sharing,” name, navigation, and footer line come from [layout.tsx](../../../app/layout.tsx). The literal workflow and current scope are the same product being explored as Folio: public ChatGPT/Codex/Claude input, a generated title/highlights, curated styles, and a share link with a saved conversation.

## Positioning and voice

The current voice is friendly, concrete, and lightly literary. It emphasizes a small effort, a clearer introduction, and context that travels with an idea. Sentence pairs and ordinary action verbs create a calm, approachable rhythm. Do not invent louder slogans or a technical positioning layer for this extraction.

Existing useful copy from [landing-details.tsx](../../../components/landing-details.tsx):

- “A clear introduction. The whole conversation, one click away.”
- “Small effort. Better sharing.”
- “The good part, right up front.”
- “Bring a conversation.”
- “Give it a clear introduction.”
- “Send a link worth opening.”
- “For you. And your agents.”

Existing controls from [share-flow.tsx](../../../components/share-flow.tsx) and [layout.tsx](../../../app/layout.tsx):

- Navigation/footer action: **Create a passage** with an outward arrow.
- Source field: **Public conversation link**; placeholder **Paste a public link…**.
- Form action: **Go** with a right arrow; pending state **Preparing…**.
- Helper: **ChatGPT, Codex & Claude. No account needed.**
- Reassurance: **Preview first. Publish when you’re ready.**

Folio’s separate proposed action remains **Create a share**. Passage retains its existing **Go** form action and **Create a passage** navigation wording.

## Mark and typography

- **Mark:** Overlapping pages. The existing two outlined pages, unchanged from the homepage BrandMark component.
- **Exact geometry:** Two unfilled rounded rectangles in a 32 × 32 viewBox: `(x=3, y=8, width=15, height=20, radius=3)` and `(x=12, y=3, width=15, height=20, radius=3)`. Stroke is `currentColor`, width 1.8; the homepage component displays at 28 × 28. See [BrandMark](../../../components/brand-mark.tsx).
- **Mark color:** Charcoal #171717 on the white homepage. No Folio ribbon accent or new page-turn shape is applied.
- **Wordmark:** Inter 600, 21 px, −0.8 px tracking, with a 10 px gap from the mark on desktop.
- **Heading:** Inter 500, `clamp(44px, 5.4vw, 68px)`, line-height 1.055, −3.3 px tracking. “Beautifully shared.” is #777777.
- **Supporting copy:** Inter 400, 17 px, line-height 1.75, #737373. Section headings use Inter 500 at 38 px/1.15 with −1.6 px tracking.
- **Small interface text:** Inter throughout ordinary navigation, controls, and captions. The showcase toolbar, step numbers, and terminal output use the existing system monospace stack `ui-monospace, SFMono-Regular, Menlo, monospace`; this is a supporting detail, not a second main brand family.
- **Delivery:** The current layout imports Inter 400/500/600 from Fontsource. Local WOFF copies and the license are reused for the comparison.

The exact values are in [globals.css](../../../app/globals.css), especially `.wordmark`, `.hero h1`, `.hero-description`, `.section-intro h2`, `.example-toolbar`, and `.step-number`. The [existing favicon](../../../app/icon.svg) places the same white outlined geometry on a #171717 square, 40 × 40 with radius 10. No new favicon or final logo system is created here.

## Color and layout

The three main extracted colors are:

| Role     | Value   |
| -------- | ------- |
| White    | #FFFFFF |
| Charcoal | #171717 |
| Muted    | #737373 |

Additional existing interface values are #F5F5F5 for secondary surfaces, #E8E8E8 for borders, #777777 for the second hero line, #FDFDFD for the showcase toolbar, and #DEDEDE for the small browser dots. The status dot is #62A78A and terminal checkmarks are #79968A. These are small existing details; they do not define a dominant green theme. #B42318 is reserved for destructive/error states. The landscape’s colors belong to the artwork rather than a new invented token palette.

The desktop homepage has a centered hero and pill-shaped source form above a wide landscape showcase. The site column is at most 1120 px, the hero copy at most 800 px, and the source form at most 568 px. The form input and button are 52 px high with fully rounded ends. The 16 px-radius landscape panel holds an 800 px white browser-like share window with 12 px corners, a pale toolbar, and soft shadows. Below it are quiet provider, process, and agent sections. This layout is documented in [globals.css](../../../app/globals.css) and [landing-details.tsx](../../../components/landing-details.tsx).

## Imagery and existing card behavior

**Hero:** [Passage landscape](assets/passage-landscape.png), copied from the current [public image](../../../public/images/passage-landscape.png). It is a 1672 × 941 PNG. Alt description: A soft impressionistic lake landscape with water lilies, trees, and distant misty hills. The image was inspected directly; the native composition preserves this existing painted world. The homepage places it behind the white example window, using `object-fit: cover` and `object-position: center 57%`.

The historical [verification notes](../../archive/VERIFICATION.md) describe the current white/charcoal, locally hosted Inter redesign, its centered form, and its generated landscape artwork, with the user’s Ultracite reference as context. An exact prompt for this landscape was not located in that documentation; do not invent one.

The live homepage calls `/api/example-card` **without a template parameter**. Therefore [renderCard](../../../lib/card.tsx) uses the original unthemed white/Inter layout. It does not use the Margin notes style, even though Margin notes is the default for newly prepared shares. The five illustrated styles and their serif/DM Sans choices are separate product options, not the homepage brand typography.

The current live example title is **Make room for the unexpected**, with its three source-defined highlights in [example-card/route.ts](../../../app/api/example-card/route.ts). The comparison below deliberately substitutes the same content used for Folio while preserving that white/Inter card language.

## Comparable share specimen

**Label:** Example AI conversation

**Title:** A calmer way to build with AI

- Start with a clear question.
- Make the tradeoffs visible.
- Keep the reasoning close.

**Reader action:** Read the conversation

This is comparison content adapted in native rendering using Passage’s existing unthemed white/Inter card layout. It is **not a screenshot**, a new Passage style, or the live homepage’s unchanged example text. The comparison keeps content constant so the two identities can be judged fairly.

The unthemed source card uses a 1200 × 630 white canvas, Inter, #171717 title, #525252 highlights, #737373 labels/footer, and small #A3A3A3 markers. Its title starts at 60 px/1.08, weight 500, with −2.5 px tracking; highlights start at 28 px/1.4. The renderer scales long content to fit. Refer to [lib/card.tsx](../../../lib/card.tsx) for geometry and source behavior.

## Application rules, assets, and maintenance

Preserve the original Passage name, outlined mark, neutral palette, Inter hierarchy, landscape, and existing copy while extracting this direction. Do not import Folio’s warm paper field, accent-colored mark, sculptural book, Instrument Sans, or editorial ornament. Keep the product presentation calm and the shared content readable. Product claims remain bounded by the current implementation; the source phrase “full conversation” is recorded as existing copy, not a new promise of perfect media/tool fidelity.

| Asset | Files | Requirement/status |
| --- | --- | --- |
| Extracted identity poster | [SVG](passage-poster.svg), [PNG](passage-poster.png) | 1600 × 1300; proposed composition |
| Comparable share specimen | [SVG](passage-share-card.svg), [PNG](passage-share-card.png) | 1200 × 630; adapted comparison content |
| Existing mark geometry | [Native SVG](assets/marks/passage-mark.svg) | Reused geometry; not a redesign |
| Existing landscape | [PNG](assets/passage-landscape.png) | 1672 × 941 source image |
| Inter font inputs | [400](assets/fonts/inter-latin-400-normal.woff), [500](assets/fonts/inter-latin-500-normal.woff), [600](assets/fonts/inter-latin-600-normal.woff), [license](assets/fonts/inter-LICENSE.txt) | Local copies from the current font source |
| Rendering source | [build.ts](build.ts), [render-data.json](render-data.json) | Projection is checked against this specification |

See the [round README](README.md) for regeneration and the actual build/verification status. The extraction is an active candidate alongside Folio. Changes to the existing Passage system are outside this extraction request; canonical identity documents, final export sets, and product rollout wait for a complete decision.

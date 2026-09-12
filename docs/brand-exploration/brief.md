# Branding exercise: working brief

Status: the current **Passage** identity is accepted as the basis for canonical rollout. Updated September 12, 2026. The headline is **Your AI chats, worth sharing**, with no trailing period; the mark is **Open passage**, the split P. The user authorized a persistent identity guide and one-pager, then site and project README updates. The latest round-07 acceptance update supersedes earlier feedback and working assumptions.

## Purpose and origin

The product helps people share useful work they do with AI. The founder's motivation goes beyond attractive links: the questions, judgment, iteration, and discussion behind an outcome deserve to be a first-class artifact that other people can understand and build on.

The open-source analogy is a founding belief: as implementation becomes easier, making the process behind good work visible and usable becomes more valuable. This is a positioning thesis, not a claim that code has no value or a verified market-size claim.

Sharing should serve two people at once. The sharer should feel proud of the presentation and able to express their taste. The reader should understand the main ideas quickly and have access to the conversation behind them. Learning and building in public can create recognition, connection, and opportunity; those are motivations rather than guaranteed product outcomes.

## Project and current scope

A small open-source web service with a CLI and agent skill. It accepts public ChatGPT, Codex, and Claude conversation links, generates a concise title and highlights, lets the sharer review the result and select one of five curated card styles, and publishes a copyable link with a saved conversation and a link to the original.

The current product is implemented and verified locally. Hosted provider extraction and external social unfurls still need production validation. See [MVP plan](../MVP_PLAN.md), [verification](../archive/VERIFICATION.md), and [launch readiness](../archive/LAUNCH_READINESS.md).

Current facts:

- No accounts or payments in the first version.
- The only text input is the public conversation URL. Generated title and highlights are read-only.
- Style selection is remembered in the browser and fixed for each publication.
- The reader preserves successfully extracted message text and ordering; known media, tool, and artifact omissions are explicit.
- Published presentations are immutable and can become unavailable after confirmed removal of their public source.
- There is no public discovery feed, creator profile, or audience analytics.
- The same workflow is available through the browser, CLI, and agent skill.

Future ambitions supplied by the user: more control over sharing, a consistent personal brand, deeper customization, and a useful public trail of knowledge work. Own logos, colors, domains, editable summaries, collections, and account-based management are possible interpretations of that ambition, not agreed features.

Customer-facing touchpoints in this exercise: name, positioning, marketing copy, product terminology, landing page language, reader and sharing language, social images, reusable brand assets, and public project documentation. Applying the identity throughout the app or deploying it is a separate step.

## Audience and value

Primary audience: heavy AI adopters who also intentionally share their work in public. Includes AI engineers and technically fluent builders, plus people outside engineering who use AI deeply and care about how their thinking appears to an audience.

Use moment: after a useful AI collaboration, before sharing the result with an audience.

Reader audience: peers and curious outsiders deciding whether this idea is relevant, useful, and worth exploring.

Main tension: a long AI conversation asks a lot of an unfamiliar reader, while its default presentation gives the sharer limited expressive control. Useful thinking can be overlooked when its value is hard to see.

Working benefit hierarchy, pending user preference:

1. Pride and craft: put useful work into a presentation worth sharing.
2. Understanding: help a reader grasp the ideas at a glance.
3. Openness: keep the conversation behind the ideas accessible.
4. Recognition: support a recognizable trail of work over time.

Working category description: a publishing tool for AI conversations. Literal launch description: Turn a public ChatGPT, Codex, or Claude conversation into a styled share card, AI-generated highlights, and a readable saved conversation.

Alternatives include native provider share links, screenshots, manually written social posts or recaps, and general tools for custom link previews. The distinctive combination here is the introduction, visual presentation, and inspectable conversation, created in one small workflow.

Reasons to believe: review before publishing, five curated styles, content-specific highlights, source-linked saved text, and direct use from a browser or agent workflow.

## Initial strategic recommendation

Organizing idea: make the thinking behind good work legible and worth sharing.

Lead with the tangible benefit of sharing work with care. Let the open-work belief provide the deeper story. Treat future recognition and opportunity as a reason someone cares, without promising distribution or growth.

The artifact should work at three depths: a recognizable visual impression, a quick understanding of the main ideas, and a conversation someone can inspect. This is a proposed design principle.

Working primary emotion: pride in putting one's work into the world. Working character: thoughtful, capable, independent, generous, and precise. How expressive the product brand should be is still open.

A strong relationship to test in exploration is a distinctive product frame with flexible, expressive content styles. The tool's identity needs to remain recognizable while giving the shared work room.

Copy seeds for exploration, all provisional:

- Belief: The thinking is worth sharing.
- Benefit: Give your ideas a clear introduction.
- Supporting thought: Make the work behind your ideas easier to understand.
- Literal action: Paste a public AI conversation link. Review the highlights, choose a style, and publish your share link.

These are inputs to exploration, not interchangeable approved taglines.

## Language to test

The internal model is well defined in [CONTEXT.md](../CONTEXT.md). Customer language can be simpler without changing that model.

| Internal concept | Proposed customer language | Reason |
| --- | --- | --- |
| Conversation | Conversation; “AI conversation” on first mention | Clear across providers; “thread” can be tested in informal marketing |
| Source URL | Public conversation link | Explains the required input |
| Source | Original conversation | Makes provenance understandable |
| Provider | ChatGPT, Codex, or Claude as appropriate | Names the service directly |
| Snapshot | Saved conversation; conversation as shared | Describes the reader's content |
| Publication | Share or shared conversation | Familiar object language without requiring a coined noun |
| Generated preview text | AI summary; title and highlights | Distinguishes generated explanation from original messages |
| Card style | Style | Short and accurate within the picker |
| Social card | Share card | Names the visual artifact |
| Share URL | Share link | Familiar and actionable |

A branded object noun is optional. Evaluate ordinary sentences such as “Create a share,” “Copy link,” and “Read the conversation” alongside each candidate name. Do not rename code entities or change the glossary before agreeing the external language.

## Existing identity and assets

The present expression is quiet and friendly: white/charcoal, Inter, generous space, a mark made of overlapping rounded rectangles, and lines such as “Good conversations. Beautifully shared.” Existing language already supports clarity and care; the new brief adds a stronger thesis about the value of the thinking itself.

Five existing card styles have selected Midjourney artwork: Margin notes, Electric risograph, Maker’s workbench, Midnight observatory, and Friendly lab. See [artwork provenance](../../public/social-templates/README.md) and [template definitions](../../lib/social-templates.ts). They are existing product assets, not five proposed whole-brand identities.

Passage has useful associations with travel, text, and ideas moving between people. Its possible weaknesses are a literary emphasis and ambiguity about whether one is sharing an excerpt. Those are naming hypotheses to evaluate. No alternative names or domain availability have been checked yet.

## Dub: focused reference review

Reviewed September 11, 2026: [homepage](https://dub.co/), [brand kit](https://dub.co/brand), [Links](https://dub.co/links), and the creator solution page. The inspected product site is dub.co; the requested dub.com address could not be retrieved.

Observed facts:

- The current homepage leads with “Turn clicks into revenue” and describes a link attribution platform spanning short links, conversion tracking, and affiliate programs.
- Its brand kit favors a streamlined wordmark and black/white marketing identity.
- The name has a connection to the action of giving something a name.
- Dub Links makes customer expression concrete through branded domains and custom link previews.

Our interpretation: borrow the clarity of the outcome, concise naming, restraint of the frame, and visible product demonstration. Show customization through examples. The most relevant overlap is Dub Links and its creators/entrepreneurs audience. The current broader revenue-and-attribution story has a different emphasis from this project's useful knowledge work.

## Constraints and decisions

| Choice | Status | Current understanding |
| --- | --- | --- |
| Project and repository | Fixed | This project; context and exploration live under docs/ |
| Initial audience | Fixed for this brief | Heavy AI users who intentionally share work publicly |
| Initial workflow | Fixed current scope | Public link → generated highlights → style selection → share link and reader |
| No accounts/payments | Fixed current scope | Keep launch friction low |
| Open-source roots | Fixed motivation | Transparency, usability, and work others can build on |
| Product name | Fixed | Passage; explicitly accepted September 12, 2026 |
| Promise hierarchy | Working | Craft first, openness beneath; user preference pending |
| Primary emotion | Working | Pride; to be refined from user feedback |
| Product versus creator expression | Open | Restrained frame, expressive publisher, or technical tool |
| Domain, TLD, and acquisition budget | Open | No requirements or availability established |
| Logo, palette, type, imagery | Open | Existing assets are reference and reusable options |
| Language | Working | English, matching present product and this discussion |
| Accessibility | Fixed delivery requirement | Legible type, tested pairings, recognizable small mark |
| Final selection | Open | User acceptance or explicit delegated selection required |

Claims boundaries: current style selection supports “choose a style.” Full personal branding, comprehensive control, permanent archiving, complete media fidelity, authorship verification, audience growth, and a discovery network are not present capabilities. Open sharing does not itself grant readers a reuse license to every conversation's content.

## Pending interview and next stage

Three focused questions have been sent:

1. Should craft/personal expression, open thinking/reuse, or visibility/opportunity lead the story?
2. Should the product be distinctive and restrained, expressive and opinionated, or precise and technical?
3. What domain/budget, naming, visual, or association constraints should guide exploration?

After answers: reflect the resolved brief, develop at least three meaningfully different complete identities, and produce comparable SVG/PNG posters with native marks, copy, typography, color, imagery, and a real use example. Each remains proposed. Naming and obvious adjacent-product/domain checks will accompany exploration, with unverified availability labeled.

Iterate from concrete feedback. Only after acceptance or delegated selection should docs/brand-identity.md, the accepted export set, and an AGENTS.md pointer become canonical.

## Visual-first steering — September 11, 2026

The user requested 3–6 concrete visual directions before answering the interview choices, explicitly using both imagegen and Midjourney where appropriate. Four proposed complete directions are now in [round 01](round-01/README.md): Folio, Trace, Relay, and Commonplace. These are working names with adjacent existing uses, not a cleared naming shortlist. The unresolved interview choices are exploration dimensions, not blockers. Continue from visual feedback; no direction is accepted.

## Round 02 feedback — September 11, 2026

The user rejected Trace’s green, technical, precise/nerdy expression and Relay’s bold, in-your-face product branding. The product identity should be understated so the shareable artifact is the focus. Folio is the strongest initial preference, especially its sculptural book image; its mark needs work. Commonplace’s calm and plant-growing-from-book image also resonate. Both serif treatments are rejected.

Use simple, direct customer language: “AI chats,” “links worth sharing,” and “links you’ll be proud to share.” Impeccable’s typography playbook and installed font catalog inform five sans-serif systems. The current review is [round 02](round-02/README.md): refined Folio and Commonplace, plus Frame and Kindred, plus a fifth direction, Waymark, exploring breadcrumbs and an expanding public trail of learning. Recognition remains a motivation, not a guarantee of reach or a new product feature.

The user explicitly requested a quick desktop-only comparison tool; mobile support, accessibility implementation/audits, and full testing are outside this review’s scope. Earlier broad delivery requirements apply to an eventual accepted production identity, not this throwaway comparison surface. No full direction is accepted. Continue from visual feedback without restarting the intake interview.

## Round 03 feedback — September 11, 2026

The user strongly likes Folio’s Instrument Sans, warm paper/ink/ribbon palette, and conceptual book direction. Retain those elements and the Folio name. They reject Folio’s current icon. They also like Waymark’s public trail/breadcrumb concept but reject its current icon and remain uncertain about the Waymark name. Commonplace, Frame, and Kindred are dropped from the active comparison.

The next review is [round 03](round-03/README.md): Folio / Pages and Folio / Ribbon refine the liked Folio system; Waymark / Open trail refines the second concept; Along / Breadcrumbs tests a related name using Folio’s liked typography and palette. This is four proposed refinements, not a new broad branding exercise. Product branding stays subdued and the shared artifact remains the focus. The simple AI-chat descriptor is retained throughout.

The existing images and two font families are reused. New work concentrates on native marks, lockups, and composition, with Direction / Compare / Marks review views and Compare as the intended default. No naming availability research or final canonical exports are included in this round. Positive feedback on Folio’s type, colors, and concept does not accept either new logo or the complete identity.

## Round 04 feedback — September 11, 2026

The user keeps the first Folio / Pages base: Instrument Sans, the warm palette, sculptural book concept, and page-turn mark geometry. They want that icon rendered in Ribbon #B85540. Waymark, Along, and the separate Folio / Ribbon direction are dropped from the active comparison.

The user asks for three new directions that depart significantly from the Folio base, rather than minor icon or color changes. [Round 04](round-04/README.md) therefore compares the preserved baseline with Index (content-led editorial reference, no decorative hero), Cut paper (tactile collage and personal expression), and After hours (warm dark atmosphere with a bright cream share). All four retain Folio, Instrument Sans, and the page-turn geometry; the differences are in medium, hierarchy, composition, atmosphere, and the shared artifact’s presentation.

The simple descriptor remains “Turn your AI chats into links you’ll be proud to share.” Product branding stays subdued. The review uses Compare / Direction / Share cards and remains a quick desktop exploration. The continued request for alternatives leaves the complete identity unselected; do not create canonical brand documents, final favicon sets, or an AGENTS.md identity pointer yet.

## Round 05 feedback — September 11, 2026

The user rejects Index, Cut paper, and After hours and keeps the original Folio direction. They ask to extract the current active homepage’s existing Passage name and visual style as the second identity. [Round 05](round-05/README.md) therefore compares retained Folio with current Passage; it does not introduce another redesign of Passage or reopen the discarded directions.

Folio retains Instrument Sans, the warm Paper/Ink/Ribbon palette, sculptural book imagery, and Ribbon-colored page-turn mark. Passage preserves the current white/charcoal interface, Inter, overlapping outlined pages, impressionistic landscape, and exact homepage copy. The two comparison cards use the same illustrative content; Passage’s version is a native adaptation of the existing unthemed white/Inter layout, not a screenshot. Its live homepage example still has the source-defined “Make room for the unexpected” title.

This remains a quick desktop comparison with no product code changes or canonical brand acceptance. The final identity is still open between the two candidates. Preserve the distinction between recorded current Passage behavior and proposed Folio expression when refining further.

## Round 06 feedback — September 11, 2026

The user asks for two hybrids combining Passage’s color scheme, typography, and general direction with Folio’s name and copy. Original Folio and original Passage remain unchanged, producing four options in [round 06](round-06/README.md).

Folio / Landscape is the closest verbal swap: Folio’s headline, descriptor, mantra, creation label, and specimen branding in Passage’s centered Inter/white/charcoal landscape presentation, with the existing outlined-page geometry. Folio / Open page uses the same neutral Inter and painted-lake world, but pairs it with Folio’s retained page-turn silhouette in Charcoal and a left-aligned introduction beside a larger white share. Both hybrids keep the landscape substantial and carry no red/rust accent.

The specimen content stays constant across the four options. Hybrids use Folio and ordinary conversation/share labels throughout; original Passage keeps its name and copy. These remain proposals under `docs/brand-exploration`, not current project requirements, and no canonical identity is accepted. Continue the quick desktop comparison without changing application files or reopening discarded directions.

## Round 07 feedback — September 12, 2026

Historical initial feedback for this round; the acceptance update below records the current name and headline.

The user selects Passage alone and drops original Folio, Folio / Landscape, and Folio / Open page from the active review. [Round 07](round-07/README.md) refines that direction instead of comparing the four again.

Accepted copy changes for the preview:

- Headline: **Your slop, worth sharing** — no trailing period; it may break after the comma.
- Descriptive line: **Turn your AI chats into links you’ll be proud to share** — no trailing period.
- Remove the announcement entirely.
- Main creation action: **Create a passage**.
- Customer-facing name for the shareable artifact: **passage**, plural **passages**. The example label is **Example passage** and its reader action is **Read the passage**.

The [glossary](../CONTEXT.md) now requires that customer noun while preserving the internal Publication concept. The sample title **A calmer way to build with AI** and the three existing highlights stay unchanged. Keep the self-aware headline as one deliberate moment, paired with the calm visual system; do not spread “slop” through controls or make it the default label for customer work.

Retain Inter 400/500/600, White #FFFFFF, Charcoal #171717, Muted #737373, and the painted landscape. The existing footer mantra **Good conversations deserve to travel.** carries forward. A new icon is being explored and remains provisional. The product-name question **Passage** versus **Passages** is still open; recommending singular Passage is not user acceptance of the final name.

This remains the established quick desktop brand-preview exercise. The selected direction and exact copy do not constitute acceptance of an unreviewed icon or complete canonical identity. Production UI, final export requirements, and any eventual rollout are separate from this revision.

## Round 07 acceptance update — September 12, 2026

The user explicitly accepts **Passage** as the brand name and replaces the headline with **Your AI chats, worth sharing**, without a trailing period. It may break after the comma. This supersedes the initial round-07 headline and settles the product name.

The current rationale is: **A clear promise in a calm visual system: Inter, white and charcoal, and a painted landscape give each passage room.** Keep the voice direct, clear, and welcoming. All other approved copy, the lowercase artifact noun, typography, palette, and landscape remain as recorded in the [round-07 specification](round-07/passage.md).

The user subsequently requested a persistent brand identity document and saved one-pager, then application across the site and project README. This authorizes the current **Passage** direction, including the **Open passage** split-P icon, as the accepted basis for canonical identity and rollout. The [canonical guide](../brand-identity.md) is being prepared; round-07 artifacts remain the exploration record.

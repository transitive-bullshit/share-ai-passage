# Passage brand identity

**Accepted September 12, 2026.** This is the source of truth for Passage’s customer-facing identity. It supersedes the working directions in [brand exploration](brand-exploration/brief.md). The accepted direction combines the Passage name, Open passage mark, Inter typography, neutral interface, and painted landscape.

[Brand one-pager](brand-assets/brand-identity-onepager.png) · [Editable one-pager](brand-assets/brand-identity-onepager.svg) · [Logo](brand-assets/logo-wordmark.svg) · [Hero image](brand-assets/passage-landscape.png)

## Identity and copy

| Role | Accepted wording |
| --- | --- |
| Brand name | Passage |
| Headline | Your AI chats, worth sharing |
| Descriptive one-liner | Turn your AI chats into links you’ll be proud to share |
| Main CTA | Create a passage |
| Mantra / footer | Good conversations deserve to travel. |
| Artifact | a passage; plural passages |
| Reader action | Read the passage |
| Character | Clear. Thoughtful. Welcoming. |

Preserve the headline and descriptor without a trailing period. The headline may break after the comma: **Your AI chats,** / **worth sharing**. Use title case for the brand and lowercase for the artifact. **Publication** remains the internal domain term; customer-facing copy uses **passage**. See the [glossary](CONTEXT.md).

The production domain is **share-ai-passage.com**, purchased by the owner on September 12, 2026. The intended production URL is **https://share-ai-passage.com**. This records the owner’s purchase and intended use; DNS, hosting association, and HTTPS activation are deployment work. The application continues deriving its origin from its runtime configuration. See [production guidance](PRODUCTION.md).

## Purpose, audience, and promise

Passage helps people share useful work they do with AI. Heavy AI users and builders are the primary audience; their peers are the readers. A long conversation can hide the idea that makes it worth opening. A concise introduction, thoughtful presentation, and saved conversation give both people a better starting point.

The promise is confidence in sharing: a link someone feels proud to send, with enough context for a reader to understand its value. Grounded highlights, a preview before publication, and an original-source link support that promise. Sharing one’s process and learning in public are motivations, not guarantees of reach or growth.

The product currently accepts public ChatGPT, Codex, and Claude conversation links, generates a title and optional highlights that the sharer can refine before publication, offers five curated card styles, and publishes a passage with saved conversation text and its original source. Published wording stays fixed. Browser, CLI, and agent workflows serve this same purpose. Current scope and limits live in the [MVP plan](MVP_PLAN.md); the brand does not add accounts, collections, or custom themes.

**Creative idea:** Conversations worth sharing. **Rationale:** A clear promise in a calm visual system: Inter, white and charcoal, and a painted landscape give each passage room. Keep the service branding subordinate to the work being shared.

## Mark and wordmark

The accepted **Open passage** mark is a solid split P. A vertical spine and separate open bowl leave a narrow channel through the letter, connecting the name to an opening. Its native geometry is two filled paths in a 32 × 32 viewBox; the visible shape occupies coordinates 4–28. The source is [logo-mark.svg](brand-assets/logo-mark.svg).

Use the mark with the **Passage** wordmark in navigation, the footer, README artwork, and brand materials. Use the mark alone for favicons and compact repeated branding. Lettering is Inter 600 with tight tracking; the exported wordmark has outlined lettering for portability. Keep at least one quarter of the mark’s width clear around a standalone logo. In a lockup, the gap between icon and lettering is about one third of the icon width.

The ordinary site mark is 28 px. The smallest intended mark is 16 px; retain the open channel and use the supplied favicon at small sizes. Use Charcoal on light surfaces and the [inverse mark](brand-assets/logo-mark-inverse.svg) on dark surfaces. Favicons place the white mark on a rounded Charcoal square. Preserve the geometry, proportions, and single-color treatment.

The canonical path data and common site copy live in [lib/brand.ts](../lib/brand.ts); [BrandMark](../components/brand-mark.tsx) applies the same geometry in the interface and the shared [social card](../lib/social-card.tsx), used for HTML previews and WebP images. The asset build uses that path data for exported masters and favicons.

## Color and typography

| Role               | Value   | Use                                   |
| ------------------ | ------- | ------------------------------------- |
| White              | #FFFFFF | Main page and passage surface         |
| Charcoal           | #171717 | Primary text, logo, and CTA           |
| Muted              | #737373 | Descriptive copy and secondary labels |
| Secondary surface  | #F5F5F5 | Quiet supporting panels               |
| Border             | #E8E8E8 | Hairlines and form boundaries         |
| Secondary headline | #777777 | “worth sharing” on White              |

Use the existing semantic CSS tokens. Brand controls are neutral. Error and success colors describe state; colors in the landscape belong to the artwork. The five curated passage styles may use their own palettes and content typography while retaining the same Passage mark and voice.

Use **Inter 400** for body copy and highlights, **500** for headings/actions, and **600** for the wordmark. The site headline scales to 68 px with 1.055 line-height and tight tracking; supporting copy is 17 px/1.75. Keep the existing responsive scale, generous white space, and pill-shaped primary form. The gray second headline line creates hierarchy without another font. The one-pager scales this system to its larger canvas.

Local Inter WOFF inputs and the [license](brand-assets/fonts/inter-LICENSE.txt) are included in the asset set. The application uses its existing Fontsource imports. System sans-serif is the fallback.

## Imagery and composition

The [painted landscape](brand-assets/passage-landscape.png) is the accepted hero: a soft impressionistic lake with water lilies, trees, and distant misty hills. Its broad, calm setting frames a white example passage. Keep enough of the landscape visible to retain that sense of place; its purpose is to frame readable work.

Use a centered introduction, clear descriptor, public-link input, and **Create a passage** CTA. The announcement above the headline is removed. The homepage header omits the creation CTA; it remains available on reader pages. Below-fold sections use headings without eyebrow copy. Provider labels use locally stored ChatGPT, Codex, and Claude logos from `public/providers/`. The landscape showcase follows the form. The social image is composed specifically for 1200 × 630; individual passage cards lead with their content rather than the product headline.

The landscape is the existing 1672 × 941 application image, retained unchanged. Its SHA-256 is `d4618cc38cadbc1d14f9e36ae168ff8d648093e509361c8a709303086d83989a`. The exact original generation prompt was not recovered; see [historical provenance](brand-exploration/round-05/assets/provenance.md). No new imagery was generated for this identity.

## Voice and product language

Write plainly, warmly, and with respect for the work being shared. Name the action and its result. Use **conversation** for the AI exchange, **passage** for the shareable artifact, and **link** for its address. Keep process stages explicit: **Preparing…**, **Review your passage**, **Publish passage**, and **Your passage is published**.

| Use | Purpose |
| --- | --- |
| Create a passage | Begin the creation workflow |
| Paste a public chat link… | Explain the required input |
| Preview first. Publish when you’re ready. | Make the publication boundary clear |
| Highlights | Label the generated introduction |
| Example passage | Label illustrative product content |
| Read the passage | Open the published artifact |
| Copy passage link | Copy its address |

The editor uses “Review your passage” without a period. Style choices show visual thumbnails with accessible names, without visible theme names or preview captions. Title guidance is roughly 10 words at most (usually 4–7), leading with the most distinctive terms; highlights recommend 100 characters. These are soft recommendations, with hard caps of 600 title characters and 1,000 characters per highlight. Sharers can add or remove up to three highlights; blank highlights and empty highlights sections are omitted.

Share card titles occupy at most two lines, with an ellipsis when the title overflows. Keep the full title in the saved summary and reader. Card footers show the source attribution or example mantra. Reserve **Read the passage** for the interactive link that opens a published passage; omit it from card templates and their exported images.

Margin notes, Electric risograph, Maker’s workbench, and Friendly lab use 16 px footer text with the footer rule at y = 566 on the 1200 × 630 canvas. Midnight observatory uses 14 px text with its rule at y = 558.

The one-pager’s example is **A calmer way to build with AI**, with “Start with a clear question.”, “Make the tradeoffs visible.”, and “Keep the reasoning close.” These are illustrative design content, not a required title or fixed highlights in the product. Preserve the existing live example when applying the identity.

## Assets and maintenance

| Asset | Files | Format |
| --- | --- | --- |
| Mark | [Charcoal](brand-assets/logo-mark.svg), [inverse](brand-assets/logo-mark-inverse.svg) | Native SVG |
| Wordmark | [Charcoal](brand-assets/logo-wordmark.svg), [inverse](brand-assets/logo-wordmark-inverse.svg) | Outlined native SVG |
| Favicon | [SVG](brand-assets/favicon.svg), [ICO](brand-assets/favicon.ico) | ICO includes 16, 32, 48 px |
| Social image | [PNG](brand-assets/social-preview.png), [SVG](brand-assets/social-preview.svg) | 1200 × 630 |
| One-pager | [PNG](brand-assets/brand-identity-onepager.png), [SVG](brand-assets/brand-identity-onepager.svg) | 1600 × 1300 |
| Example passage | [PNG](brand-assets/example-passage.png), [SVG](brand-assets/example-passage.svg) | 1200 × 630 |
| Hero | [PNG](brand-assets/passage-landscape.png) | 1672 × 941 |
| Build and inputs | [build.ts](brand-assets/build.ts), [brand-data.json](brand-assets/brand-data.json), [fonts](brand-assets/fonts) | Project-local sources |

Regenerate from the repository root:

```sh
pnpm exec tsx docs/brand-assets/build.ts
```

The build uses tsx and the development-only Resvg/Satori dependencies; OpenType is resolved through Satori. Application cards use the separate Takumi renderer. It checks the JSON render projection and shared site copy against this guide. SVG one-pager/social outputs retain editable text with embedded font and image inputs; PNG output outlines the same fonts. The command also updates the application favicon files and `public/brand/social-preview.png`.

The README shows two clearly labeled illustrative passages, using Margin notes and Midnight observatory. Their shared marketing conversation lives in [marketing-examples.ts](../lib/marketing-examples.ts); the same card renderer exports their WebP images. These examples ship with the app and do not depend on production database records or provider share URLs. Their footer uses the brand mantra. See [maintenance instructions](../contributing.md#marketing-examples).

**Export verification (September 12, 2026):** Actual PNG dimensions and all three embedded ICO entries were checked. Application icons and social artwork are byte-identical to their canonical masters. SVGs have no external asset references; standalone copies reproduced identical PNGs using only embedded fonts and artwork with system fonts disabled. All PNG compositions and the marks at 16–96 px were visually inspected. The live homepage was checked at desktop and 375 px, and the new favicon, social image, metadata, and example-card routes were verified. After integrating the Takumi renderer, `pnpm test` passed all 407 tests with a migrated disposable local PostgreSQL database, including 37 card/image-route tests, and `pnpm build` passed. Both example readers and their 1200 × 630 WebP routes returned 200 from the local production build; unknown examples returned 404. The exported images and the same templates rendered as HTML in Chrome were visually checked for font, artwork, and text fit.

Apply this guide to site UI, marketing, README content, social assets, and other public touchpoints. Keep routine copy and layouts within the accepted system. Changes to the name, core copy, mark, or visual language are brand decisions. Earlier directions remain [historical exploration](brand-exploration/brief.md).

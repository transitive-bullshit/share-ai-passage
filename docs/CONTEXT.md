# Conversation sharing context

A conversation-sharing service makes public AI conversations more engaging to share through a concise, content-specific social card and a readable saved conversation. Read [MVP_PLAN.md](./MVP_PLAN.md) for product scope and implementation instructions.

## Language

**Conversation**: The exchange of messages being shared from an AI service. Use this for the content itself; use source, snapshot, or publication when referring to its public origin, saved capture, or published presentation. _Avoid_: Chat or thread as separate resource names.

**Provider**: The original AI service hosting a conversation; ChatGPT (including public Codex chats) and Claude are the MVP providers. _Avoid_: Model (the provider is distinct from the model used to generate previews).

**Source**: A particular public conversation share at its provider, identified by its canonical source URL. Several snapshots and publications can refer to the same source; distinct public shares are distinct sources even if they expose the same underlying conversation. _Avoid_: Publication, proxied chat, short link.

**Source URL**: The supported public share address used to fetch a source and to open the original conversation. It is not a private chat URL or a workspace-restricted share.

**Snapshot**: The saved, normalized conversation captured from a source at a particular time. A snapshot is immutable even if the original conversation later changes. _Avoid_: Live mirror, synced conversation.

**Message**: An ordered contribution to a snapshot, with its original role and content blocks. An assistant message may identify itself as commentary or a final answer when the source makes that distinction.

**Content block**: One ordered piece of a message, such as text or an explicit omission of known media, a tool interaction, or an artifact. An omission records what is missing without presenting a placeholder as original conversation text.

**Preview**: An automatically generated concise title and highlights describing a snapshot. The sharer reviews the preview before publishing it; its text is not editable.

**Highlight**: A short, grounded summary of a main idea in the conversation, written by the preview model. It is a paraphrase rather than a quotation attributed to a speaker.

**Draft**: A prepared snapshot and generated preview awaiting publication, available for the sharer to review with a chosen card style. It has no public share URL of its own. _Avoid_: Unpublished publication, editable conversation.

**Publication**: An independently addressable share of one snapshot with a fixed reviewed title, highlights, and card style; product copy may call it a “passage.” Repeated publication of an identical presentation reuses its share URL while that publication remains available. _Avoid_: Source, proxied chat, redirect, editable link.

**Share URL**: The public address of a publication on this service. It opens the reader and supplies the publication's social metadata.

**Card style**: A curated visual design for a social card, independent of the conversation and generated preview text. The chosen style is fixed when a publication is created. _Avoid_: Preview text, conversation theme.

**Card preview**: The visual rendering shown to the sharer before publication, combining the generated preview text with the chosen card style. _Avoid_: Preview when the distinction between text and image matters.

**Social card**: The typeset image representing a publication when its share URL is posted elsewhere. Its title and highlights describe the conversation, with subordinate service branding.

**Reader**: The public page displaying a publication's saved conversation, its preview, and a prominent link to the source.

**Sharer**: The person creating a publication by submitting a source URL, reviewing its generated preview, and publishing it. An agent may carry out this workflow on their behalf. The MVP has no accounts or assertion that the sharer owns the source.

**Availability check**: A check that the source remains publicly accessible. It does not refresh a publication's snapshot, title, or highlights. _Avoid_: Sync, refresh content.

**Unavailable source**: A source confirmed to have been removed or made inaccessible to public readers. A temporary network error, challenge, or ambiguous parsing failure is not confirmation.

**Disabled publication**: A publication whose conversation, preview, and social card are no longer served because its source is confirmed unavailable. Copies previously cached by other platforms are outside the service's control.

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

**Preview**: A concise title and highlights describing a snapshot, generated initially and editable by the sharer before publication.

**Highlight**: A short, grounded summary of a main idea in the conversation, generated initially and refinable during draft review. It is a paraphrase rather than a quotation attributed to a speaker.

**Draft**: A prepared snapshot and preview awaiting publication, with title and highlights the sharer can edit and a card style they can choose. It has no public share URL of its own. _Avoid_: Unpublished publication, editable conversation.

**Publication**: An independently addressable share of one snapshot with a fixed reviewed title, highlights, and card style; customer-facing copy must call it a “passage.” Repeated publication of an identical presentation reuses its share URL while that publication remains available. _Avoid_: Source, proxied chat, redirect, editable link.

**Passage**: The customer-facing name for a publication: a shareable presentation of a saved AI conversation with its title and highlights. Use lowercase for the artifact (“Create a passage” and “Read the passage”); several artifacts are “passages.” _Avoid_: Publication in customer-facing copy.

**Share URL**: The public address of a publication on this service. It opens the reader and supplies the publication's social metadata.

**Card style**: A curated visual design for a social card, independent of the conversation and preview text. The chosen style is fixed when a publication is created. _Avoid_: Preview text, conversation theme.

**Card preview**: The visual rendering shown to the sharer before publication, combining the current preview text with the chosen card style. _Avoid_: Preview when the distinction between text and image matters.

**Social card**: The typeset image representing a publication when its share URL is posted elsewhere. Its title and highlights describe the conversation, with subordinate service branding.

**Reader**: The public page displaying a publication's saved conversation, its preview, and a prominent link to the source.

**Sharer**: The person creating a publication by submitting a source URL, reviewing or refining its generated preview, and publishing it. An agent may carry out this workflow on their behalf. The MVP has no accounts or assertion that the sharer owns the source.

**Availability check**: A check that the source remains publicly accessible. It does not refresh a publication's snapshot, title, or highlights. _Avoid_: Sync, refresh content.

**Unavailable source**: A source confirmed to have been removed or made inaccessible to public readers. A temporary network error, challenge, or ambiguous parsing failure is not confirmation.

**Disabled publication**: A publication marked unavailable because its source is confirmed unavailable. It is excluded from newly generated readers and social cards; previously cached representations can remain available until revalidation, and copies cached by other platforms are outside the service's control.

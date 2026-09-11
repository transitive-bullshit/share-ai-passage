# Conversation sharing context

A conversation-sharing service makes public AI conversations more engaging to share through a concise, content-specific social card and a readable saved conversation. Read [MVP_PLAN.md](./MVP_PLAN.md) for product scope and implementation instructions.

## Language

**Provider**: The original AI service hosting a conversation; ChatGPT (including public Codex chats) and Claude are the MVP providers. _Avoid_: Model (the provider is distinct from the model used to generate previews).

**Source**: A particular public conversation share at its provider, identified by its canonical source URL. Several snapshots and publications can refer to the same source. _Avoid_: Publication, short link.

**Source URL**: The supported public share address used to fetch a source and to open the original conversation. It is not a private chat URL or a workspace-restricted share.

**Snapshot**: The saved, normalized conversation captured from a source at a particular time. A snapshot is immutable even if the original conversation later changes. _Avoid_: Live mirror, synced conversation.

**Message**: An ordered turn in a snapshot, with its original speaker and supported content. Omitted media or artifacts are represented explicitly rather than silently disappearing.

**Preview**: An automatically generated concise title and highlights describing a snapshot. The sharer reviews the preview before publishing it; its text is not editable.

**Highlight**: A short, grounded summary of a main idea in the conversation, written by the preview model. It is a paraphrase rather than a quotation attributed to a speaker.

**Publication**: An immutable, independently addressable share of one snapshot with its reviewed title and highlights. Repeated publishing of the same preview reuses its share URL. _Avoid_: Source, redirect, editable link.

**Share URL**: The public address of a publication on this service. It opens the reader and supplies the publication's social metadata.

**Social card**: The typeset image representing a publication when its share URL is posted elsewhere. Its title and highlights describe the conversation, with subordinate service branding.

**Reader**: The public page displaying a publication's saved conversation, its preview, and a prominent link to the source.

**Sharer**: The person creating a publication by submitting a source URL, reviewing its generated preview, and publishing it. An agent may carry out this workflow on their behalf. The MVP has no accounts or assertion that the sharer owns the source.

**Availability check**: A check that the source remains publicly accessible. It does not refresh a publication's snapshot, title, or highlights. _Avoid_: Sync, refresh content.

**Unavailable source**: A source confirmed to have been removed or made inaccessible to public readers. A temporary network error, challenge, or ambiguous parsing failure is not confirmation.

**Disabled publication**: A publication whose conversation, preview, and social card are no longer served because its source is confirmed unavailable. Copies previously cached by other platforms are outside the service's control.

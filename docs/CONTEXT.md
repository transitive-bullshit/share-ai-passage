# Conversation sharing context

A conversation-sharing service makes public AI conversations more engaging to share through a concise, content-specific social card and a readable saved conversation. Read [MVP_PLAN.md](./MVP_PLAN.md) for product scope and implementation instructions.

## Language

**Provider**:
The original AI service hosting a conversation; ChatGPT and Claude are the MVP providers.
_Avoid_: Model (the provider is distinct from the model used to suggest previews).

**Source**:
A particular public conversation share at its provider, identified by its canonical source URL. Several snapshots and publications can refer to the same source.
_Avoid_: Publication, short link.

**Source URL**:
The supported public share address used to fetch a source and to open the original conversation. It is not a private chat URL or a workspace-restricted share.

**Snapshot**:
The saved, normalized conversation captured from a source at a particular time. A snapshot is immutable even if the original conversation later changes.
_Avoid_: Live mirror, synced conversation.

**Message**:
An ordered turn in a snapshot, with its original speaker and supported content. Omitted media or artifacts are represented explicitly rather than silently disappearing.

**Preview suggestion**:
An automatically proposed concise title and excerpt for a snapshot. It is a starting point for the sharer's choices, not the published preview.

**Excerpt**:
A contiguous passage from one saved message, attributed to its speaker. An excerpt is selected or trimmed original text, not an invented quote or a rewritten summary.

**Publication**:
An immutable, independently addressable share of one snapshot with its chosen title and excerpt. Different publications may reference the same snapshot without changing each other's preview.
_Avoid_: Source, redirect, editable link.

**Share URL**:
The public address of a publication on this service. It opens the reader and supplies the publication's social metadata.

**Social card**:
The typeset image representing a publication when its share URL is posted elsewhere. Its title and attributed excerpt describe the conversation, with subordinate service branding.

**Reader**:
The public page displaying a publication's saved conversation, its preview, and a prominent link to the source.

**Sharer**:
The person creating a publication by submitting a source URL and choosing a preview. The MVP has no accounts or assertion that the sharer owns the source.

**Availability check**:
A check that the source remains publicly accessible. It does not refresh a publication's snapshot, title, or excerpt.
_Avoid_: Sync, refresh content.

**Unavailable source**:
A source confirmed to have been removed or made inaccessible to public readers. A temporary network error, challenge, or ambiguous parsing failure is not confirmation.

**Disabled publication**:
A publication whose conversation, excerpt, and social card are no longer served because its source is confirmed unavailable. Copies previously cached by other platforms are outside the service's control.

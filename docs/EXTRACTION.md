# Public conversation extraction

Supported routes and fetch rules live in [urls.ts](../lib/providers/urls.ts) and [safe-fetch.ts](../lib/providers/safe-fetch.ts); [provider dispatch](../lib/providers/index.ts) selects the parser. Adapters return the [shared message model](MESSAGE_MODEL.md) and distinguish available, confirmed unavailable, and inconclusive results.

## Supported sources

| Format | Public URL | Anonymous upstream endpoint |
| --- | --- | --- |
| ChatGPT | `https://chatgpt.com/share/<UUID>` | `/backend-api/share/<UUID>` |
| ChatGPT message post | `https://chatgpt.com/s/t_<32 hexadecimal characters>` | Public `/s/t_<ID>` HTML page |
| Codex, hosted by ChatGPT | `https://chatgpt.com/s/cx_<32 hexadecimal characters>` | `/backend-api/wham/shared_threads/cx_<ID>`, then a signed OpenAI download redirect |
| Claude | `https://claude.ai/share/<UUID>` | `/api/chat_snapshots/<UUID>?rendering_mode=messages&render_all_tools=true` |

These first-party public-share endpoints are undocumented external interfaces. Their accessibility and payloads can change. Private, organization-restricted, and artifact-only links are unsupported.

Accept exact HTTPS provider hosts. Canonicalize a trailing slash and hexadecimal ID case; discard copied queries and fragments. Reject credentials, unusual ports, private routes, and arbitrary download URLs. Resolve and pin a public IP for every upstream connection.

Codex downloads may follow up to two redirects within the `*.oaiusercontent.com` domain family. Regional hosts, storage paths, signing parameters, and MIME labels vary; validate the origin and conversation payload instead of treating observed examples as fixed formats. Keep signed URLs in memory only. All hops share one 15-second deadline and a 5 MiB wire/decompressed body cap.

## Forking Passage links

Preparation also accepts `https://www.share-ai-passage.com/<provider>/<publication UUID>`, the apex host, and reader links on the configured application origin. Providers are `chatgpt` and `claude` (Codex uses `chatgpt`). Copied queries/fragments and a trailing slash are ignored; credentials, untrusted hosts, production HTTP/custom ports, and non-reader paths are rejected.

These inputs bypass provider fetching, freshness reuse, and AI generation. Look up the available publication in the current database and issue a 24-hour draft bound to its immutable snapshot and reviewed preview. Preserve its card style and original provider source URL. No network request is made to the submitted Passage URL; a deployment without that record returns not found. Missing or disabled passages cannot be forked.

The fork shares saved conversation content but publishes independently, including when text/style are unchanged. Its fingerprint includes the parent publication, so repeated publication of the same fork is idempotent. Forking a fork still retains the provider source URL. Source removal disables all related publications and invalidates their drafts through the existing source generation checks.

## Parsing and availability

- ChatGPT message posts read the inert React Router reference table from the public page, require matching post identity and public/readable permissions, and extract ordered `message_slice` attachments through the shared ChatGPT message parser. Only exposed messages are imported; a post may contain a single answer. Other attachment formats, malformed serialization, and missing posts remain inconclusive. No scripts execute and no additional page resources are fetched.
- ChatGPT reads ordered `linear_conversation` messages and excludes root-only or explicitly hidden nodes.
- Codex reads the versioned `turns[].items` snapshot, preserving visible user/agent messages, source-provided phases, and public summaries. Parser v4 retains readable user, viewed, and generated images, including `codex:shared-asset/<asset ID>`. Download these through `/backend-api/wham/shared_threads/<share ID>/assets/<asset ID>` with the same OpenAI CDN redirect boundary. Published reasoning summaries remain separate so the reader can collapse them. An unphased agent message remains unphased. Unknown versions or malformed/unknown items are inconclusive.
- Claude reads public `chat_messages` in provider order, including exposed structured text/tool blocks. Explicit upstream truncation is rejected.
- Preserve supported text and known omissions. Reject an empty/unreadable conversation or more than 1 MiB of normalized message JSON. Never execute provider HTML.

Preparation captures exposed HTTPS image URLs in structured image blocks and Markdown across supported providers. Private file pointers and count-only images remain omissions. Image nodes inside fenced code and ordinary links are not downloads. Resolve and pin public DNS for every image hop; reject credentials, custom ports, HTTP and private addresses. Codex shared assets may redirect only to OpenAI storage; other HTTPS images may follow up to two public HTTPS redirects. All image downloads share a 20-second deadline.

Decode still PNG, JPEG, WebP and GIF within 40 million pixels, then store lossless WebP in private R2 under an immutable source/content-hash key. Limit each input/output to 10 MiB, the conversation to 20 distinct references and source downloads to 50 MiB. Inaccessible, invalid and unsupported images retain omission markers; a download deadline or storage failure fails preparation for retry. Provider references and download signing parameters are transient. Snapshot content contains only saved image hashes, dimensions and internal object keys; Markdown image destinations become local hash references without changing their alt text or summary projection. Availability checks do not download or store images.

Older parser captures that predate image support bypass freshness reuse on the next provider import. Existing publications and Passage forks retain their immutable snapshots; reimport the provider URL to create a passage with captured images. No database migration is needed for the new message JSON fields.

Only exact provider-specific removal signatures classify a source as unavailable: ChatGPT's shared-conversation-deleted JSON, Codex's initial API `Share not found` JSON, or Claude's snapshot-not-found JSON. See the [parser implementations](../lib/providers/) for exact predicates. Generic 401/403/404 responses, download failures, HTML shells, challenges, changed schemas, 429s, 5xx responses, and timeouts remain inconclusive.

## Evidence and validation

[Archived observations](archive/EXTRACTION.md) record real local ChatGPT, Codex, and Claude checks from September 10–11, 2026, including the regional Codex redirect regression and missing-source signatures. A nonexistent share demonstrates a response shape, not deletion of a formerly available source. Hosted extraction remains a [release check](MVP_PLAN.md#remaining-work).

[Provider fixtures](../tests/providers/fixtures/) contain sanitized response structures; malformed-response, redirect, and size-limit cases also use synthetic inputs. Those tests establish parser/fetch behavior without live provider or model requests. Follow the [testing guidelines](testing.md); live checks are separate from the committed suite.

# Public conversation extraction

Supported routes and fetch rules live in [urls.ts](../lib/providers/urls.ts) and [safe-fetch.ts](../lib/providers/safe-fetch.ts); [provider dispatch](../lib/providers/index.ts) selects the parser. Adapters return the [shared message model](MESSAGE_MODEL.md) and distinguish available, confirmed unavailable, and inconclusive results.

## Supported sources

| Format | Public URL | Anonymous upstream endpoint |
| --- | --- | --- |
| ChatGPT | `https://chatgpt.com/share/<UUID>` | `/backend-api/share/<UUID>` |
| Codex, hosted by ChatGPT | `https://chatgpt.com/s/cx_<32 hexadecimal characters>` | `/backend-api/wham/shared_threads/cx_<ID>`, then a signed OpenAI download redirect |
| Claude | `https://claude.ai/share/<UUID>` | `/api/chat_snapshots/<UUID>?rendering_mode=messages&render_all_tools=true` |

These first-party public-share endpoints are undocumented external interfaces. Their accessibility and payloads can change. Private, organization-restricted, and artifact-only links are unsupported.

Accept exact HTTPS provider hosts. Canonicalize a trailing slash and hexadecimal ID case; discard copied queries and fragments. Reject credentials, unusual ports, private routes, and arbitrary download URLs. Resolve and pin a public IP for every upstream connection.

Codex downloads may follow up to two redirects within the `*.oaiusercontent.com` domain family. Regional hosts, storage paths, signing parameters, and MIME labels vary; validate the origin and conversation payload instead of treating observed examples as fixed formats. Keep signed URLs in memory only. All hops share one 15-second deadline and a 5 MiB wire/decompressed body cap.

## Parsing and availability

- ChatGPT reads ordered `linear_conversation` messages and excludes root-only or explicitly hidden nodes.
- Codex reads the versioned `turns[].items` snapshot, preserving visible user/agent messages, source-provided phases, and public summaries. Unknown versions or malformed/unknown items are inconclusive.
- Claude reads public `chat_messages` in provider order, including exposed structured text/tool blocks. Explicit upstream truncation is rejected.
- Preserve supported text and known omissions. Reject an empty/unreadable conversation or more than 1 MiB of normalized message JSON. Never execute provider HTML or fetch attached media.

Only exact provider-specific removal signatures classify a source as unavailable: ChatGPT's shared-conversation-deleted JSON, Codex's initial API `Share not found` JSON, or Claude's snapshot-not-found JSON. See the [parser implementations](../lib/providers/) for exact predicates. Generic 401/403/404 responses, download failures, HTML shells, challenges, changed schemas, 429s, 5xx responses, and timeouts remain inconclusive.

## Evidence and validation

[Archived observations](archive/EXTRACTION.md) record real local ChatGPT, Codex, and Claude checks from September 10–11, 2026, including the regional Codex redirect regression and missing-source signatures. A nonexistent share demonstrates a response shape, not deletion of a formerly available source. Hosted extraction remains a [release check](MVP_PLAN.md#remaining-work).

[Provider fixtures](../tests/providers/fixtures/) contain sanitized response structures; malformed-response, redirect, and size-limit cases also use synthetic inputs. Those tests establish parser/fetch behavior without live provider or model requests. Follow the [testing guidelines](testing.md); live checks are separate from the committed suite.

# Public extraction evidence

Verified locally on 2026-09-10 with ordinary anonymous server-side HTTPS requests, followed by executions of the actual TypeScript adapters. No provider credentials, cookies, browser automation, copied sessions, challenge solving, or external extraction service were used.

**Local extraction passed for both providers. Vercel extraction remains unverified: automatic approval review blocked the preview deployment before execution.** Successful local fetching does not establish that a hosting provider's egress addresses will receive the same responses. Run the same creation flow from the intended deployment before release.

## Accepted sources and upstream requests

| Provider | Accepted public source | Anonymous upstream endpoint |
| --- | --- | --- |
| ChatGPT | `https://chatgpt.com/share/<UUID>` | `https://chatgpt.com/backend-api/share/<UUID>` |
| Codex, hosted by ChatGPT | `https://chatgpt.com/s/cx_<32 hexadecimal characters>` | `https://chatgpt.com/backend-api/wham/shared_threads/cx_<ID>`, followed by its signed OpenAI download redirect |
| Claude | `https://claude.ai/share/<UUID>` | `https://claude.ai/api/chat_snapshots/<UUID>?rendering_mode=messages&render_all_tools=true` |

These are first-party, publicly readable endpoints used for public shares, **not documented external API contracts**. Their formats and accessibility can change. Parsing failures remain inconclusive rather than implying removal. The app makes one bounded request, without retrying a security challenge through another mechanism.

Only the exact HTTPS hosts and share paths above are accepted. A trailing slash and hexadecimal ID letter case are canonicalized. Copied query parameters and fragments are discarded from source identity and are never forwarded to the upstream endpoint. Credentials, unusual ports, private chat routes, organization routes, artifact-only links, and other source hosts are rejected. The application pins each upstream connection to a resolved public IP and validates every redirect.

The supplied [Codex share](https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532) is public. The initial implementation incorrectly rejected every `/s/` link as a task link after an inconclusive browser challenge. A later anonymous fetch returned a page titled “Shared Codex chat”; its linked client code identifies the `wham/shared_threads` endpoint above. `/s/cx_` is supported as a distinct public share format, not rewritten to `/share/`.

The Codex endpoint redirects to `/files/<UUID>/raw` on a regional `*.oaiusercontent.com` host with a signed query. The two supplied shares used `sdmntprnznorth.oaiusercontent.com` and `sdmntprwestus.oaiusercontent.com`; limiting the first fix to one region caused the second share to fail. [OpenAI's network guidance](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps) identifies `*.oaiusercontent.com` as a content-transfer namespace. The adapter therefore matches that domain at a DNS-label boundary rather than enumerating regions. This is an implementation inference from the documented namespace and observed redirects, not a documented Codex API contract.

Storage paths and signed query formats are provider implementation details, so the adapter no longer requires a UUID download path, a particular list of signing keys, or signature-shaped values. Downloads originate at the validated Codex endpoint and may follow up to two redirects within `*.oaiusercontent.com`. Unrelated domains, hostname lookalikes, direct submitted download URLs, credentials, and custom ports remain blocked. Requests use GET without provider credentials or cookies. Each hop resolves and pins a public IP. Signed URLs remain in memory and are never stored or logged. All hops share the existing timeout and response-size limits.

The classifier parses the body as JSON and validates its conversation structure regardless of a missing or generic MIME label. HTML shells, malformed JSON, and browser challenges still cannot become publications. An HTML example inside an otherwise valid conversation is not itself treated as a browser challenge.

[Claude's public-link documentation](https://support.claude.com/en/articles/16762437-public-links-for-shared-chats) states that public chat links require no account, whereas Team/Enterprise shares are restricted to organization members. Restricted shares are outside this MVP's accepted input scope.

## Observed payloads

ChatGPT's public page returned roughly 526–551 KiB of HTML, including a React Router `streamController.enqueue` serialization containing `serverResponse.data.linear_conversation`. The corresponding anonymous JSON endpoint returned 52,685 bytes for the instrument-control sample. Its `linear_conversation` is an ordered array of nodes, some without messages. Message nodes contain `message.id`, `author.role`, `content.content_type`, `content.parts` or `content.text`, and metadata. The adapter ignores root-only nodes and messages explicitly marked visually hidden. Supported text is retained in order; media and unsupported content receive visible placeholders.

The Codex page is a small client-rendered shell. Its anonymous data fetch returned 24,407 bytes with `version: 1`, `title`, and ordered `turns[].items`. The supplied share contains one turn with a user message, four agent messages, 31 publicly published reasoning summaries, and one file-change item. The adapter preserves user text, agent commentary/final answers, and those published summaries in order. File changes and images receive explicit omission markers; no attachment or asset is fetched. Unknown versions, malformed items, and unsupported new item types remain inconclusive rather than silently publishing a partial transcript.

Claude's public share pages returned a roughly 112 KiB client-rendered shell with no transcript, including for a nonexistent UUID. Page HTML alone therefore cannot establish availability. The anonymous JSON endpoint returned `is_public`, `snapshot_name`, and `chat_messages` containing `uuid`, `index`, `sender`, Markdown `text`, optionally structured `content`, attachment counts, and `truncated`. Adding `rendering_mode=messages&render_all_tools=true` produced text, tool-use, and tool-result blocks. Messages are ordered by the provider's index. Explicit upstream truncation is rejected rather than publishing a partial transcript.

## Real local adapter checks

The following links were already publicly published by their creators, in research or public discussion. Raw transcripts were used only temporarily during verification and are not included in the repository. Counts are observations of these shares at verification time, not expected content for future requests.

| Case | Public source | Actual adapter outcome |
| --- | --- | --- |
| ChatGPT multi-turn code | [Instrument control](https://chatgpt.com/share/8d523f18-86c8-44af-8002-a5bcf45ffbb5) | Available; 16 visible messages, 12,233 plain-text bytes, 4 messages with code fences, 4 messages with omission markers |
| ChatGPT short formatted code | [Java poem](https://chatgpt.com/share/0b8919ed-a2ec-4813-990c-a42379af7f72) | Anonymous page HTTP 200, ordered conversation data present; inspected as a secondary page-shape sample |
| Codex public chat | [Supplied test share](https://chatgpt.com/s/cx_6aa21047e1c88191ae37e18eaa1d6532) | Available through the actual adapter; 37 ordered items, 36 with readable text, 13,748 plain-text bytes; local prepare/card/publish/reader flow passed |
| Codex public chat, different storage region | [Second supplied share](https://chatgpt.com/s/cx_6aa2a886a0a481918fa34fcbbeb42121) | Available through the actual adapter; 22 ordered items, 2,740 plain-text bytes; local prepare/card/publish/reader flow passed |
| Claude short code | [Container runtime detection](https://claude.ai/share/55718b5b-22de-4d58-96a3-f4718c9bea4a) | Available; 2 messages, 4,081 plain-text bytes, code fences retained |
| Claude long conversation | [Skill creation discussion](https://claude.ai/share/0130d4b0-76d8-4d50-b77d-90af78a11744) | Available; 28 messages, 131,233 plain-text bytes; attachment omission marker retained |
| Claude drawing/tools | [Drawing discussion](https://claude.ai/share/20496048-f3bb-4041-be69-bd463ccab5f2) | Available; 2 messages, 789 plain-text bytes; tool/artifact omission markers retained |
| Nonexistent ChatGPT UUID | All-zero UUID under `/share/` | JSON HTTP 404 with `detail.reason: not_found` and `detail.code: shared_conversation_deleted`; classified unavailable |
| Nonexistent Codex share | `cx_` followed by 32 zeros | Initial API JSON HTTP 404 with exactly `{"detail":"Share not found"}`; classified unavailable only before a download redirect |
| Nonexistent Claude UUID | All-zero UUID under `/share/` | JSON HTTP 404 with `type: error`, `error.type: not_found_error`, and exact snapshot-not-found message; classified unavailable |

A nonexistent ID proves the provider's missing-source response shape; it is not a controlled test of deleting a previously available share. No authenticated private source was fetched. Generic 401/403/404 responses, storage download errors (including expired signed links), HTML shells, malformed JSON, changed schemas, 429, 5xx, challenges, and timeouts are all inconclusive. Only the observed, provider-specific JSON removal signatures disable existing publications.

## Hosted verification status

A temporary harness containing exact copies of the actual adapters and fixed public sample URLs passed the same six-case probe locally. Its output contained statuses, parser versions, message counts, and byte counts only. A Vercel dry run confirmed five deployable files and no credentials or environment files. No hosted database was provisioned.

The deployment action was rejected by automatic approval review before it ran. The stated reason was that fetching full public conversation contents into Vercel was considered sensitive external transfer without specific authorization for that payload. No attempt was made to bypass that decision. **No Vercel deployment or hosted extraction request occurred.** The task-created empty project, `ai-chat-proxy-extraction-20260910`, was removed successfully after the rejection. Hosted extraction remains a release check requiring explicit approval in this environment.

## Fixtures and limits

`tests/providers/fixtures` contains sanitized structures derived from the responses above. Message text, titles, IDs, creator identity, attachment contents, and request IDs were removed or replaced. The code fences in sanitized fixtures preserve the original presence of formatted code with replacement content. Fixtures validate parsing; they are not represented as live extraction evidence. Deliberately constructed image, malformed-response, and size-limit cases in tests are synthetic robustness tests.

Requests have one total 15-second deadline, at most two redirects within supported provider boundaries, a 5 MiB wire and decompressed-response cap, and a 1 MiB encoded normalized-message JSON cap. Exceeding a limit rejects creation with a clear error, and remains inconclusive during availability checks. Public provider data never executes as HTML or JavaScript. Unsupported media, tool interactions, and artifacts are explicit omissions; external files are not downloaded.

The [saved message model](./MESSAGE_MODEL.md) separates ordered text blocks from typed omissions. Omission labels appear in reader Markdown only; summary input contains actual extracted text. Shares containing only unsupported content and no usable original text are rejected.

The focused provider suite covers observed structures, ordering, hidden-message exclusion, Markdown/plain-text extraction, unsupported content, separation of placeholders from original text, exact unavailable signatures, transient/challenge handling, canonicalization, redirects, private-network destinations, transcript size, and streamed/decompressed response limits.

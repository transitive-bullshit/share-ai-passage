---
name: passage-share
description: Create a Passage share link from a public ChatGPT, Codex, or Claude conversation URL, with an AI-generated title and highlights. Use when asked to preview or publish a conversation through Passage.
---

# Passage sharing

Use the bundled Node.js CLI at `scripts/passage.mjs`, resolved relative to this skill's directory. It requires Node.js 24+ and uses `https://www.share-ai-passage.com` by default, with no repository checkout or local service needed. For a user-specified self-hosted or development service, set `PASSAGE_URL` or pass `--base-url`. Run `--help` for command details.

Prepare the supplied public share URL with `prepare <url> --out <draft-file>`. The service fetches the public conversation and generates a title and concise highlights. The CLI displays those fields while saving the publishing token only in the local draft file. Show the title and highlights to the user as the preview, keeping their text unchanged.

When `PASSAGE_API_KEY` is configured, the CLI uses the account's saved default template and generation allowances. Create and revoke named keys in `/account/keys`. Bind the key to the intended service with `PASSAGE_URL`; an overriding origin or a draft from another server is rejected before the key is sent. Keep the key in the environment, out of prompts, command arguments, draft files, and output. Account and billing changes use browser sign-in.

Authenticated preparation requires `--out` and writes a recovery file before dispatch. If interrupted, use `resume <draft-file>` to continue that saved operation or `status <draft-file>` to retrieve its state. These commands keep the same generation IDs. A generated default background may remain pending after its summary is ready; resume the saved job until it has applied. If another edit prevented automatic application, `apply-image <draft-file>` explicitly applies the completed image to the saved revision. `image <draft-file>` explicitly requests another paid image generation. Generation limits, unavailable images, and failed operations stop publication until the user deliberately resolves them. Never replace a failed request with a fresh generation without authorization.

When publishing is authorized, run `publish <draft-file> --json` and return the resulting `shareUrl`. Use the saved draft from the review so the published card matches it. A request to create or publish a share link already authorizes publication; a preview-only request does not. For an explicitly unattended share request, `share <url> --yes --json` performs both steps.

Draft files contain a private publishing capability and their service origin. Keep them local; share only the resulting publication URL. Anonymous draft tokens expire after 24 hours; prepare again and show the new preview when they expire. Account drafts are durable: resume the saved file to refresh its review, then publish the saved revision. On transient errors, report the reason and retry delay instead of repeatedly submitting requests.

The input must already be a public provider share URL. If the user supplied a private chat or no URL, ask for the public share URL. This skill creates the Passage link; creating a provider's public share and posting the resulting link to another service are separate actions.

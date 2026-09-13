# Passage

**Your AI chats, worth sharing**

Turn your AI chats into links you’ll be proud to share

Give a public ChatGPT, Codex, or Claude conversation a clear introduction, a beautiful share card, and a readable saved conversation. No account needed.

[**Try Passage ↗**](https://www.share-ai-passage.com) · [Read an example](https://www.share-ai-passage.com/examples/share-your-ai-chats) · [Run locally](contributing.md#run-locally)

1. Paste a public conversation link and choose **Create a passage**.
2. Edit the generated title and highlights, then choose from **five card styles**.
3. Select **Publish passage** and share your passage link.

## Example passages

**Why the test passed locally but failed in CI.** A save request, a shared test record, and two useful next steps—enough context to decide whether to open the conversation.

One illustrative conversation, two ways to share it. Select a card to read the conversation behind it.

[![Why the test passed locally but failed in CI — Margin notes example](docs/readme-assets/example-passage-01.webp)](https://www.share-ai-passage.com/examples/share-your-ai-chats)

[![Why the test passed locally but failed in CI — Midnight observatory example](docs/readme-assets/example-passage-02.webp)](https://www.share-ai-passage.com/examples/share-your-ai-chats-after-dark)

## From your terminal or agent

Use the [CLI](contributing.md#cli-and-agent-skill) or the portable [passage-share agent skill](.agents/skills/passage-share/SKILL.md) to prepare a preview and publish it after review. From a local checkout:

```sh
pnpm share '<public-conversation-url>' --base-url https://www.share-ai-passage.com
```

Requires Node.js 24+. [Set up the CLI or skill](contributing.md#cli-and-agent-skill).

## Before you share

- **Start with a public link.** Use the provider’s Share option; private conversation addresses and workspace-only links aren’t supported.
- **The context comes with it.** Passages include saved conversation text, supported formatting and code, and the original-source link. Unsupported media, tools, and artifacts are marked as omissions.
- **Review before publishing.** Published wording and style stay fixed. Public passages can appear in search results.
- **Removal follows the source.** Remove public access at the provider, then use “Check original availability” in the passage reader. Confirmed removal disables the passage and card here. Checks are limited to once an hour; external platforms may retain previews they already fetched.

[Contributing](contributing.md) · [Brand identity](docs/brand-identity.md) · [MIT license](license)

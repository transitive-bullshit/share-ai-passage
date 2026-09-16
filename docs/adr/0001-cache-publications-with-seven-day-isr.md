---
status: accepted
---

# Cache public passages with seven-day ISR

Public passage readers and social cards are immutable, overwhelmingly read-heavy representations, so generate them on demand and cache them with a seven-day ISR lifetime; cache hits must not query the database, check the provider, or render a card. This deliberately favors consistently fast reads over immediate removal: source availability is checked during generation or lazy revalidation, confirmed removal prevents newly generated representations from exposing saved content, and an already-cached representation may remain available until a successful revalidation replaces it. Drafts and mutation responses remain uncached. We accept this bounded, eventually consistent removal behavior instead of per-request rendering because removals are rare and the primary product requirement is excellent share-page latency.

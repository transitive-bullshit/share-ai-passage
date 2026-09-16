---
status: accepted
---

# Cache public passages with tiered image delivery

Public passage readers and social cards are immutable except when source removal disables them, and are overwhelmingly read-heavy. Generate them on demand with seven-day reader and 30-day card ISR lifetimes so cache hits do not query the database, check the provider, or render a card. Public card responses make browsers revalidate, use one-day downstream-CDN caching with seven days of stale-while-revalidate, and use a 30-day Vercel edge TTL; deployment-owned marketing example cards use a one-year Vercel TTL. This deliberately favors consistently fast reads over immediate removal: source availability is checked during generation or lazy revalidation, confirmed removal prevents newly generated representations from exposing saved content, and an already-cached representation may remain available until a successful revalidation replaces it. Drafts and mutation responses remain uncached. We accept the longer card staleness window because removals are rare and social-image performance is the primary requirement.

// Four speculative pipelines leave room for interactive requests in both caches.
export const previewLimits = {
  backgroundConcurrency: 4,
  concurrency: 8,
  cacheEntries: 512
} as const

export interface LinkPreviewMetadata {
  requestedUrl: string
  url: string
  title?: string
  description?: string
  siteName?: string
  image?: string
  favicon?: string
}

export type LinkPreviewResult =
  | { ok: true; metadata: LinkPreviewMetadata; assetsPending?: boolean }
  | { ok: false; reason: string; destinationOrigin?: string }

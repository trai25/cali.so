export type OgZolplayEndpoint = 'metadata' | 'favicon' | 'image'

export interface LinkPreviewSnapshot {
  domain: string
  title?: string
  titleEn?: string
  description?: string
  descriptionEn?: string
  hasImage?: boolean
}

export function ogZolplayUrl(endpoint: OgZolplayEndpoint, target: string): string | null

export function normalizeOgMetadata(
  target: string,
  metadata: unknown,
  previous?: LinkPreviewSnapshot,
): LinkPreviewSnapshot | undefined

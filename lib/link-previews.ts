import previews from '~/content/link-previews.json'
import {
  ogZolplayUrl,
  type LinkPreviewSnapshot,
} from '~/lib/og-zolplay.mjs'

export interface LinkPreview extends LinkPreviewSnapshot {}

const data = previews as Record<string, LinkPreview>

// Build-time snapshot (content/link-previews.json, maintained by
// scripts/refresh-link-previews.mjs) — an open hover card never waits
// on the network.
export function getLinkPreview(url: string): LinkPreview | undefined {
  return data[url]
}

// Bad links in a post degrade to plain anchors instead of reaching the
// first-party preview service or crashing the build.
export function faviconUrl(href: string): string | null {
  return ogZolplayUrl('favicon', href)
}

export function ogImageUrl(href: string): string | null {
  return ogZolplayUrl('image', href)
}

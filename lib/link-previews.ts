import previews from '~/content/link-previews.json'

export interface LinkPreview {
  domain: string
  title?: string
  description?: string
}

const data = previews as Record<string, LinkPreview>

// Build-time snapshot (content/link-previews.json, maintained by
// scripts/refresh-link-previews.mjs) — an open hover card never waits
// on the network.
export function getLinkPreview(url: string): LinkPreview | undefined {
  return data[url]
}

// null for malformed hrefs (`https://`, embedded spaces…) — a bad link in
// a post must degrade to a plain anchor, never crash the build.
export function faviconUrl(href: string, size: 32 | 64 = 32): string | null {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(href).hostname}&sz=${size}`
  } catch {
    return null
  }
}

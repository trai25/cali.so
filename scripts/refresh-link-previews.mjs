// Rebuilds content/link-previews.json from the external links found in
// content/blog/*/index.mdx. Run manually when posts change:
//   node scripts/refresh-link-previews.mjs
// Requires network access; existing entries are kept when a fetch fails.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const POSTS_DIR = 'content/blog'
const CACHE = 'content/link-previews.json'

const urls = new Set()
for (const dir of readdirSync(POSTS_DIR, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const mdx = readFileSync(path.join(POSTS_DIR, dir.name, 'index.mdx'), 'utf8')
  for (const [, href] of mdx.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) urls.add(href)
  for (const [, href] of mdx.matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.add(href)
}

const cache = JSON.parse(readFileSync(CACHE, 'utf8'))

function pick(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p)
    if (m) return m[1].trim().replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  }
}

for (const url of urls) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; cali.so link previews)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = (await res.text()).slice(0, 200_000)
    const title = pick(html, [
      /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
      /<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ])
    const description = pick(html, [
      /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i,
      /<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i,
      /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    ])
    cache[url] = { domain: new URL(url).hostname, title, description }
    console.log('ok', url)
  } catch (err) {
    if (!cache[url]) cache[url] = { domain: new URL(url).hostname }
    console.warn('skip', url, String(err.message ?? err))
  }
}

writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n')
console.log(`${Object.keys(cache).length} entries -> ${CACHE}`)

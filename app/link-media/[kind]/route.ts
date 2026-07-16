import { cacheLife } from 'next/cache'

import { upstreamLinkMediaUrl } from '~/lib/link-media'

// Link media are small; the cap defends the data cache against a
// pathological upstream response.
const MAX_MEDIA_BYTES = 4 * 1024 * 1024

// Server-side cache for proxied link favicons and Open Graph images:
// entries live in the data cache and refresh in the background, so the
// browser talks only to this origin and repeat views never re-fetch
// upstream. Failures throw and are never cached.
async function fetchLinkMedia(upstream: string) {
  'use cache'
  cacheLife({ stale: 86_400, revalidate: 604_800, expire: 2_592_000 })

  const res = await fetch(upstream, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`upstream ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) throw new Error('unexpected content type')

  // reject oversized declarations before buffering the body at all
  if (Number(res.headers.get('content-length')) > MAX_MEDIA_BYTES) {
    throw new Error('unexpected content length')
  }

  const body = new Uint8Array(await res.arrayBuffer())
  if (!body.byteLength || body.byteLength > MAX_MEDIA_BYTES) {
    throw new Error('unexpected content length')
  }

  return { body, contentType }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params
  const target = new URL(request.url).searchParams.get('url')
  const upstream = target ? upstreamLinkMediaUrl(kind, target) : null
  if (!upstream) {
    // cacheable briefly so probe traffic doesn't re-hit the server
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  }

  try {
    const { body, contentType } = await fetchLinkMedia(upstream)
    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        // browsers keep a copy for a day, the CDN for a week (serving
        // stale while it refreshes against the data cache)
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
        // media only — never a document that could run in this origin
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    // short-lived so a transient upstream failure never pins a missing icon
    return new Response('Bad gateway', {
      status: 502,
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  }
}

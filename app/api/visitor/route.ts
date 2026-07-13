import { visitorOriginFromHeaders } from '~/lib/visitor-geo'
import { swapVisitorOrigin } from '~/lib/visitor-store'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'private, no-store',
  'Vercel-CDN-Cache-Control': 'private, no-store',
}

const BOT_PATTERN =
  /bot|crawler|spider|slurp|headless|lighthouse|preview|monitor|uptime|facebookexternalhit|python-requests|curl\/|wget\//i

function privateResponse(visitor: unknown, status = 200) {
  return Response.json({ visitor }, { status, headers: PRIVATE_HEADERS })
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false

  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}

export function shouldIgnoreVisitor(request: Request) {
  const headers = request.headers
  if (headers.get('dnt') === '1' || headers.get('sec-gpc') === '1') return true

  const purpose = [
    headers.get('purpose'),
    headers.get('sec-purpose'),
    headers.get('x-purpose'),
    headers.get('x-moz'),
  ].join(' ')
  if (/prefetch|prerender/i.test(purpose) || headers.has('next-router-prefetch')) return true

  return BOT_PATTERN.test(headers.get('user-agent') ?? '')
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return privateResponse(null, 403)
  if (shouldIgnoreVisitor(request)) return privateResponse(null)

  const current = visitorOriginFromHeaders(request.headers)
  if (!current) return privateResponse(null)

  const previous = await swapVisitorOrigin(current)
  return privateResponse(previous)
}

export type BrowserMutationDenial =
  | 'missing-origin'
  | 'origin-mismatch'
  | 'missing-fetch-metadata'
  | 'cross-site-context'

export function securityDenialHeaders() {
  return new Headers({
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
}

export function checkBrowserMutationRequest(
  request: Request,
  canonicalBaseUrl: URL,
): BrowserMutationDenial | null {
  const origin = request.headers.get('origin')
  if (!origin) return 'missing-origin'
  if (origin !== canonicalBaseUrl.origin) return 'origin-mismatch'

  const fetchSite = request.headers.get('sec-fetch-site')
  if (!fetchSite) return 'missing-fetch-metadata'
  if (fetchSite !== 'same-origin') return 'cross-site-context'

  return null
}

export function browserMutationDeniedResponse() {
  return new Response(null, {
    status: 403,
    headers: securityDenialHeaders(),
  })
}

export function featureUnavailableResponse(retryAfterSeconds?: number) {
  const headers = securityDenialHeaders()
  if (retryAfterSeconds) headers.set('retry-after', String(retryAfterSeconds))
  return new Response(null, { status: 503, headers })
}

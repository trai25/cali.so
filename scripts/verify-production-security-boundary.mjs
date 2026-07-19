import assert from 'node:assert/strict'

import { JSDOM } from 'jsdom'

import { openProductionServer } from './production-server.mjs'

const privateMarkers = [
  'ci-google-secret',
  'sk_live_ci_secret_not_real',
  'owner@example.com',
  'security-boundary-callback-code',
  'security-boundary-callback-state',
  'security-boundary-session',
]

function assertSecurityHeaders(response, path) {
  assert.match(
    response.headers.get('content-security-policy') ?? '',
    /default-src 'self'/,
    `${path} CSP`,
  )
  assert.equal(response.headers.get('x-frame-options'), 'DENY', `${path} framing`)
  assert.equal(
    response.headers.get('x-content-type-options'),
    'nosniff',
    `${path} content sniffing`,
  )
}

function assertPrivateDetailsAbsent(body, path) {
  for (const marker of privateMarkers) {
    assert.ok(!body.includes(marker), `${path} exposed ${marker}`)
  }
  assert.doesNotMatch(
    body,
    /(?:Invalid server environment|node_modules|\/Users\/|postgres(?:ql)?:\/\/|Error:\s)/,
    `${path} exposed server detail`,
  )
}

function visibleText(body) {
  const document = new JSDOM(body).window.document
  for (const element of document.querySelectorAll(
    'script, style, template, noscript',
  )) {
    element.remove()
  }
  return document.body?.textContent ?? ''
}

function expectedMutationOrigin(baseUrl) {
  if (process.env.SECURITY_BOUNDARY_EXPECTED_ORIGIN) {
    return new URL(process.env.SECURITY_BOUNDARY_EXPECTED_ORIGIN).origin
  }
  if (process.env.SECURITY_BOUNDARY_BASE_URL) {
    return new URL(baseUrl).origin
  }
  return new URL(process.env.SITE_URL ?? 'https://cali.so').origin
}

async function fetchBoundary(baseUrl, path, init, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
  })
  assertSecurityHeaders(response, path)
  const body = await response.text()
  const inspectedBody = options.visibleContentOnly
    ? visibleText(body)
    : body
  assertPrivateDetailsAbsent(inspectedBody, path)
  return { response, body, inspectedBody }
}

async function verifyPublicPages(baseUrl) {
  for (const path of ['/', '/en', '/blog', '/en/blog']) {
    const { response } = await fetchBoundary(baseUrl, path)
    assert.equal(response.status, 200, `${path} public status`)
  }

  const retiredConfirmation =
    '/confirm/security-boundary-session-must-not-render'
  const { response, inspectedBody } = await fetchBoundary(
    baseUrl,
    retiredConfirmation,
    undefined,
    { visibleContentOnly: true },
  )
  assert.equal(response.status, 200)
  assert.ok(
    !inspectedBody.includes('security-boundary-session-must-not-render'),
  )

  // The AMA service page is public and static; its booking mutations are
  // checked in verifyPublicAmaApiBoundary.
  const ama = await fetchBoundary(baseUrl, '/ama')
  assert.equal(ama.response.status, 200)
}

async function verifyAdminPages(baseUrl) {
  for (const path of [
    '/admin',
    '/admin/login',
    '/admin/photos?view=draft',
  ]) {
    // Clerk redirects document navigations to sign-in, but deliberately
    // rewrites non-page requests to 404. Model the browser boundary here.
    const { response } = await fetchBoundary(baseUrl, path, {
      headers: {
        accept: 'text/html',
        'sec-fetch-dest': 'document',
      },
    })
    assert.equal(response.status, 307, `${path} Clerk redirect status`)
    const location = new URL(response.headers.get('location'))
    assert.equal(location.protocol, 'https:')
    assert.match(
      location.pathname,
      /(?:\/sign-in(?:\/|$)|\/v1\/client\/handshake$)/,
    )
    const returnUrl = new URL(location.searchParams.get('redirect_url'))
    const requestedUrl = new URL(path, baseUrl)
    assert.equal(returnUrl.origin, requestedUrl.origin, `${path} Clerk return origin`)
    assert.equal(
      `${returnUrl.pathname}${returnUrl.search}`,
      `${requestedUrl.pathname}${requestedUrl.search}`,
      `${path} Clerk return path`,
    )
  }
}

async function verifyAdminApiSecurity(baseUrl) {
  const sameOriginHeaders = {
    origin: expectedMutationOrigin(baseUrl),
    'sec-fetch-site': 'same-origin',
  }

  for (const request of [
    {
      path: '/api/admin/auth/logout',
      init: {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
          cookie: '__session=security-boundary-session',
        },
      },
    },
  ]) {
    const { response, body } = await fetchBoundary(
      baseUrl,
      request.path,
      request.init,
    )
    assert.equal(response.status, 403, `${request.path} cross-site status`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(body, '')
    assert.equal(response.headers.get('set-cookie'), null)
  }

  for (const path of [
    '/api/admin/auth/request',
    '/api/admin/auth/verify?token=retired-magic-link',
  ]) {
    const { response } = await fetchBoundary(baseUrl, path)
    assert.equal(response.status, 404, `${path} retired status`)
    assert.equal(response.headers.get('set-cookie'), null)
  }

  const availability = await fetchBoundary(
    baseUrl,
    '/api/admin/ama/availability',
    {
      method: 'POST',
      headers: sameOriginHeaders,
      body: new URLSearchParams({
        intent: 'create',
        weekday: '1',
        start: '09:00',
        end: '10:00',
      }),
    },
  )
  assert.equal(availability.response.status, 401)
  assert.equal(availability.response.headers.get('location'), null)
  assert.equal(availability.response.headers.get('set-cookie'), null)

  const media = await fetchBoundary(baseUrl, '/api/admin/media/assets')
  assert.equal(media.response.status, 401)
  assert.deepEqual(JSON.parse(media.body), { error: 'unauthorized' })
  assert.equal(media.response.headers.get('set-cookie'), null)
}

async function verifyProviderApiAuthentication(baseUrl) {
  const sameOriginHeaders = {
    origin: expectedMutationOrigin(baseUrl),
    'sec-fetch-site': 'same-origin',
  }
  // Google is configured in this environment, so the owner provider routes
  // pass the configuration boundary and must stop at authentication.
  const requests = [
    {
      path: '/api/admin/ama/google/connect',
      init: { method: 'POST', headers: sameOriginHeaders },
    },
    {
      path:
        '/api/admin/ama/google/callback?state=security-boundary-callback-state&code=security-boundary-callback-code',
      init: { method: 'GET' },
    },
    {
      path: '/api/admin/ama/google/disconnect',
      init: { method: 'POST', headers: sameOriginHeaders },
    },
  ]

  for (const { path, init } of requests) {
    const { response, body } = await fetchBoundary(baseUrl, path, init)
    assert.equal(response.status, 401, `${path} unauthenticated status`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(
      response.headers.get('referrer-policy'),
      'no-referrer',
    )
    assert.equal(body, '')
    assert.equal(response.headers.get('set-cookie'), null)
  }
}

async function verifyPublicAmaApiBoundary(baseUrl) {
  const sameOriginHeaders = {
    origin: expectedMutationOrigin(baseUrl),
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
  }
  const holdId = '00000000-0000-4000-8000-000000000000'
  // Public mutations are enabled by default: empty submissions stop at
  // validation, while routes whose provider (Stripe, Resend) is not
  // configured in this environment keep failing closed with 503.
  const requests = [
    { path: '/api/ama/holds', body: '{}', status: 400 },
    { path: `/api/ama/holds/${holdId}/checkout`, body: '{}', status: 503 },
    { path: '/api/ama/stripe/webhook', body: '{}', status: 503 },
    { path: '/api/ama/alternate-time-requests', body: '{}', status: 400 },
    {
      path: '/api/ama/manage/security-boundary-token/cancel',
      body: '{}',
      status: 503,
    },
    {
      path: '/api/ama/manage/security-boundary-token/reschedule',
      body: '{}',
      status: 503,
    },
  ]

  for (const { path, body, status } of requests) {
    const { response } = await fetchBoundary(baseUrl, path, {
      method: 'POST',
      headers: sameOriginHeaders,
      body,
    })
    assert.equal(response.status, status, `${path} boundary status`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('set-cookie'), null)
  }

  // Cross-site public mutations stay rejected outright.
  const crossSite = await fetchBoundary(baseUrl, '/api/ama/holds', {
    method: 'POST',
    headers: {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
      'content-type': 'application/json',
    },
    body: '{}',
  })
  assert.equal(crossSite.response.status, 403, 'cross-site hold status')
  assert.equal(crossSite.response.headers.get('set-cookie'), null)
}

const server = await openProductionServer(process.env.SECURITY_BOUNDARY_BASE_URL)
try {
  await verifyPublicPages(server.baseUrl)
  await verifyAdminPages(server.baseUrl)
  await verifyAdminApiSecurity(server.baseUrl)
  await verifyProviderApiAuthentication(server.baseUrl)
  await verifyPublicAmaApiBoundary(server.baseUrl)
  console.log(`Verified the production security boundary at ${server.baseUrl}`)
} finally {
  await server.stop()
}

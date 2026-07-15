import assert from 'node:assert/strict'

import { openProductionServer } from './production-server.mjs'

const privateMarkers = [
  'ci-google-secret',
  'ci-redis-token',
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

function withoutHydrationScripts(body) {
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

async function fetchBoundary(baseUrl, path, init, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...init,
  })
  assertSecurityHeaders(response, path)
  const body = await response.text()
  const inspectedBody = options.visibleContentOnly
    ? withoutHydrationScripts(body)
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

  const ama = await fetch(new URL('/ama', baseUrl), { redirect: 'manual' })
  assert.equal(ama.status, 308)
  assert.equal(new URL(ama.headers.get('location'), baseUrl).pathname, '/')
}

async function verifyDisabledPages(baseUrl) {
  for (const path of ['/admin', '/admin/login']) {
    const { response, body } = await fetchBoundary(baseUrl, path)
    assert.equal(response.status, 404, `${path} disabled status`)
    assert.match(body, /<meta name="robots" content="noindex"\/?>/)
  }
}

async function verifyDisabledApis(baseUrl) {
  const sameOriginHeaders = {
    origin: 'https://cali.so',
    'sec-fetch-site': 'same-origin',
  }
  const requests = [
    {
      path: '/api/admin/auth/request',
      init: {
        method: 'POST',
        headers: sameOriginHeaders,
        body: new URLSearchParams({ email: 'owner@example.com' }),
      },
    },
    {
      path: '/api/admin/auth/verify?token=security-boundary-session',
      init: { method: 'GET' },
    },
    {
      path: '/api/admin/auth/logout',
      init: {
        method: 'POST',
        headers: {
          ...sameOriginHeaders,
          cookie: '__Host-ama_session=security-boundary-session',
        },
      },
    },
    {
      path: '/api/admin/ama/availability',
      init: {
        method: 'POST',
        headers: sameOriginHeaders,
        body: new URLSearchParams({
          intent: 'create',
          weekday: '1',
          start: '09:00',
          end: '10:00',
        }),
      },
    },
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
    assert.equal(response.status, 503, `${path} disabled status`)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(
      response.headers.get('referrer-policy'),
      'no-referrer',
    )
    assert.equal(body, '')
    assert.equal(response.headers.get('set-cookie'), null)
  }
}

const server = await openProductionServer(process.env.SECURITY_BOUNDARY_BASE_URL)
try {
  await verifyPublicPages(server.baseUrl)
  await verifyDisabledPages(server.baseUrl)
  await verifyDisabledApis(server.baseUrl)
  console.log(`Verified the disabled production security boundary at ${server.baseUrl}`)
} finally {
  await server.stop()
}

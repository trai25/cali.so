import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  authenticateOwnerRequest,
  createLogoutHandler,
  createMagicLinkRequestHandler,
  createMagicLinkVerifyHandler,
} from './http'
import {
  AUTH_SESSION_COOKIE,
  createOwnerAuth,
  type AuthRepository,
  type AuthSessionRecord,
  type LoginTokenRecord,
} from './service'
import { createAmaSecurity, type SecurityAuditEvent } from '../security/service'

function createFixture() {
  let now = new Date('2026-07-14T04:00:00.000Z')
  const tokens = new Map<string, LoginTokenRecord>()
  const sessions = new Map<string, AuthSessionRecord>()
  const sentLinks: string[] = []
  const rateLimitKeys: string[] = []
  let rateLimitAllowsRequest = true

  const repository: AuthRepository = {
    async createLoginToken(record) {
      tokens.set(record.tokenHash, record)
    },
    async consumeLoginToken(tokenHash, ownerEmail, consumedAt) {
      const token = tokens.get(tokenHash)
      if (
        !token ||
        token.email !== ownerEmail ||
        token.consumedAt ||
        token.expiresAt <= consumedAt
      ) {
        return false
      }
      token.consumedAt = consumedAt
      return true
    },
    async createSession(record) {
      sessions.set(record.tokenHash, record)
    },
    async findActiveSession(tokenHash, ownerEmail, checkedAt) {
      const session = sessions.get(tokenHash)
      if (
        !session ||
        session.email !== ownerEmail ||
        session.revokedAt ||
        session.expiresAt <= checkedAt
      ) {
        return null
      }
      return session
    },
    async revokeSession(tokenHash, revokedAt) {
      const session = sessions.get(tokenHash)
      if (session && !session.revokedAt) session.revokedAt = revokedAt
    },
  }

  function authFor(ownerEmail: string) {
    return createOwnerAuth({
      ownerEmail,
      sessionSecret: 'a'.repeat(64),
      baseUrl: new URL('https://cali.so'),
      repository,
      clock: { now: () => now },
      rateLimiter: {
        async limit(key) {
          rateLimitKeys.push(key)
          return { success: rateLimitAllowsRequest }
        },
      },
      mailer: {
        async sendMagicLink({ url }) {
          sentLinks.push(url.toString())
        },
      },
    })
  }

  const auth = authFor('owner@example.com')
  const securityEvents: SecurityAuditEvent[] = []
  const security = createAmaSecurity({
    baseUrl: new URL('https://cali.so'),
    features: {
      publicMutations: false,
      payments: false,
      bookingFinalization: false,
      google: true,
      tencent: false,
    },
    pseudonymKey: Buffer.alloc(32, 5),
    rateLimiter: { async limit() { return { success: true } } },
    audit: { write(event) { securityEvents.push(event) } },
    requestId: () => 'auth-request-id',
  })

  return {
    auth,
    authFor,
    security,
    securityEvents,
    sentLinks,
    rateLimitKeys,
    setNow(value: string) {
      now = new Date(value)
    },
    denyRateLimit() {
      rateLimitAllowsRequest = false
    },
  }
}

function requestMagicLink(handler: (request: Request) => Promise<Response>, email: string) {
  const body = new FormData()
  body.set('email', email)
  return handler(
    new Request('https://cali.so/api/admin/auth/request', {
      method: 'POST',
      headers: {
        origin: 'https://cali.so',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '203.0.113.5',
      },
      body,
    }),
  )
}

function cookieValue(response: Response) {
  const match = response.headers.get('set-cookie')?.match(
    new RegExp(`${AUTH_SESSION_COOKIE}=([^;]+)`),
  )
  return match?.[1]
}

describe('owner authentication HTTP contract', () => {
  it('does not reveal whether an email is allowlisted', async () => {
    const fixture = createFixture()
    const handler = createMagicLinkRequestHandler(fixture.auth, fixture.security)

    const denied = await requestMagicLink(handler, 'guest@example.com')
    const allowed = await requestMagicLink(handler, 'OWNER@example.com')

    expect(denied.status).toBe(303)
    expect(allowed.status).toBe(303)
    expect(denied.headers.get('location')).toBe('https://cali.so/admin/login?sent=1')
    expect(allowed.headers.get('location')).toBe(denied.headers.get('location'))
    expect(fixture.sentLinks).toHaveLength(1)
    expect(fixture.rateLimitKeys).toEqual([
      'request:untrusted-proxy',
      'request:untrusted-proxy',
      'owner-recipient',
    ])
  })

  it('returns the same response before deferred delivery work runs', async () => {
    const fixture = createFixture()
    const tasks: Array<() => Promise<void>> = []
    const handler = createMagicLinkRequestHandler(fixture.auth, fixture.security, (task) => {
      tasks.push(task)
    })

    const denied = await requestMagicLink(handler, 'guest@example.com')
    const allowed = await requestMagicLink(handler, 'owner@example.com')

    expect(denied.headers.get('location')).toBe(allowed.headers.get('location'))
    expect(fixture.sentLinks).toHaveLength(0)
    await Promise.all(tasks.map((task) => task()))
    expect(fixture.sentLinks).toHaveLength(1)
  })

  it('does not issue a magic link after the request limit is reached', async () => {
    const fixture = createFixture()
    fixture.denyRateLimit()

    const response = await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://cali.so/admin/login?sent=1')
    expect(fixture.sentLinks).toHaveLength(0)
    expect(fixture.rateLimitKeys).toEqual(['request:untrusted-proxy'])
  })

  it('rejects an expired magic link', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const link = fixture.sentLinks[0]
    fixture.setNow('2026-07-14T04:15:00.001Z')

    const response = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(link),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/login?error=invalid-link',
    )
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(fixture.securityEvents.at(-1)?.event).toBe(
      'admin_authentication.denied',
    )
  })

  it('consumes a magic link exactly once under concurrent requests', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const verify = createMagicLinkVerifyHandler(fixture.auth, fixture.security)

    const responses = await Promise.all([
      verify(new Request(fixture.sentLinks[0])),
      verify(new Request(fixture.sentLinks[0])),
    ])

    expect(responses.filter((response) => cookieValue(response))).toHaveLength(1)
    expect(responses.map((response) => response.headers.get('location')).sort()).toEqual([
      'https://cali.so/admin',
      'https://cali.so/admin/login?error=invalid-link',
    ])
  })

  it('rejects links and sessions issued to a previous allowlisted owner', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const oldLink = fixture.sentLinks[0]
    const newOwner = fixture.authFor('new-owner@example.com')

    const oldLinkResponse = await createMagicLinkVerifyHandler(
      newOwner,
      fixture.security,
    )(
      new Request(oldLink),
    )
    expect(cookieValue(oldLinkResponse)).toBeUndefined()

    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const oldSessionResponse = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(fixture.sentLinks[1]),
    )
    expect(await newOwner.authenticate(cookieValue(oldSessionResponse))).toBe(false)
  })

  it('sets a signed 30-day secure session cookie', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )

    const response = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(fixture.sentLinks[0]),
    )
    const setCookie = response.headers.get('set-cookie') ?? ''

    expect(cookieValue(response)?.split('.')).toHaveLength(2)
    expect(setCookie).toContain('Max-Age=2592000')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('SameSite=Lax')
  })

  it('expires sessions after 30 days', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const response = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(fixture.sentLinks[0]),
    )
    const sessionCookie = cookieValue(response)
    fixture.setNow('2026-08-13T04:00:00.001Z')

    expect(await fixture.auth.authenticate(sessionCookie)).toBe(false)
  })

  it('revokes the current session on logout and clears its cookie', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const loginResponse = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(fixture.sentLinks[0]),
    )
    const sessionCookie = cookieValue(loginResponse)

    const logoutResponse = await createLogoutHandler(fixture.auth, fixture.security)(
      new Request('https://cali.so/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          cookie: `${AUTH_SESSION_COOKIE}=${sessionCookie}`,
          origin: 'https://cali.so',
          'sec-fetch-site': 'same-origin',
        },
      }),
    )

    expect(logoutResponse.status).toBe(303)
    expect(logoutResponse.headers.get('location')).toBe('https://cali.so/admin/login')
    expect(logoutResponse.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(await fixture.auth.authenticate(sessionCookie)).toBe(false)
    expect(fixture.securityEvents.at(-1)?.event).toBe('admin_logout.succeeded')
  })

  it('rejects cross-site login requests before scheduling mail work', async () => {
    const fixture = createFixture()
    const body = new FormData()
    body.set('email', 'owner@example.com')

    const response = await createMagicLinkRequestHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request('https://cali.so/api/admin/auth/request', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
        },
        body,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.sentLinks).toEqual([])
    expect(fixture.securityEvents[0]?.event).toBe('browser_mutation.denied')
  })

  it('authenticates protected API requests from the signed owner cookie', async () => {
    const fixture = createFixture()
    await requestMagicLink(
      createMagicLinkRequestHandler(fixture.auth, fixture.security),
      'owner@example.com',
    )
    const response = await createMagicLinkVerifyHandler(
      fixture.auth,
      fixture.security,
    )(
      new Request(fixture.sentLinks[0]),
    )
    const session = cookieValue(response)

    await expect(
      authenticateOwnerRequest(
        fixture.auth,
        new Request('https://cali.so/api/admin/ama/availability', {
          headers: { cookie: `${AUTH_SESSION_COOKIE}=${session}` },
        }),
      ),
    ).resolves.toBe(true)
    await expect(
      authenticateOwnerRequest(
        fixture.auth,
        new Request('https://cali.so/api/admin/ama/availability', {
          headers: { cookie: `${AUTH_SESSION_COOKIE}=forged` },
        }),
      ),
    ).resolves.toBe(false)
  })
})

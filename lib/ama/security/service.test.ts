import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createAmaSecurity,
  type AmaFeatureFlags,
  type SecurityAuditEvent,
} from './service'

const allFeatures: AmaFeatureFlags = {
  publicMutations: true,
  payments: true,
  bookingFinalization: true,
  google: true,
  tencent: true,
}

function browserMutation(cookie = '__session=private-session') {
  return new Request('https://cali.so/api/admin/ama/availability', {
    method: 'POST',
    headers: {
      origin: 'https://cali.so',
      'sec-fetch-site': 'same-origin',
      cookie,
    },
  })
}

function bearerMutation() {
  return new Request('https://cali.so/api/admin/ama/availability', {
    method: 'POST',
    headers: {
      authorization: 'Bearer rotated-clerk-token',
      origin: 'https://cali.so',
      'sec-fetch-site': 'same-origin',
    },
  })
}

function fixture(input?: {
  features?: AmaFeatureFlags
  limit?: (key: string) => Promise<{ success: boolean }>
}) {
  const events: SecurityAuditEvent[] = []
  const security = createAmaSecurity({
    baseUrl: new URL('https://cali.so'),
    features: input?.features ?? allFeatures,
    pseudonymKey: Buffer.alloc(32, 3),
    rateLimiter: { limit: input?.limit ?? (async () => ({ success: true })) },
    audit: {
      write(event) {
        events.push(event)
      },
    },
    clock: { now: () => new Date('2026-07-14T08:00:00.000Z') },
    requestId: () => 'request-123',
  })
  return { security, events }
}

describe('AMA security service', () => {
  it('allows an enabled same-origin browser mutation', async () => {
    const { security, events } = fixture()

    await expect(
      security.protectOwnerAdminMutation(browserMutation()),
    ).resolves.toBeNull()
    expect(events).toEqual([])
  })

  it('fails closed when a sensitive feature is disabled', async () => {
    const { security, events } = fixture({
      features: { ...allFeatures, google: false },
    })

    const response = await security.protectBrowserMutation(browserMutation(), [
      'google',
    ])

    expect(response?.status).toBe(503)
    expect(response?.headers.get('cache-control')).toBe('no-store')
    expect(events).toEqual([
      {
        event: 'feature.disabled',
        timestamp: '2026-07-14T08:00:00.000Z',
        outcome: 'denied',
        requestId: 'request-123',
      },
    ])
  })

  it('rejects cross-site mutations without logging request data', async () => {
    const { security, events } = fixture()
    const request = new Request('https://cali.so/api/admin/ama/availability', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example/private-email@example.com',
        'sec-fetch-site': 'cross-site',
        cookie: 'secret-cookie-value',
      },
    })

    const response = await security.protectOwnerAdminMutation(request)

    expect(response?.status).toBe(403)
    expect(events[0]).toEqual({
      event: 'browser_mutation.denied',
      timestamp: '2026-07-14T08:00:00.000Z',
      outcome: 'denied',
      requestId: 'request-123',
    })
    expect(JSON.stringify(events)).not.toContain('attacker.example')
    expect(JSON.stringify(events)).not.toContain('private-email')
    expect(JSON.stringify(events)).not.toContain('secret-cookie')
  })

  it('rate limits authenticated admin mutations with a pseudonymous key', async () => {
    let limiterKey = ''
    const { security, events } = fixture({
      limit: async (key) => {
        limiterKey = key
        return { success: false }
      },
    })

    const response = await security.limitAdminMutation(
      browserMutation(),
      'user_owner',
    )

    expect(response?.status).toBe(429)
    expect(limiterKey).toMatch(/^[a-f0-9]{64}$/)
    expect(limiterKey).not.toContain('private-session')
    expect(events).toEqual([
      {
        event: 'admin_mutation.rate_limited',
        timestamp: '2026-07-14T08:00:00.000Z',
        outcome: 'denied',
        requestId: 'request-123',
        actorId: limiterKey,
      },
    ])
  })

  it('keeps the limiter identity stable when Clerk refreshes its session token', async () => {
    const limiterKeys: string[] = []
    const { security } = fixture({
      limit: async (key) => {
        limiterKeys.push(key)
        return { success: true }
      },
    })

    await security.limitAdminMutation(
      browserMutation('__session=rotated-token-one'),
      'user_owner',
    )
    await security.limitAdminMutation(
      browserMutation('__session=rotated-token-two'),
      'user_owner',
    )
    await security.limitAdminMutation(bearerMutation(), 'user_owner')

    expect(limiterKeys).toHaveLength(3)
    expect(limiterKeys[0]).toBe(limiterKeys[1])
    expect(limiterKeys[1]).toBe(limiterKeys[2])
  })

  it('records privileged actions without logging the session', () => {
    const { security, events } = fixture()

    security.recordPrivilegedAction(
      browserMutation(),
      'availability_mutation.succeeded',
      'user_owner',
    )

    expect(events[0]).toMatchObject({
      event: 'availability_mutation.succeeded',
      outcome: 'allowed',
      requestId: 'request-123',
      actorId: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(events)).not.toContain('private-session')
  })

  it('denies the mutation when the rate limiter is unavailable', async () => {
    const { security, events } = fixture({
      limit: async () => {
        throw new Error('provider payload must stay private')
      },
    })

    const response = await security.limitAdminMutation(
      browserMutation(),
      'user_owner',
    )

    expect(response?.status).toBe(503)
    expect(events[0]).toMatchObject({
      event: 'admin_mutation.limiter_error',
      outcome: 'error',
      requestId: 'request-123',
    })
    expect(JSON.stringify(events)).not.toContain('provider payload')
  })
})

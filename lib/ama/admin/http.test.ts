import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createAvailabilityMutationHandler,
  createGoogleCallbackHandler,
  createGoogleConnectHandler,
  createGoogleDisconnectHandler,
  type AdminGoogleService,
  type AvailabilityMutationService,
  type OwnerRequestAuthenticator,
} from './http'
import { createAmaSecurity, type SecurityAuditEvent } from '../security/service'

function formRequest(
  path: string,
  values: Record<string, string | readonly string[]>,
  authenticated = true,
) {
  const body = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') body.set(key, value)
    else for (const item of value) body.append(key, item)
  }
  return new Request(`https://cali.so${path}`, {
    method: 'POST',
    headers: {
      origin: 'https://cali.so',
      'sec-fetch-site': 'same-origin',
      ...(authenticated ? { cookie: 'owner=valid' } : {}),
    },
    body,
  })
}

function fixture(rateLimitAllows = true) {
  const mutations: unknown[] = []
  const authenticator: OwnerRequestAuthenticator = {
    async authenticate(request) {
      return request.headers.get('cookie') === 'owner=valid'
        ? {
            status: 'authorized',
            principal: { id: 'owner@example.com', actorId: 'user_owner' },
          }
        : { status: 'unauthenticated' }
    },
  }
  const availability: AvailabilityMutationService = {
    async setTimeZone(timeZone) {
      mutations.push(['set-time-zone', timeZone])
    },
    async setWeekday(isoWeekday, enabled) {
      mutations.push(['set-weekday', isoWeekday, enabled])
    },
    async copyWeekday(sourceWeekday, targetWeekdays) {
      mutations.push(['copy-weekday', sourceWeekday, targetWeekdays])
    },
    async replaceWeekday(isoWeekday, intervals) {
      mutations.push(['replace-weekday', isoWeekday, intervals])
    },
    async saveOverride(localDate, intervals) {
      mutations.push(['save-override', localDate, intervals])
    },
    async deleteOverride(localDate) {
      mutations.push(['delete-override', localDate])
    },
    async create(input) {
      mutations.push(['create', input])
    },
    async update(id, input) {
      mutations.push(['update', id, input])
    },
    async delete(id) {
      mutations.push(['delete', id])
    },
  }
  const googleEvents: unknown[] = []
  const google: AdminGoogleService = {
    async begin() {
      googleEvents.push(['begin'])
      return new URL('https://accounts.google.com/o/oauth2/v2/auth?state=private')
    },
    async complete(input) {
      googleEvents.push(['complete', input])
      return 'connected'
    },
    async disconnect() {
      googleEvents.push(['disconnect'])
    },
  }
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
    pseudonymKey: Buffer.alloc(32, 4),
    rateLimiter: {
      async limit() {
        return { success: rateLimitAllows }
      },
    },
    audit: {
      write(event) {
        securityEvents.push(event)
      },
    },
    requestId: () => 'admin-request-id',
  })
  return {
    authenticator,
    availability,
    google,
    mutations,
    googleEvents,
    security,
    securityEvents,
  }
}

describe('AMA admin HTTP contract', () => {
  it('rejects unauthenticated mutations', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest(
        '/api/admin/ama/availability',
        { intent: 'create', weekday: '1', start: '09:00', end: '12:00' },
        false,
      ),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    expect(f.mutations).toEqual([])
  })

  it('forbids signed-in Clerk users without owner metadata', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: {
        async authenticate() {
          return { status: 'forbidden' }
        },
      },
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'create',
        weekday: '1',
        start: '09:00',
        end: '12:00',
      }),
    )

    expect(response.status).toBe(403)
    expect(f.mutations).toEqual([])
    expect(f.securityEvents.at(-1)?.event).toBe(
      'admin_authentication.denied',
    )
  })

  it('creates, updates, and deletes same-day Availability Windows', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const createResponse = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'create',
        weekday: '1',
        start: '09:30',
        end: '12:00',
      }),
    )
    const updateResponse = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'update',
        id: '7',
        weekday: '5',
        start: '13:00',
        end: '17:30',
      }),
    )
    const deleteResponse = await handler(
      formRequest('/api/admin/ama/availability', { intent: 'delete', id: '7' }),
    )

    expect(f.mutations).toEqual([
      ['create', { isoWeekday: 1, startMinute: 570, endMinute: 720 }],
      ['update', 7, { isoWeekday: 5, startMinute: 780, endMinute: 1050 }],
      ['delete', 7],
    ])
    for (const response of [createResponse, updateResponse, deleteResponse]) {
      expect(response.status).toBe(303)
      expect(response.headers.get('location')).toBe(
        'https://cali.so/admin/ama/settings?availability=saved',
      )
    }
  })

  it('replaces one weekday with multiple submitted intervals atomically', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'save-weekday',
        weekday: '1',
        start: ['09:00', '13:00'],
        end: ['12:00', '17:00'],
      }),
    )

    expect(f.mutations).toEqual([
      [
        'replace-weekday',
        1,
        [
          { startMinute: 540, endMinute: 720 },
          { startMinute: 780, endMinute: 1020 },
        ],
      ],
    ])
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?availability=saved',
    )
  })

  it('rejects overlapping weekday intervals without mutation', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'save-weekday',
        weekday: '1',
        start: ['09:00', '11:00'],
        end: ['12:00', '17:00'],
      }),
    )

    expect(f.mutations).toEqual([])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?availability=invalid',
    )
  })

  it('rejects malformed and overnight Availability Windows without mutation', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'create',
        weekday: '8',
        start: '18:00',
        end: '09:00',
      }),
    )

    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?availability=invalid',
    )
    expect(f.mutations).toEqual([])
  })

  it('updates the schedule time zone through the authenticated mutation boundary', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'set-time-zone',
        timeZone: 'America/Los_Angeles',
      }),
    )

    expect(f.mutations).toEqual([
      ['set-time-zone', 'America/Los_Angeles'],
    ])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?availability=saved',
    )
  })

  it('turns weekdays on and off and copies hours to selected weekdays', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'set-weekday',
        weekday: '2',
        enabled: 'true',
      }),
    )
    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'set-weekday',
        weekday: '6',
        enabled: 'false',
      }),
    )
    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'copy-weekday',
        weekday: '2',
        targetWeekday: ['1', '4', '5'],
      }),
    )

    expect(f.mutations).toEqual([
      ['set-weekday', 2, true],
      ['set-weekday', 6, false],
      ['copy-weekday', 2, [1, 4, 5]],
    ])
  })

  it('saves closed and custom date overrides and restores weekly hours', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'save-override',
        localDate: '2026-07-22',
        overrideMode: 'closed',
      }),
    )
    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'save-override',
        localDate: '2026-07-23',
        overrideMode: 'custom',
        overrideStart: ['09:00', '14:00'],
        overrideEnd: ['11:00', '17:00'],
      }),
    )
    await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'delete-override',
        localDate: '2026-07-22',
      }),
    )

    expect(f.mutations).toEqual([
      ['save-override', '2026-07-22', []],
      [
        'save-override',
        '2026-07-23',
        [
          { startMinute: 540, endMinute: 660 },
          { startMinute: 840, endMinute: 1020 },
        ],
      ],
      ['delete-override', '2026-07-22'],
    ])
  })

  it('accepts the locale-specific weekday changed before hydration', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/availability', {
        intent: 'create',
        weekdayZh: '1',
        weekdayEn: '5',
        weekdayOriginal: '1',
        start: '09:00',
        end: '12:00',
      }),
    )

    expect(f.mutations).toEqual([
      ['create', { isoWeekday: 5, startMinute: 540, endMinute: 720 }],
    ])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?availability=saved',
    )
  })

  it('starts Google OAuth at the provider URL only for the owner', async () => {
    const f = fixture()
    const handler = createGoogleConnectHandler({
      authenticator: f.authenticator,
      service: f.google,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      new Request('https://cali.so/api/admin/ama/google/connect', {
        method: 'POST',
        headers: {
          cookie: 'owner=valid',
          origin: 'https://cali.so',
          'sec-fetch-site': 'same-origin',
        },
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//)
    expect(f.googleEvents).toEqual([['begin']])
  })

  it('passes the OAuth callback values through one authenticated boundary', async () => {
    const f = fixture()
    const handler = createGoogleCallbackHandler({
      authenticator: f.authenticator,
      service: f.google,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })
    const request = new Request(
      'https://cali.so/api/admin/ama/google/callback?state=s&code=c',
      { headers: { cookie: 'owner=valid' } },
    )

    const response = await handler(request)

    expect(f.googleEvents).toEqual([
      ['complete', { state: 's', code: 'c', error: null }],
    ])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?calendar=connected',
    )
  })

  it('disconnects Calendar without touching Availability Windows', async () => {
    const f = fixture()
    const handler = createGoogleDisconnectHandler({
      authenticator: f.authenticator,
      service: f.google,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/google/disconnect', {}),
    )

    expect(f.googleEvents).toEqual([['disconnect']])
    expect(f.mutations).toEqual([])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin/ama/settings?calendar=disconnected',
    )
  })

  it('rejects cross-site admin mutations before authentication or service work', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: {
        async authenticate() {
          throw new Error('authentication must not run')
        },
      },
      service: f.availability,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      new Request('https://cali.so/api/admin/ama/availability', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'cross-site',
          cookie: 'owner=valid',
        },
      }),
    )

    expect(response.status).toBe(403)
    expect(f.mutations).toEqual([])
    expect(f.securityEvents[0]?.event).toBe('browser_mutation.denied')
  })

  it('rate limits authenticated admin mutations before service work', async () => {
    const f = fixture(false)
    const handler = createGoogleDisconnectHandler({
      authenticator: f.authenticator,
      service: f.google,
      security: f.security,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/google/disconnect', {}),
    )

    expect(response.status).toBe(429)
    expect(f.googleEvents).toEqual([])
    expect(f.securityEvents[0]?.event).toBe('admin_mutation.rate_limited')
  })
})

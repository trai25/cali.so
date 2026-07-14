import { describe, expect, it } from 'vitest'

import {
  createAvailabilityMutationHandler,
  createGoogleCallbackHandler,
  createGoogleConnectHandler,
  createGoogleDisconnectHandler,
  type AdminGoogleService,
  type AvailabilityMutationService,
  type OwnerRequestAuthenticator,
} from './http'

function formRequest(path: string, values: Record<string, string>, authenticated = true) {
  const body = new FormData()
  for (const [key, value] of Object.entries(values)) body.set(key, value)
  return new Request(`https://attacker.example${path}`, {
    method: 'POST',
    headers: authenticated ? { cookie: 'owner=valid' } : undefined,
    body,
  })
}

function fixture() {
  const mutations: unknown[] = []
  const authenticator: OwnerRequestAuthenticator = {
    async authenticate(request) {
      return request.headers.get('cookie') === 'owner=valid'
    },
  }
  const availability: AvailabilityMutationService = {
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
  return { authenticator, availability, google, mutations, googleEvents }
}

describe('AMA admin HTTP contract', () => {
  it('redirects unauthenticated mutations to the canonical login page', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest(
        '/api/admin/ama/availability',
        { intent: 'create', weekday: '1', start: '09:00', end: '12:00' },
        false,
      ),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://cali.so/admin/login')
    expect(f.mutations).toEqual([])
  })

  it('creates, updates, and deletes same-day Availability Windows', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
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
        'https://cali.so/admin?availability=saved',
      )
    }
  })

  it('rejects malformed and overnight Availability Windows without mutation', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
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
      'https://cali.so/admin?availability=invalid',
    )
    expect(f.mutations).toEqual([])
  })

  it('accepts the locale-specific weekday changed before hydration', async () => {
    const f = fixture()
    const handler = createAvailabilityMutationHandler({
      authenticator: f.authenticator,
      service: f.availability,
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
      'https://cali.so/admin?availability=saved',
    )
  })

  it('starts Google OAuth at the provider URL only for the owner', async () => {
    const f = fixture()
    const handler = createGoogleConnectHandler({
      authenticator: f.authenticator,
      service: f.google,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      new Request('https://attacker.example/api/admin/ama/google/connect', {
        headers: { cookie: 'owner=valid' },
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
    expect(response.headers.get('location')).toBe('https://cali.so/admin?calendar=connected')
  })

  it('disconnects Calendar without touching Availability Windows', async () => {
    const f = fixture()
    const handler = createGoogleDisconnectHandler({
      authenticator: f.authenticator,
      service: f.google,
      baseUrl: new URL('https://cali.so'),
    })

    const response = await handler(
      formRequest('/api/admin/ama/google/disconnect', {}),
    )

    expect(f.googleEvents).toEqual([['disconnect']])
    expect(f.mutations).toEqual([])
    expect(response.headers.get('location')).toBe(
      'https://cali.so/admin?calendar=disconnected',
    )
  })
})

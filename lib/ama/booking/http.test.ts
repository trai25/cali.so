import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { ManageService, ManagedBookingView } from './manage'
import type {
  BookingService,
  CheckoutResult,
  CreateHoldResult,
  HoldStateResult,
} from './service'
import {
  createAlternateTimeRequestHandler,
  createCheckoutHandler,
  createHoldCreateHandler,
  createHoldStateHandler,
  createManageCancelHandler,
  createManageRescheduleHandler,
  createManageStateHandler,
  createPublicRequestGuard,
  createPublicSlotsHandler,
  createStripeWebhookHandler,
} from './http'

const NOW = new Date('2026-07-01T12:00:00Z')
const STARTS_AT = new Date('2026-07-10T09:00:00Z')
const ENDS_AT = new Date('2026-07-10T10:00:00Z')
const HOLD_ID = '0b6f3e02-1111-4222-8333-444455556666'
const WEBHOOK_SECRET = 'whsec_test_secret'

function makeGuard(options: { allow?: boolean; throws?: boolean } = {}) {
  const limitedKeys: string[] = []
  const guard = createPublicRequestGuard({
    baseUrl: new URL('https://cali.so'),
    rateLimiter: {
      async limit(key) {
        limitedKeys.push(key)
        if (options.throws) throw new Error('limiter down')
        return { success: options.allow ?? true }
      },
    },
    pseudonymKey: Buffer.alloc(32, 4),
  })
  return { guard, limitedKeys }
}

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://cali.so${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://cali.so',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const holdBody = {
  startsAt: STARTS_AT.toISOString(),
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  locale: 'en',
  timeZone: 'America/Los_Angeles',
  topics: ['career'],
  brief: 'A brief.',
  urls: [],
  provider: 'google-meet',
}

function holdCreateFixture(result: CreateHoldResult) {
  const calls: unknown[] = []
  const service: Pick<BookingService, 'createHold'> = {
    async createHold(input) {
      calls.push(input)
      return result
    },
  }
  return { service, calls }
}

const createdHold: CreateHoldResult = {
  outcome: 'created',
  holdId: HOLD_ID,
  expiresAt: new Date(NOW.getTime() + 10 * 60_000),
  startsAt: STARTS_AT,
  endsAt: ENDS_AT,
}

describe('public request guard', () => {
  it.each([
    ['missing origin', { 'sec-fetch-site': 'same-origin' }],
    [
      'wrong origin',
      { origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' },
    ],
    ['missing sec-fetch-site', { origin: 'https://cali.so' }],
    [
      'cross-site fetch metadata',
      { origin: 'https://cali.so', 'sec-fetch-site': 'cross-site' },
    ],
  ])('denies a request with %s before any service work', async (_name, headers) => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(
      new Request('https://cali.so/api/ama/holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(holdBody),
      }),
    )

    expect(response.status).toBe(403)
    expect(f.calls).toEqual([])
  })

  it('rate limits the pseudonymous client with a retry-after hint', async () => {
    const { guard, limitedKeys } = makeGuard({ allow: false })
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(
      jsonRequest('/api/ama/holds', holdBody, { 'x-forwarded-for': '203.0.113.9' }),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(f.calls).toEqual([])
    expect(limitedKeys).toEqual([
      createHmac('sha256', Buffer.alloc(32, 4)).update('203.0.113.9').digest('hex'),
    ])
  })

  it('fails closed when the rate limiter is unavailable', async () => {
    const { guard } = makeGuard({ throws: true })
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(jsonRequest('/api/ama/holds', holdBody))

    expect(response.status).toBe(503)
    expect(f.calls).toEqual([])
  })

  it('lets a same-origin browser request through to the service', async () => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(jsonRequest('/api/ama/holds', holdBody))

    expect(response.status).toBe(201)
    expect(f.calls).toHaveLength(1)
  })
})

describe('public slots handler', () => {
  it('maps available slots to ISO strings', async () => {
    const handler = createPublicSlotsHandler({
      service: {
        async computeSlots() {
          return {
            status: 'available',
            slots: [{ startsAt: STARTS_AT, endsAt: ENDS_AT }],
          }
        },
      },
    })

    const response = await handler()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      status: 'available',
      slots: [
        { startsAt: STARTS_AT.toISOString(), endsAt: ENDS_AT.toISOString() },
      ],
    })
  })

  it('returns an empty unavailable payload when the calendar is disconnected', async () => {
    const handler = createPublicSlotsHandler({
      service: {
        async computeSlots() {
          return { status: 'unavailable' }
        },
      },
    })

    const response = await handler()

    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      slots: [],
    })
  })

  it('answers 503 when the service dependency throws', async () => {
    const handler = createPublicSlotsHandler({
      service: {
        async computeSlots() {
          throw new Error('db down')
        },
      },
    })

    const response = await handler()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'dependency_unavailable',
    })
  })
})

describe('hold create handler', () => {
  it('rejects non-JSON bodies without touching the service', async () => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(
      new Request('https://cali.so/api/ama/holds', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://cali.so',
          'sec-fetch-site': 'same-origin',
        },
        body: 'startsAt=now',
      }),
    )

    expect(response.status).toBe(400)
    expect(f.calls).toEqual([])
  })

  it('rejects bodies over 32KiB', async () => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(
      jsonRequest('/api/ama/holds', { ...holdBody, brief: 'a'.repeat(33 * 1024) }),
    )

    expect(response.status).toBe(400)
    expect(f.calls).toEqual([])
  })

  it('rejects an unparseable start time with the failing field', async () => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(
      jsonRequest('/api/ama/holds', { ...holdBody, startsAt: 'not-a-date' }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
      field: 'startsAt',
    })
    expect(f.calls).toEqual([])
  })

  it('returns the created hold with ISO timestamps', async () => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(createdHold)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(jsonRequest('/api/ama/holds', holdBody))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      hold: {
        id: HOLD_ID,
        expiresAt: createdHold.expiresAt.toISOString(),
        startsAt: STARTS_AT.toISOString(),
        endsAt: ENDS_AT.toISOString(),
      },
    })
  })

  it.each([
    [{ outcome: 'invalid', field: 'email' }, 400, { error: 'invalid_request', field: 'email' }],
    [{ outcome: 'stale_slot' }, 409, { error: 'stale_slot' }],
    [{ outcome: 'slot_taken' }, 409, { error: 'slot_taken' }],
    [{ outcome: 'unavailable' }, 503, { error: 'provider_unavailable' }],
  ] as const)('maps the %o outcome to its HTTP shape', async (result, status, body) => {
    const { guard } = makeGuard()
    const f = holdCreateFixture(result as CreateHoldResult)
    const handler = createHoldCreateHandler({ service: f.service, guard })

    const response = await handler(jsonRequest('/api/ama/holds', holdBody))

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })
})

describe('hold state handler', () => {
  function stateFixture(result: HoldStateResult) {
    const calls: string[] = []
    const handler = createHoldStateHandler({
      service: {
        async getHoldState(holdId) {
          calls.push(holdId)
          return result
        },
      },
    })
    return { handler, calls }
  }

  it('hides malformed hold ids behind a 404 without a lookup', async () => {
    const f = stateFixture({ state: 'unknown' })

    const response = await f.handler(
      new Request('https://cali.so/api/ama/holds/x'),
      'not-a-uuid',
    )

    expect(response.status).toBe(404)
    expect(f.calls).toEqual([])
  })

  it('answers 404 for an unknown hold', async () => {
    const f = stateFixture({ state: 'unknown' })

    const response = await f.handler(
      new Request('https://cali.so/api/ama/holds/x'),
      HOLD_ID,
    )

    expect(response.status).toBe(404)
    expect(f.calls).toEqual([HOLD_ID])
  })

  it('serializes an active hold with its countdown fields', async () => {
    const expiresAt = new Date(NOW.getTime() + 5 * 60_000)
    const f = stateFixture({
      state: 'active',
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      expiresAt,
      checkoutStarted: true,
    })

    const response = await f.handler(
      new Request('https://cali.so/api/ama/holds/x'),
      HOLD_ID,
    )

    await expect(response.json()).resolves.toEqual({
      hold: {
        state: 'active',
        startsAt: STARTS_AT.toISOString(),
        endsAt: ENDS_AT.toISOString(),
        expiresAt: expiresAt.toISOString(),
        checkoutStarted: true,
      },
    })
  })

  it('reports a paid hold with its Booking status', async () => {
    const f = stateFixture({ state: 'paid', bookingStatus: 'confirmed' })

    const response = await f.handler(
      new Request('https://cali.so/api/ama/holds/x'),
      HOLD_ID,
    )

    await expect(response.json()).resolves.toEqual({
      hold: { state: 'paid', bookingStatus: 'confirmed' },
    })
  })

  it('reports an expired hold with only its state', async () => {
    const f = stateFixture({ state: 'expired' })

    const response = await f.handler(
      new Request('https://cali.so/api/ama/holds/x'),
      HOLD_ID,
    )

    await expect(response.json()).resolves.toEqual({ hold: { state: 'expired' } })
  })
})

describe('checkout handler', () => {
  function checkoutFixture(result: CheckoutResult) {
    const { guard } = makeGuard()
    const calls: string[] = []
    const handler = createCheckoutHandler({
      guard,
      service: {
        async createCheckout(holdId) {
          calls.push(holdId)
          return result
        },
      },
    })
    return { handler, calls }
  }

  it('returns the Stripe redirect URL for a live hold', async () => {
    const f = checkoutFixture({
      outcome: 'redirect',
      url: 'https://checkout.stripe.com/c/pay_1',
    })

    const response = await f.handler(
      jsonRequest(`/api/ama/holds/${HOLD_ID}/checkout`, {}),
      HOLD_ID,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      checkout: { url: 'https://checkout.stripe.com/c/pay_1' },
    })
  })

  it.each([
    [{ outcome: 'hold_expired' }, 409, { error: 'hold_expired' }],
    [{ outcome: 'already_paid' }, 409, { error: 'already_paid' }],
    [{ outcome: 'unknown' }, 404, { error: 'not_found' }],
    [{ outcome: 'unavailable' }, 503, { error: 'provider_unavailable' }],
  ] as const)('maps the %o outcome to its HTTP shape', async (result, status, body) => {
    const f = checkoutFixture(result as CheckoutResult)

    const response = await f.handler(
      jsonRequest(`/api/ama/holds/${HOLD_ID}/checkout`, {}),
      HOLD_ID,
    )

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it('hides malformed hold ids behind a 404 without a service call', async () => {
    const f = checkoutFixture({ outcome: 'unknown' })

    const response = await f.handler(
      jsonRequest('/api/ama/holds/nope/checkout', {}),
      'nope',
    )

    expect(response.status).toBe(404)
    expect(f.calls).toEqual([])
  })
})

describe('Stripe webhook handler', () => {
  const eventPayload = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_status: 'paid' } },
  })

  function sign(payload: string, secret = WEBHOOK_SECRET, timestamp?: number) {
    const t = timestamp ?? Math.floor(NOW.getTime() / 1000)
    const v1 = createHmac('sha256', secret)
      .update(`${t}.${payload}`, 'utf8')
      .digest('hex')
    return `t=${t},v1=${v1}`
  }

  function webhookFixture(options: { throws?: boolean } = {}) {
    const events: unknown[] = []
    const handler = createStripeWebhookHandler({
      signingSecret: WEBHOOK_SECRET,
      clock: { now: () => NOW },
      service: {
        async processWebhookEvent(event) {
          if (options.throws) throw new Error('db down')
          events.push(event)
          return 'booking_created'
        },
      },
    })
    return { handler, events }
  }

  function webhookRequest(payload: string, signature: string) {
    return new Request('https://cali.so/api/ama/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload,
    })
  }

  it('accepts a genuinely signed event and reports the outcome', async () => {
    const f = webhookFixture()

    const response = await f.handler(webhookRequest(eventPayload, sign(eventPayload)))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      received: true,
      outcome: 'booking_created',
    })
    expect(f.events).toEqual([
      {
        id: 'evt_1',
        type: 'checkout.session.completed',
        object: { id: 'cs_1', payment_status: 'paid' },
      },
    ])
  })

  it('rejects a signature minted with the wrong secret before any service work', async () => {
    const f = webhookFixture()

    const response = await f.handler(
      webhookRequest(eventPayload, sign(eventPayload, 'whsec_wrong')),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_signature' })
    expect(f.events).toEqual([])
  })

  it('rejects a payload tampered with after signing', async () => {
    const f = webhookFixture()
    const tampered = eventPayload.replace('cs_1', 'cs_evil')

    const response = await f.handler(webhookRequest(tampered, sign(eventPayload)))

    expect(response.status).toBe(400)
    expect(f.events).toEqual([])
  })

  it('rejects a replayed signature outside the freshness window', async () => {
    const f = webhookFixture()
    const staleTimestamp = Math.floor(NOW.getTime() / 1000) - 10 * 60

    const response = await f.handler(
      webhookRequest(eventPayload, sign(eventPayload, WEBHOOK_SECRET, staleTimestamp)),
    )

    expect(response.status).toBe(400)
    expect(f.events).toEqual([])
  })

  it('asks Stripe to redeliver when processing fails', async () => {
    const f = webhookFixture({ throws: true })

    const response = await f.handler(webhookRequest(eventPayload, sign(eventPayload)))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'dependency_unavailable',
    })
  })
})

describe('alternate time request handler', () => {
  function alternateFixture(
    result: { outcome: 'created' } | { outcome: 'invalid'; field: string },
  ) {
    const { guard } = makeGuard()
    const calls: unknown[] = []
    const handler = createAlternateTimeRequestHandler({
      guard,
      service: {
        async createAlternateTimeRequest(input) {
          calls.push(input)
          return result
        },
      },
    })
    return { handler, calls }
  }

  it('accepts a valid request with 201', async () => {
    const f = alternateFixture({ outcome: 'created' })

    const response = await f.handler(
      jsonRequest('/api/ama/time-requests', {
        name: 'Ada',
        email: 'ada@example.com',
        locale: 'en',
        timeZone: 'America/Los_Angeles',
        preferredWindows: 'Weekday mornings',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      request: { received: true },
    })
  })

  it('surfaces the failing field for an invalid request', async () => {
    const f = alternateFixture({ outcome: 'invalid', field: 'email' })

    const response = await f.handler(
      jsonRequest('/api/ama/time-requests', { name: 'Ada', email: 'nope' }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
      field: 'email',
    })
  })
})

describe('manage handlers', () => {
  const view: ManagedBookingView = {
    bookingId: 'bk_1',
    status: 'confirmed',
    guestName: 'Ada Lovelace',
    locale: 'en',
    guestTimeZone: 'America/Los_Angeles',
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    meetingProvider: 'google-meet',
    meetingUrl: 'https://meet.google.com/fake-meet',
    refundStatus: 'none',
    canReschedule: true,
    canCancel: true,
    refundOnCancel: true,
  }

  const bookingBody = {
    status: 'confirmed',
    guestName: 'Ada Lovelace',
    locale: 'en',
    guestTimeZone: 'America/Los_Angeles',
    startsAt: STARTS_AT.toISOString(),
    endsAt: ENDS_AT.toISOString(),
    meetingProvider: 'google-meet',
    meetingUrl: 'https://meet.google.com/fake-meet',
    refundStatus: 'none',
    canReschedule: true,
    canCancel: true,
    refundOnCancel: true,
  }

  function manageFake(overrides: Partial<ManageService> = {}) {
    const calls: unknown[] = []
    const manage = {
      async getView(token: string) {
        calls.push(['getView', token])
        return view
      },
      async reschedule(token: string, startsAt: Date) {
        calls.push(['reschedule', token, startsAt])
        return { outcome: 'done', view }
      },
      async cancel(token: string) {
        calls.push(['cancel', token])
        return { outcome: 'done', view }
      },
      ...overrides,
    } as unknown as ManageService
    return { manage, calls }
  }

  it('discloses nothing about an unknown Manage Link', async () => {
    const { manage } = manageFake({
      getView: async () => null,
    } as Partial<ManageService>)
    const handler = createManageStateHandler({ manage })

    const response = await handler(
      new Request('https://cali.so/api/ama/manage/x'),
      'unknown-token',
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('serves the managed view without ever exposing the guest email', async () => {
    const { manage } = manageFake({
      getView: async () =>
        ({ ...view, guestEmail: 'ada@example.com' }) as ManagedBookingView,
    } as Partial<ManageService>)
    const handler = createManageStateHandler({ manage })

    const response = await handler(
      new Request('https://cali.so/api/ama/manage/x'),
      'raw-token',
    )
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(text)).toEqual({ booking: bookingBody })
    expect(text).not.toContain('ada@example.com')
  })

  it('reschedules through the guard and returns the refreshed view', async () => {
    const { guard } = makeGuard()
    const { manage, calls } = manageFake()
    const handler = createManageRescheduleHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/reschedule', {
        startsAt: STARTS_AT.toISOString(),
      }),
      'raw-token',
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ booking: bookingBody })
    expect(calls).toEqual([['reschedule', 'raw-token', STARTS_AT]])
  })

  it('rejects a reschedule without a parseable start time', async () => {
    const { guard } = makeGuard()
    const { manage, calls } = manageFake()
    const handler = createManageRescheduleHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/reschedule', { startsAt: 'whenever' }),
      'raw-token',
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_request',
      field: 'startsAt',
    })
    expect(calls).toEqual([])
  })

  it.each([
    ['window_closed', 409, { error: 'window_closed' }],
    ['stale_slot', 409, { error: 'stale_slot' }],
    ['slot_taken', 409, { error: 'slot_taken' }],
    ['already_cancelled', 409, { error: 'already_cancelled' }],
    ['not_found', 404, { error: 'not_found' }],
    ['unavailable', 503, { error: 'provider_unavailable' }],
  ] as const)('maps the %s reschedule outcome', async (outcome, status, body) => {
    const { guard } = makeGuard()
    const { manage } = manageFake({
      reschedule: async () => ({ outcome }),
    } as Partial<ManageService>)
    const handler = createManageRescheduleHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/reschedule', {
        startsAt: STARTS_AT.toISOString(),
      }),
      'raw-token',
    )

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it('enforces the guard on reschedule before touching the service', async () => {
    const { guard } = makeGuard()
    const { manage, calls } = manageFake()
    const handler = createManageRescheduleHandler({ manage, guard })

    const response = await handler(
      new Request('https://cali.so/api/ama/manage/x/reschedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startsAt: STARTS_AT.toISOString() }),
      }),
      'raw-token',
    )

    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  it('cancels through the guard and returns the cancelled view', async () => {
    const { guard } = makeGuard()
    const { manage, calls } = manageFake()
    const handler = createManageCancelHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/cancel', {}),
      'raw-token',
    )

    expect(response.status).toBe(200)
    expect(calls).toEqual([['cancel', 'raw-token']])
  })

  it.each([
    ['not_found', 404, { error: 'not_found' }],
    ['already_cancelled', 409, { error: 'already_cancelled' }],
  ] as const)('maps the %s cancel outcome', async (outcome, status, body) => {
    const { guard } = makeGuard()
    const { manage } = manageFake({
      cancel: async () => ({ outcome }),
    } as Partial<ManageService>)
    const handler = createManageCancelHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/cancel', {}),
      'raw-token',
    )

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual(body)
  })

  it('enforces the guard on cancel before touching the service', async () => {
    const { guard } = makeGuard({ allow: false })
    const { manage, calls } = manageFake()
    const handler = createManageCancelHandler({ manage, guard })

    const response = await handler(
      jsonRequest('/api/ama/manage/x/cancel', {}),
      'raw-token',
    )

    expect(response.status).toBe(429)
    expect(calls).toEqual([])
  })
})

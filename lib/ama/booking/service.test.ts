import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { AvailabilityService } from '../availability/service'
import type { StripeCheckoutSession, StripeClient } from '../stripe/client'
import { StripeError } from '../stripe/client'
import type { StripeWebhookEvent } from '../stripe/webhook'
import type { BookingLocale, MeetingProviderName } from './repository'
import { createBookingService, type HoldIntakeInput } from './service'
import {
  createFakeBookingRepository,
  createFakeClaimsRepository,
  createFakeOperationsRepository,
} from './testing'

const MS_PER_MINUTE = 60_000
const NOW = new Date('2026-08-01T00:00:00.000Z')
const SLOT_START = new Date('2026-08-05T02:00:00.000Z')
const SLOT_END = new Date('2026-08-05T03:00:00.000Z')

type PreviewResult = Awaited<ReturnType<AvailabilityService['preview']>>
type PreviewInput = Parameters<AvailabilityService['preview']>[0]
type CheckoutSessionInput = Parameters<StripeClient['createCheckoutSession']>[0]

function fixture() {
  let now = new Date(NOW)
  const claims = createFakeClaimsRepository()
  const repo = createFakeBookingRepository()
  const operations = createFakeOperationsRepository()

  let previewResult: PreviewResult = {
    status: 'connected',
    slots: [{ startsAt: SLOT_START, endsAt: SLOT_END }],
  }
  const previewCalls: PreviewInput[] = []
  const availability: Pick<AvailabilityService, 'preview'> = {
    async preview(input) {
      previewCalls.push(input)
      return previewResult
    },
  }

  const stripeCalls: CheckoutSessionInput[] = []
  let stripeBehavior = async (input: CheckoutSessionInput): Promise<StripeCheckoutSession> => ({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    status: 'open',
    paymentStatus: 'unpaid',
    paymentIntentId: null,
    amountTotal: input.amount,
    currency: input.currency,
    metadata: input.metadata,
  })
  const stripe: StripeClient = {
    async createCheckoutSession(input) {
      stripeCalls.push(input)
      return stripeBehavior(input)
    },
    async getCheckoutSession() {
      throw new Error('not exercised')
    },
    async createRefund() {
      return { id: 're_test_1', status: 'succeeded' }
    },
  }

  const service = createBookingService({
    claims: claims.repository,
    repository: repo.repository,
    operations: operations.repository,
    availability,
    stripe,
    baseUrl: new URL('https://cali.so'),
    clock: { now: () => now },
  })

  return {
    service,
    claims,
    repo,
    operations,
    previewCalls,
    stripeCalls,
    setNow(next: Date) {
      now = next
    },
    advanceMinutes(minutes: number) {
      now = new Date(now.getTime() + minutes * MS_PER_MINUTE)
    },
    setPreview(result: PreviewResult) {
      previewResult = result
    },
    setStripeBehavior(behavior: typeof stripeBehavior) {
      stripeBehavior = behavior
    },
  }
}

function intake(overrides: Partial<HoldIntakeInput> = {}): HoldIntakeInput {
  return {
    startsAt: SLOT_START,
    guestName: '  Ada Lovelace ',
    guestEmail: ' Ada@Example.COM ',
    locale: 'zh',
    guestTimeZone: 'Asia/Shanghai',
    topics: ['engineering', 'career'],
    briefText: '  Discussing engine designs  ',
    briefUrls: ['https://example.com/notes'],
    meetingProvider: 'google-meet',
    ...overrides,
  }
}

let eventSequence = 0

function completedEvent(
  sessionId: string,
  overrides: Record<string, unknown> = {},
  id?: string,
): StripeWebhookEvent {
  return {
    id: id ?? `evt-${++eventSequence}`,
    type: 'checkout.session.completed',
    object: {
      id: sessionId,
      payment_status: 'paid',
      payment_intent: 'pi_test_1',
      amount_total: 9900,
      currency: 'usd',
      ...overrides,
    },
  }
}

function expiredEvent(sessionId: string, id?: string): StripeWebhookEvent {
  return {
    id: id ?? `evt-${++eventSequence}`,
    type: 'checkout.session.expired',
    object: { id: sessionId },
  }
}

describe('Booking service slots', () => {
  it('maps active holds and booking claims to availability blockers', async () => {
    const f = fixture()
    const holdExpiry = new Date(NOW.getTime() + 15 * MS_PER_MINUTE)
    await f.claims.repository.createHold({
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      expiresAt: holdExpiry,
      now: NOW,
    })
    const bookingStart = new Date('2026-08-05T05:00:00.000Z')
    const bookingEnd = new Date('2026-08-05T06:00:00.000Z')
    await f.claims.repository.createBookingClaim({
      startsAt: bookingStart,
      endsAt: bookingEnd,
      now: NOW,
    })

    const result = await f.service.computeSlots()

    expect(result).toEqual({
      status: 'available',
      slots: [{ startsAt: SLOT_START, endsAt: SLOT_END }],
    })
    expect(f.previewCalls[0]).toEqual({
      slotHolds: [{ startsAt: SLOT_START, endsAt: SLOT_END, expiresAt: holdExpiry }],
      bookings: [{ startsAt: bookingStart, endsAt: bookingEnd }],
    })
  })

  it('reports unavailable when the calendar preview is not connected', async () => {
    const f = fixture()
    f.setPreview({ status: 'disconnected', slots: [] })

    await expect(f.service.computeSlots()).resolves.toEqual({ status: 'unavailable' })
  })
})

describe('Booking service createHold', () => {
  it.each([
    ['name', { guestName: '   ' }],
    ['name', { guestName: 'a'.repeat(121) }],
    ['email', { guestEmail: 'not-an-email' }],
    ['locale', { locale: 'fr' as BookingLocale }],
    ['timeZone', { guestTimeZone: 'Not/AZone' }],
    ['topics', { topics: [] as string[] }],
    ['topics', { topics: ['engineering', 'engineering'] }],
    ['topics', { topics: ['blockchain'] }],
    [
      'topics',
      {
        topics: [
          'engineering',
          'engineering',
          'engineering',
          'engineering',
          'engineering',
          'engineering',
          'engineering',
        ],
      },
    ],
    ['brief', { briefText: '   ' }],
    ['brief', { briefText: 'a'.repeat(2001) }],
    ['urls', { briefUrls: ['ftp://example.com/file'] }],
    ['urls', { briefUrls: ['not a url'] }],
    ['urls', { briefUrls: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`) }],
    ['provider', { meetingProvider: 'zoom' as MeetingProviderName }],
  ])('rejects invalid intake on field %s', async (field, overrides) => {
    const f = fixture()

    await expect(f.service.createHold(intake(overrides))).resolves.toEqual({
      outcome: 'invalid',
      field,
    })
    expect(f.claims.rows).toHaveLength(0)
  })

  it('fails closed when the calendar is unavailable', async () => {
    const f = fixture()
    f.setPreview({ status: 'unavailable', slots: [] })

    await expect(f.service.createHold(intake())).resolves.toEqual({
      outcome: 'unavailable',
    })
  })

  it('rejects a start time that is no longer offered as stale', async () => {
    const f = fixture()

    await expect(
      f.service.createHold(intake({ startsAt: new Date('2026-08-05T09:00:00.000Z') })),
    ).resolves.toEqual({ outcome: 'stale_slot' })
  })

  it('loses the race for a claimed interval as slot_taken', async () => {
    const f = fixture()
    await f.claims.repository.createBookingClaim({
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      now: NOW,
    })

    await expect(f.service.createHold(intake())).resolves.toEqual({
      outcome: 'slot_taken',
    })
    expect(f.repo.intents).toHaveLength(0)
  })

  it('creates a 15-minute hold and persists the normalized intent', async () => {
    const f = fixture()

    const result = await f.service.createHold(intake())

    expect(result).toEqual({
      outcome: 'created',
      holdId: 'claim-1',
      expiresAt: new Date(NOW.getTime() + 15 * MS_PER_MINUTE),
      startsAt: SLOT_START,
      endsAt: SLOT_END,
    })
    expect(f.claims.rows[0]).toMatchObject({ kind: 'hold', status: 'active' })
    expect(f.repo.intents[0]).toMatchObject({
      holdClaimId: 'claim-1',
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      briefText: 'Discussing engine designs',
      topics: ['engineering', 'career'],
      meetingProvider: 'google-meet',
      stripeCheckoutSessionId: null,
    })
  })
})

describe('Booking service getHoldState', () => {
  async function heldFixture(overrides: Partial<HoldIntakeInput> = {}) {
    const f = fixture()
    const created = await f.service.createHold(intake(overrides))
    if (created.outcome !== 'created') throw new Error('hold not created')
    return { ...f, holdId: created.holdId }
  }

  it('reports an active hold with its countdown and checkout flag', async () => {
    const f = await heldFixture()

    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'active',
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      expiresAt: new Date(NOW.getTime() + 15 * MS_PER_MINUTE),
      checkoutStarted: false,
    })

    await f.service.createCheckout(f.holdId)

    await expect(f.service.getHoldState(f.holdId)).resolves.toMatchObject({
      state: 'active',
      checkoutStarted: true,
    })
  })

  it('reports expired once the hold lapses without a checkout session', async () => {
    const f = await heldFixture()
    f.advanceMinutes(16)

    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({ state: 'expired' })
  })

  it('reports processing for a lapsed hold that already has a checkout session', async () => {
    const f = await heldFixture()
    await f.service.createCheckout(f.holdId)
    f.advanceMinutes(16)

    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'processing',
    })
  })

  it('reports paid with the booking status once payment landed', async () => {
    const f = await heldFixture()
    await f.service.createCheckout(f.holdId)
    await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'paid',
      bookingStatus: 'finalizing',
    })

    f.repo.bookings[0].status = 'confirmed'
    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'paid',
      bookingStatus: 'confirmed',
    })

    f.repo.bookings[0].status = 'needs_reschedule'
    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'paid',
      bookingStatus: 'needs_reschedule',
    })
  })

  it('reports cancelled once the paid booking was cancelled', async () => {
    const f = await heldFixture()
    await f.service.createCheckout(f.holdId)
    await f.service.processWebhookEvent(completedEvent('cs_test_1'))
    f.repo.bookings[0].status = 'cancelled'

    await expect(f.service.getHoldState(f.holdId)).resolves.toEqual({
      state: 'cancelled',
    })
  })

  it('reports unknown for a missing claim or a claim without an intent', async () => {
    const f = fixture()
    await expect(f.service.getHoldState('claim-404')).resolves.toEqual({
      state: 'unknown',
    })

    const orphanHold = await f.claims.repository.createHold({
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      expiresAt: new Date(NOW.getTime() + 15 * MS_PER_MINUTE),
      now: NOW,
    })
    await expect(f.service.getHoldState(orphanHold!.id)).resolves.toEqual({
      state: 'unknown',
    })
  })
})

describe('Booking service createCheckout', () => {
  async function heldFixture(overrides: Partial<HoldIntakeInput> = {}) {
    const f = fixture()
    const created = await f.service.createHold(intake(overrides))
    if (created.outcome !== 'created') throw new Error('hold not created')
    return { ...f, holdId: created.holdId }
  }

  it('returns unknown for a hold that never existed', async () => {
    const f = fixture()

    await expect(f.service.createCheckout('claim-404')).resolves.toEqual({
      outcome: 'unknown',
    })
  })

  it('refuses checkout for an expired hold', async () => {
    const f = await heldFixture()
    f.advanceMinutes(16)

    await expect(f.service.createCheckout(f.holdId)).resolves.toEqual({
      outcome: 'hold_expired',
    })
  })

  it('short-circuits when the hold was already paid', async () => {
    const f = await heldFixture()
    await f.service.createCheckout(f.holdId)
    await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    await expect(f.service.createCheckout(f.holdId)).resolves.toEqual({
      outcome: 'already_paid',
    })
  })

  it('creates a US$99 session keyed to the hold with only opaque metadata', async () => {
    const f = await heldFixture()

    const result = await f.service.createCheckout(f.holdId)

    expect(result).toEqual({
      outcome: 'redirect',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    })
    const call = f.stripeCalls[0]
    expect(call.idempotencyKey).toBe(`ama-checkout:${f.holdId}`)
    expect(call.amount).toBe(9900)
    expect(call.currency).toBe('usd')
    expect(call.customerEmail).toBe('ada@example.com')
    expect(call.expiresAt).toEqual(new Date(NOW.getTime() + 30 * MS_PER_MINUTE))
    expect(call.clientReferenceId).toBe(f.holdId)
    expect(call.successUrl).toBe(
      `https://cali.so/ama/book/confirmation?hold=${f.holdId}`,
    )
    expect(call.cancelUrl).toBe('https://cali.so/ama/book?checkout=cancelled')
    expect(call.metadata).toEqual({ holdId: f.holdId, intentId: f.repo.intents[0].id })
    const metadataDump = JSON.stringify(call.metadata)
    expect(metadataDump).not.toContain('ada@example.com')
    expect(metadataDump).not.toContain('Discussing engine designs')
    expect(metadataDump).not.toContain('engineering')
    expect(f.repo.intents[0].stripeCheckoutSessionId).toBe('cs_test_1')
  })

  it('prefixes the return URLs for English-locale guests', async () => {
    const f = await heldFixture({ locale: 'en' })

    await f.service.createCheckout(f.holdId)

    expect(f.stripeCalls[0].successUrl).toContain('/en/ama/book/confirmation?hold=')
    expect(f.stripeCalls[0].cancelUrl).toBe(
      'https://cali.so/en/ama/book?checkout=cancelled',
    )
  })

  it('reads as unavailable when Stripe errors out', async () => {
    const f = await heldFixture()
    f.setStripeBehavior(async () => {
      throw new StripeError('provider_unavailable', 'Stripe is temporarily unavailable.')
    })

    await expect(f.service.createCheckout(f.holdId)).resolves.toEqual({
      outcome: 'unavailable',
    })
  })

  it('reuses the idempotent session on a double click without re-attaching', async () => {
    const f = await heldFixture()

    const first = await f.service.createCheckout(f.holdId)
    const second = await f.service.createCheckout(f.holdId)

    expect(first).toEqual(second)
    expect(f.stripeCalls).toHaveLength(2)
    expect(f.stripeCalls[1].idempotencyKey).toBe(f.stripeCalls[0].idempotencyKey)
    expect(f.repo.intents[0].stripeCheckoutSessionId).toBe('cs_test_1')
    expect(
      f.repo.intents.filter((intent) => intent.stripeCheckoutSessionId === 'cs_test_1'),
    ).toHaveLength(1)
  })
})

describe('Booking service webhook processing', () => {
  async function paidSetup() {
    const f = fixture()
    const created = await f.service.createHold(intake())
    if (created.outcome !== 'created') throw new Error('hold not created')
    await f.service.createCheckout(created.holdId)
    return { ...f, holdId: created.holdId }
  }

  it('converts the hold, creates the booking, and enqueues finalization exactly once', async () => {
    const f = await paidSetup()

    const outcome = await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    expect(outcome).toBe('booking_created')
    await expect(f.claims.repository.get(f.holdId)).resolves.toMatchObject({
      kind: 'booking',
      status: 'active',
      expiresAt: null,
    })
    const booking = f.repo.bookings[0]
    expect(booking).toMatchObject({
      status: 'finalizing',
      claimId: f.holdId,
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      stripeCheckoutSessionId: 'cs_test_1',
      stripePaymentIntentId: 'pi_test_1',
      amountTotal: 9900,
      currency: 'usd',
    })
    expect(f.repo.events).toEqual([
      expect.objectContaining({
        bookingId: booking.id,
        event: 'payment_verified',
        actor: 'provider',
      }),
    ])
    const finalize = f.operations.rows.find((row) => row.kind === 'finalize_booking')
    expect(finalize).toMatchObject({
      dedupeKey: `finalize:${booking.id}:${SLOT_START.toISOString()}`,
      bookingId: booking.id,
      status: 'pending',
      payload: { startsAt: SLOT_START.toISOString(), email: 'confirmation' },
    })
    const purge = f.operations.rows.find((row) => row.kind === 'purge_booking_brief')
    expect(purge).toMatchObject({ dedupeKey: `purge:${booking.id}`, status: 'pending' })
    expect(f.repo.providerEvents[0]).toMatchObject({
      outcome: 'booking_created',
    })
    expect(f.repo.providerEvents[0].processedAt).not.toBeNull()
  })

  it('short-circuits a duplicate delivery of the same event id', async () => {
    const f = await paidSetup()
    const event = completedEvent('cs_test_1')

    await f.service.processWebhookEvent(event)
    const outcome = await f.service.processWebhookEvent(event)

    expect(outcome).toBe('duplicate')
    expect(f.repo.bookings).toHaveLength(1)
    expect(f.operations.rows.filter((row) => row.kind === 'finalize_booking')).toHaveLength(1)
  })

  it('keeps booking creation exactly-once across distinct event ids for one session', async () => {
    const f = await paidSetup()

    await f.service.processWebhookEvent(completedEvent('cs_test_1'))
    const outcome = await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    expect(outcome).toBe('booking_exists')
    expect(f.repo.bookings).toHaveLength(1)
    expect(
      f.repo.events.filter((event) => event.event === 'payment_verified'),
    ).toHaveLength(1)
  })

  it('ignores a completed session that is not paid', async () => {
    const f = await paidSetup()

    const outcome = await f.service.processWebhookEvent(
      completedEvent('cs_test_1', { payment_status: 'unpaid' }),
    )

    expect(outcome).toBe('ignored')
    expect(f.repo.bookings).toHaveLength(0)
    await expect(f.claims.repository.get(f.holdId)).resolves.toMatchObject({
      kind: 'hold',
      status: 'active',
    })
  })

  it('releases an abandoned hold when its checkout session expires', async () => {
    const f = await paidSetup()

    const outcome = await f.service.processWebhookEvent(expiredEvent('cs_test_1'))

    expect(outcome).toBe('hold_released')
    await expect(f.claims.repository.get(f.holdId)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'abandoned',
    })
  })

  it('leaves the booking claim untouched when an expiry arrives after payment', async () => {
    const f = await paidSetup()
    await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    const outcome = await f.service.processWebhookEvent(expiredEvent('cs_test_1'))

    expect(outcome).toBe('booking_exists')
    await expect(f.claims.repository.get(f.holdId)).resolves.toMatchObject({
      kind: 'booking',
      status: 'active',
    })
    expect(f.repo.bookings[0].status).toBe('finalizing')
  })

  it('re-claims the interval for a payment landing after hold expiry', async () => {
    const f = await paidSetup()
    f.advanceMinutes(20)

    const outcome = await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    expect(outcome).toBe('booking_created')
    const booking = f.repo.bookings[0]
    expect(booking.status).toBe('finalizing')
    expect(booking.claimId).not.toBeNull()
    expect(booking.claimId).not.toBe(f.holdId)
    await expect(f.claims.repository.get(f.holdId)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'expired',
    })
    await expect(f.claims.repository.get(booking.claimId!)).resolves.toMatchObject({
      kind: 'booking',
      status: 'active',
      startsAt: SLOT_START,
      endsAt: SLOT_END,
    })
  })

  it('parks a late payment as needs_reschedule when another guest took the slot', async () => {
    const f = await paidSetup()
    f.advanceMinutes(20)
    const rival = await f.claims.repository.createBookingClaim({
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      now: new Date(NOW.getTime() + 20 * MS_PER_MINUTE),
    })
    expect(rival).not.toBeNull()

    const outcome = await f.service.processWebhookEvent(completedEvent('cs_test_1'))

    expect(outcome).toBe('booking_created')
    const booking = f.repo.bookings[0]
    expect(booking.status).toBe('needs_reschedule')
    expect(booking.claimId).toBeNull()
    expect(f.repo.events.map((event) => event.event)).toEqual([
      'payment_verified',
      'slot_conflict_detected',
    ])
    await expect(f.claims.repository.get(rival!.id)).resolves.toMatchObject({
      status: 'active',
    })
  })

  it('flags a session no intent ever claimed as an orphan', async () => {
    const f = fixture()

    await expect(
      f.service.processWebhookEvent(completedEvent('cs_never_seen')),
    ).resolves.toBe('orphan')
    await expect(f.service.processWebhookEvent(expiredEvent('cs_never_seen'))).resolves.toBe(
      'orphan',
    )
  })

  it('recovers a lost session attachment through the metadata intent id', async () => {
    const f = fixture()
    const created = await f.service.createHold(intake())
    if (created.outcome !== 'created') throw new Error('hold not created')
    const intentId = f.repo.intents[0].id

    const outcome = await f.service.processWebhookEvent(
      completedEvent('cs_lost_attachment', {
        metadata: { holdId: created.holdId, intentId },
      }),
    )

    expect(outcome).toBe('booking_created')
    expect(f.repo.intents[0].stripeCheckoutSessionId).toBe('cs_lost_attachment')
    expect(f.repo.bookings[0]).toMatchObject({
      intentId,
      claimId: created.holdId,
      status: 'finalizing',
      stripeCheckoutSessionId: 'cs_lost_attachment',
    })
  })

  it('ignores events that are not checkout lifecycle events', async () => {
    const f = fixture()

    await expect(
      f.service.processWebhookEvent({
        id: 'evt-unrelated',
        type: 'payment_intent.succeeded',
        object: { id: 'pi_test_1' },
      }),
    ).resolves.toBe('ignored')
  })
})

describe('Booking service alternate time requests', () => {
  it('stores a trimmed alternate time request', async () => {
    const f = fixture()

    const result = await f.service.createAlternateTimeRequest({
      guestName: ' Grace Hopper ',
      guestEmail: ' Grace@Example.com ',
      locale: 'en',
      guestTimeZone: 'America/New_York',
      preferredWindows: ' Weekday mornings ET ',
      note: '  Happy to flex  ',
    })

    expect(result).toEqual({ outcome: 'created' })
    expect(f.repo.alternateTimeRequests[0]).toMatchObject({
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      preferredWindows: 'Weekday mornings ET',
      note: 'Happy to flex',
      status: 'new',
    })
  })

  it.each([
    ['name', { guestName: ' ' }],
    ['email', { guestEmail: 'nope' }],
    ['locale', { locale: 'fr' as BookingLocale }],
    ['timeZone', { guestTimeZone: 'Nowhere/Zone' }],
    ['preferredWindows', { preferredWindows: '  ' }],
    ['preferredWindows', { preferredWindows: 'a'.repeat(1001) }],
    ['note', { note: 'a'.repeat(1001) }],
  ])('rejects an invalid alternate time request on %s', async (field, overrides) => {
    const f = fixture()

    await expect(
      f.service.createAlternateTimeRequest({
        guestName: 'Grace Hopper',
        guestEmail: 'grace@example.com',
        locale: 'en',
        guestTimeZone: 'America/New_York',
        preferredWindows: 'Weekday mornings ET',
        note: null,
        ...overrides,
      }),
    ).resolves.toEqual({ outcome: 'invalid', field })
    expect(f.repo.alternateTimeRequests).toHaveLength(0)
  })
})

import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import { createSlotClaimsRepository, type ClaimsDatabase } from './claims'
import { createBookingRepository, type BookingDatabase } from './repository'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const now = new Date('2026-08-01T00:00:00.000Z')
const holdExpiry = new Date(now.getTime() + 30 * MINUTE)

describe('Booking repository', () => {
  const getClient = usePGliteTestClient([
    '0001_ama_owner_auth.sql',
    '0002_ama_availability.sql',
    '0003_ama_google_calendar.sql',
    '0004_ama_google_oauth.sql',
    '0011_ama_booking_system.sql',
  ])
  let repository: ReturnType<typeof createBookingRepository>
  let claims: ReturnType<typeof createSlotClaimsRepository>

  beforeEach(() => {
    const database = drizzle(getClient())
    repository = createBookingRepository(() => database as unknown as BookingDatabase)
    claims = createSlotClaimsRepository(() => database as unknown as ClaimsDatabase)
  })

  async function createHoldClaim(startIso = '2026-08-10T02:00:00.000Z') {
    const startsAt = new Date(startIso)
    const hold = await claims.createHold({
      startsAt,
      endsAt: new Date(startsAt.getTime() + HOUR),
      expiresAt: holdExpiry,
      now,
    })
    if (!hold) throw new Error('test fixture failed to claim a free interval')
    return hold
  }

  async function createIntent(holdClaimId: string) {
    return repository.createIntent({
      holdClaimId,
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      locale: 'en',
      guestTimeZone: 'America/Los_Angeles',
      topics: ['engineering careers', 'independent products'],
      briefText: 'I would love advice on shipping my first product.',
      briefUrls: ['https://example.com/portfolio', 'https://example.com/draft'],
      meetingProvider: 'google-meet',
      now,
    })
  }

  async function createBookingFixture(
    startIso = '2026-08-10T02:00:00.000Z',
    sessionId = 'cs_fixture',
  ) {
    const hold = await createHoldClaim(startIso)
    const intent = await createIntent(hold.id)
    const claim = await claims.convertHoldToBooking(hold.id, now)
    if (!claim) throw new Error('test fixture failed to convert its hold')
    const { booking } = await repository.createBooking({
      intent,
      claimId: claim.id,
      status: 'finalizing',
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: `pi_${sessionId}`,
      amountTotal: 15_000,
      currency: 'usd',
      now,
    })
    return { booking, intent, claim }
  }

  it('round-trips a Booking Intent with its topics and brief URLs', async () => {
    const hold = await createHoldClaim()

    const intent = await createIntent(hold.id)

    expect(intent).toMatchObject({
      holdClaimId: hold.id,
      guestName: 'Ada Lovelace',
      topics: ['engineering careers', 'independent products'],
      briefUrls: ['https://example.com/portfolio', 'https://example.com/draft'],
      stripeCheckoutSessionId: null,
    })
    await expect(repository.getIntent(intent.id)).resolves.toMatchObject({
      id: intent.id,
      topics: ['engineering careers', 'independent products'],
      briefUrls: ['https://example.com/portfolio', 'https://example.com/draft'],
    })
    await expect(repository.getIntentByHoldClaim(hold.id)).resolves.toMatchObject({
      id: intent.id,
    })
  })

  it('attaches a Checkout Session exactly once', async () => {
    const hold = await createHoldClaim()
    const intent = await createIntent(hold.id)

    const attached = await repository.attachCheckoutSession(intent.id, 'cs_first', now)
    const reattached = await repository.attachCheckoutSession(
      intent.id,
      'cs_second',
      new Date(now.getTime() + MINUTE),
    )

    expect(attached?.stripeCheckoutSessionId).toBe('cs_first')
    expect(reattached?.stripeCheckoutSessionId).toBe('cs_first')
    await expect(repository.getIntentByCheckoutSession('cs_first')).resolves.toMatchObject({
      id: intent.id,
    })
    await expect(repository.getIntentByCheckoutSession('cs_second')).resolves.toBeNull()
  })

  it('stores exactly one Checkout Session under concurrent attaches', async () => {
    const hold = await createHoldClaim()
    const intent = await createIntent(hold.id)

    const [first, second] = await Promise.all([
      repository.attachCheckoutSession(intent.id, 'cs_left', now),
      repository.attachCheckoutSession(intent.id, 'cs_right', now),
    ])

    const stored = (await repository.getIntent(intent.id))?.stripeCheckoutSessionId
    expect(['cs_left', 'cs_right']).toContain(stored)
    expect(first?.stripeCheckoutSessionId).toBe(stored)
    expect(second?.stripeCheckoutSessionId).toBe(stored)
  })

  it('creates a Booking exactly once per Checkout Session', async () => {
    const hold = await createHoldClaim()
    const intent = await createIntent(hold.id)
    const claim = await claims.convertHoldToBooking(hold.id, now)
    const input = {
      intent,
      claimId: claim!.id,
      status: 'finalizing' as const,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      stripeCheckoutSessionId: 'cs_once',
      stripePaymentIntentId: 'pi_once',
      amountTotal: 15_000,
      currency: 'usd',
      now,
    }

    const first = await repository.createBooking(input)
    const replay = await repository.createBooking(input)

    expect(first.created).toBe(true)
    expect(first.booking).toMatchObject({
      intentId: intent.id,
      claimId: claim!.id,
      status: 'finalizing',
      guestName: intent.guestName,
      guestEmail: intent.guestEmail,
      locale: intent.locale,
      guestTimeZone: intent.guestTimeZone,
      topics: intent.topics,
      briefText: intent.briefText,
      briefUrls: intent.briefUrls,
      meetingProvider: intent.meetingProvider,
      startsAt: hold.startsAt,
      endsAt: hold.endsAt,
      amountTotal: 15_000,
      currency: 'usd',
      refundStatus: 'none',
    })
    expect(replay.created).toBe(false)
    expect(replay.booking.id).toBe(first.booking.id)
  })

  it('finds a Booking by id and by Checkout Session', async () => {
    const { booking } = await createBookingFixture('2026-08-10T02:00:00.000Z', 'cs_lookup')

    await expect(repository.getBooking(booking.id)).resolves.toMatchObject({
      id: booking.id,
    })
    await expect(repository.getBookingByCheckoutSession('cs_lookup')).resolves.toMatchObject({
      id: booking.id,
    })
    await expect(repository.getBookingByCheckoutSession('cs_missing')).resolves.toBeNull()
  })

  it('issues the Manage Link token hash exactly once', async () => {
    const { booking } = await createBookingFixture()
    const tokenHash = 'a'.repeat(64)

    const issued = await repository.setManageTokenHash(booking.id, tokenHash, now)
    const reissued = await repository.setManageTokenHash(booking.id, 'b'.repeat(64), now)

    expect(issued?.manageTokenHash).toBe(tokenHash)
    expect(reissued).toBeNull()
    await expect(repository.getBookingByManageTokenHash(tokenHash)).resolves.toMatchObject({
      id: booking.id,
    })
  })

  it('does not find a Booking by a revoked Manage Link token', async () => {
    const { booking } = await createBookingFixture()
    const tokenHash = 'c'.repeat(64)
    await repository.setManageTokenHash(booking.id, tokenHash, now)

    await getClient().query(
      'update ama_bookings set manage_token_revoked_at = $1 where id = $2',
      [now.toISOString(), booking.id],
    )

    await expect(repository.getBookingByManageTokenHash(tokenHash)).resolves.toBeNull()
  })

  it('stores meeting artifacts exactly once', async () => {
    const { booking } = await createBookingFixture()

    const stored = await repository.setMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      googleCalendarEventId: 'gcal_1',
      tencentMeetingId: null,
      now,
    })
    const retried = await repository.setMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl: 'https://meet.google.com/second-attempt',
      googleCalendarEventId: 'gcal_2',
      tencentMeetingId: null,
      now,
    })

    expect(stored).toMatchObject({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      googleCalendarEventId: 'gcal_1',
      meetingCreatedAt: now,
    })
    expect(retried).toBeNull()
    await expect(repository.getBooking(booking.id)).resolves.toMatchObject({
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    })
  })

  it('replaces and clears meeting artifacts', async () => {
    const { booking } = await createBookingFixture()
    await repository.setMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      googleCalendarEventId: 'gcal_1',
      tencentMeetingId: null,
      now,
    })
    const later = new Date(now.getTime() + HOUR)

    const replaced = await repository.replaceMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl: 'https://meeting.tencent.com/dm/xyz',
      googleCalendarEventId: null,
      tencentMeetingId: 'tencent_1',
      now: later,
    })
    const cleared = await repository.replaceMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl: null,
      googleCalendarEventId: null,
      tencentMeetingId: null,
      now: later,
    })

    expect(replaced).toMatchObject({
      meetingUrl: 'https://meeting.tencent.com/dm/xyz',
      googleCalendarEventId: null,
      tencentMeetingId: 'tencent_1',
      meetingCreatedAt: later,
    })
    expect(cleared).toMatchObject({
      meetingUrl: null,
      googleCalendarEventId: null,
      tencentMeetingId: null,
      meetingCreatedAt: null,
    })
  })

  it('transitions status only from an expected state', async () => {
    const { booking } = await createBookingFixture()

    const confirmed = await repository.transitionStatus({
      bookingId: booking.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })
    const repeated = await repository.transitionStatus({
      bookingId: booking.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })
    const wrongState = await repository.transitionStatus({
      bookingId: booking.id,
      from: ['needs_reschedule'],
      to: 'finalizing',
      now,
    })

    expect(confirmed?.status).toBe('confirmed')
    expect(repeated).toBeNull()
    expect(wrongState).toBeNull()
  })

  it('reschedules a Booking onto a new claim', async () => {
    const { booking } = await createBookingFixture()
    const newStartsAt = new Date('2026-08-12T02:00:00.000Z')
    const newEndsAt = new Date(newStartsAt.getTime() + HOUR)
    const newClaim = await claims.createBookingClaim({
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      now,
    })
    await repository.transitionStatus({
      bookingId: booking.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })

    const rescheduled = await repository.rescheduleBooking({
      bookingId: booking.id,
      expectedStartsAt: booking.startsAt,
      claimId: newClaim!.id,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      now,
    })

    expect(rescheduled).toMatchObject({
      claimId: newClaim!.id,
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      status: 'finalizing',
    })
  })

  it('rejects a reschedule against a stale expected start time', async () => {
    const { booking } = await createBookingFixture()
    const newStartsAt = new Date('2026-08-12T02:00:00.000Z')
    const newEndsAt = new Date(newStartsAt.getTime() + HOUR)
    const newClaim = await claims.createBookingClaim({
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      now,
    })

    await expect(
      repository.rescheduleBooking({
        bookingId: booking.id,
        expectedStartsAt: new Date('2026-08-15T02:00:00.000Z'),
        claimId: newClaim!.id,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        now,
      }),
    ).resolves.toBeNull()
  })

  it('does not reschedule a cancelled Booking', async () => {
    const { booking } = await createBookingFixture()
    await repository.cancelBooking({ bookingId: booking.id, cancelledBy: 'guest', now })
    const newStartsAt = new Date('2026-08-12T02:00:00.000Z')
    const newEndsAt = new Date(newStartsAt.getTime() + HOUR)
    const newClaim = await claims.createBookingClaim({
      startsAt: newStartsAt,
      endsAt: newEndsAt,
      now,
    })

    await expect(
      repository.rescheduleBooking({
        bookingId: booking.id,
        expectedStartsAt: booking.startsAt,
        claimId: newClaim!.id,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        now,
      }),
    ).resolves.toBeNull()
  })

  it('cancels a Booking exactly once', async () => {
    const { booking } = await createBookingFixture()

    const cancelled = await repository.cancelBooking({
      bookingId: booking.id,
      cancelledBy: 'guest',
      now,
    })
    const repeated = await repository.cancelBooking({
      bookingId: booking.id,
      cancelledBy: 'owner',
      now,
    })

    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: 'guest',
    })
    expect(repeated).toBeNull()
  })

  it('begins a refund only from none or failed', async () => {
    const { booking } = await createBookingFixture()

    const begun = await repository.beginRefund({
      bookingId: booking.id,
      reason: 'guest_cancellation',
      now,
    })
    const duplicate = await repository.beginRefund({
      bookingId: booking.id,
      reason: 'owner_exception',
      now,
    })
    await repository.failRefund(booking.id, now)
    const retried = await repository.beginRefund({
      bookingId: booking.id,
      reason: 'guest_cancellation',
      now,
    })

    expect(begun).toMatchObject({
      refundStatus: 'pending',
      refundReason: 'guest_cancellation',
    })
    expect(duplicate).toBeNull()
    expect(retried?.refundStatus).toBe('pending')
  })

  it('completes a refund only from pending', async () => {
    const { booking } = await createBookingFixture()

    await expect(
      repository.completeRefund({ bookingId: booking.id, stripeRefundId: 're_early', now }),
    ).resolves.toBeNull()

    await repository.beginRefund({
      bookingId: booking.id,
      reason: 'guest_cancellation',
      now,
    })
    const completed = await repository.completeRefund({
      bookingId: booking.id,
      stripeRefundId: 're_1',
      now,
    })

    expect(completed).toMatchObject({
      refundStatus: 'refunded',
      stripeRefundId: 're_1',
      refundedAt: now,
    })
    await expect(
      repository.beginRefund({ bookingId: booking.id, reason: 'owner_exception', now }),
    ).resolves.toBeNull()
  })

  it('marks a refund failed only from pending', async () => {
    const { booking } = await createBookingFixture()

    await expect(repository.failRefund(booking.id, now)).resolves.toBeNull()

    await repository.beginRefund({
      bookingId: booking.id,
      reason: 'owner_cancellation',
      now,
    })

    await expect(repository.failRefund(booking.id, now)).resolves.toMatchObject({
      refundStatus: 'failed',
    })
  })

  it('purges the Booking Brief exactly once', async () => {
    const { booking } = await createBookingFixture()
    const purgeAt = new Date(now.getTime() + HOUR)

    const purged = await repository.purgeBrief(booking.id, purgeAt)
    const repeated = await repository.purgeBrief(booking.id, purgeAt)

    expect(purged).toMatchObject({
      briefText: null,
      briefUrls: null,
      briefPurgedAt: purgeAt,
    })
    expect(repeated).toBeNull()
  })

  it('separates upcoming and past Bookings', async () => {
    const past = await createBookingFixture('2026-07-20T02:00:00.000Z', 'cs_past')
    const upcoming = await createBookingFixture('2026-08-10T02:00:00.000Z', 'cs_upcoming')

    const upcomingView = await repository.listBookings({ view: 'upcoming', now })
    const pastView = await repository.listBookings({ view: 'past', now })

    expect(upcomingView.map((booking) => booking.id)).toEqual([upcoming.booking.id])
    expect(pastView.map((booking) => booking.id)).toEqual([past.booking.id])
  })

  it('surfaces Bookings that need attention', async () => {
    const finalizing = await createBookingFixture('2026-08-10T02:00:00.000Z', 'cs_final')
    const rescheduling = await createBookingFixture('2026-08-11T02:00:00.000Z', 'cs_resch')
    await repository.transitionStatus({
      bookingId: rescheduling.booking.id,
      from: ['finalizing'],
      to: 'needs_reschedule',
      now,
    })
    const refundFailed = await createBookingFixture('2026-08-12T02:00:00.000Z', 'cs_refund')
    await repository.transitionStatus({
      bookingId: refundFailed.booking.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })
    await repository.beginRefund({
      bookingId: refundFailed.booking.id,
      reason: 'owner_exception',
      now,
    })
    await repository.failRefund(refundFailed.booking.id, now)
    const healthy = await createBookingFixture('2026-08-13T02:00:00.000Z', 'cs_healthy')
    await repository.transitionStatus({
      bookingId: healthy.booking.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })

    const attention = await repository.listBookings({ view: 'attention', now })

    expect(attention.map((booking) => booking.id)).toEqual([
      finalizing.booking.id,
      rescheduling.booking.id,
      refundFailed.booking.id,
    ])
  })

  it('appends and lists Booking events in occurrence order', async () => {
    const { booking } = await createBookingFixture()
    const later = new Date(now.getTime() + 10 * MINUTE)

    await repository.appendEvent({
      bookingId: booking.id,
      event: 'booking_confirmed',
      actor: 'system',
      occurredAt: later,
      detail: { meetingProvider: 'google-meet' },
    })
    await repository.appendEvent({
      bookingId: booking.id,
      event: 'payment_verified',
      actor: 'provider',
      occurredAt: now,
    })

    const events = await repository.listEvents(booking.id)

    expect(events.map(({ event, actor, occurredAt }) => ({ event, actor, occurredAt }))).toEqual([
      { event: 'payment_verified', actor: 'provider', occurredAt: now },
      { event: 'booking_confirmed', actor: 'system', occurredAt: later },
    ])
    expect(events[1]?.detail).toEqual({ meetingProvider: 'google-meet' })
  })

  it('records a provider event exactly once and tracks its outcome', async () => {
    const first = await repository.recordProviderEvent({
      provider: 'stripe',
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
      receivedAt: now,
    })
    const replay = await repository.recordProviderEvent({
      provider: 'stripe',
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
      receivedAt: new Date(now.getTime() + MINUTE),
    })

    expect(first).toBe(true)
    expect(replay).toBe(false)

    const processedAt = new Date(now.getTime() + 5 * MINUTE)
    await repository.markProviderEventProcessed({
      provider: 'stripe',
      eventId: 'evt_1',
      outcome: 'booking_created',
      processedAt,
    })

    await expect(repository.getProviderEvent('stripe', 'evt_1')).resolves.toMatchObject({
      eventType: 'checkout.session.completed',
      processedAt,
      outcome: 'booking_created',
    })
  })

  it('creates and lists Alternate Time Requests by status', async () => {
    const first = await repository.createAlternateTimeRequest({
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      locale: 'en',
      guestTimeZone: 'America/New_York',
      preferredWindows: 'Weekday evenings after 6pm ET',
      note: 'Any week in August works.',
      now,
    })
    const second = await repository.createAlternateTimeRequest({
      guestName: 'Lin Hua',
      guestEmail: 'lin@example.com',
      locale: 'zh',
      guestTimeZone: 'Asia/Shanghai',
      preferredWindows: 'Weekend mornings',
      note: null,
      now: new Date(now.getTime() + MINUTE),
    })
    await repository.resolveAlternateTimeRequest(second.id, 'dismissed', now)

    expect(first).toMatchObject({ status: 'new', resolvedAt: null })
    await expect(repository.listAlternateTimeRequests('new')).resolves.toMatchObject([
      { id: first.id },
    ])
    await expect(repository.listAlternateTimeRequests('dismissed')).resolves.toMatchObject([
      { id: second.id },
    ])
    await expect(repository.listAlternateTimeRequests()).resolves.toHaveLength(2)
  })

  it('resolves an Alternate Time Request exactly once', async () => {
    const request = await repository.createAlternateTimeRequest({
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      locale: 'en',
      guestTimeZone: 'America/New_York',
      preferredWindows: 'Weekday evenings after 6pm ET',
      note: null,
      now,
    })
    const resolveAt = new Date(now.getTime() + HOUR)

    const resolved = await repository.resolveAlternateTimeRequest(
      request.id,
      'resolved',
      resolveAt,
    )
    const repeated = await repository.resolveAlternateTimeRequest(
      request.id,
      'dismissed',
      resolveAt,
    )

    expect(resolved).toMatchObject({ status: 'resolved', resolvedAt: resolveAt })
    expect(repeated).toBeNull()
  })
})

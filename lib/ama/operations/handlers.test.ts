import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { EmailMessage } from '../email/types'
import { EmailDeliveryError } from '../email/types'
import type {
  BookingCalendar,
  CalendarEventInput,
  CalendarEventResult,
  CalendarMutationResult,
} from '../meeting/calendar'
import type { MeetingCreateInput, MeetingProviderAdapter } from '../meeting/types'
import { MeetingProviderError } from '../meeting/types'
import { StripeError } from '../stripe/client'
import { deriveManageToken, manageTokenHash } from '../booking/manage-token'
import type { BookingRecord, BookingRepository } from '../booking/repository'
import type { SlotClaimsRepository } from '../booking/claims'
import type {
  DurableOperationRecord,
  DurableOperationsRepository,
} from './repository'
import {
  createOperationHandlers,
  deriveCalendarEventId,
  RetryableOperationError,
  TerminalOperationError,
} from './handlers'

const NOW = new Date('2026-07-01T12:00:00Z')
const STARTS_AT = new Date('2026-07-10T09:00:00Z')
const ENDS_AT = new Date('2026-07-10T10:00:00Z')
const ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
const BASE_URL = new URL('https://cali.so')

function makeBooking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'bk_1',
    intentId: 'intent_1',
    claimId: 'claim_1',
    status: 'finalizing',
    guestName: 'Ada Lovelace',
    guestEmail: 'ada@example.com',
    locale: 'en',
    guestTimeZone: 'America/Los_Angeles',
    topics: ['engineering', 'career'],
    briefText: 'A brief.',
    briefUrls: [],
    briefPurgedAt: null,
    meetingProvider: 'google-meet',
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    stripeCheckoutSessionId: 'cs_1',
    stripePaymentIntentId: 'pi_1',
    amountTotal: 9900,
    currency: 'usd',
    refundStatus: 'none',
    stripeRefundId: null,
    refundedAt: null,
    refundReason: null,
    cancelledAt: null,
    cancelledBy: null,
    meetingUrl: null,
    googleCalendarEventId: null,
    tencentMeetingId: null,
    meetingCreatedAt: null,
    manageTokenHash: null,
    manageTokenRevokedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

function makeOperation(
  overrides: Partial<DurableOperationRecord> = {},
): DurableOperationRecord {
  return {
    id: 'op_1',
    kind: 'finalize_booking',
    dedupeKey: 'op-dedupe',
    bookingId: 'bk_1',
    payload: {},
    status: 'running',
    attemptCount: 1,
    maxAttempts: 8,
    nextAttemptAt: NOW,
    leaseToken: 'lease-1',
    leaseExpiresAt: null,
    lastErrorCode: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

type EnqueuedOperation = {
  kind: string
  dedupeKey: string
  bookingId: string | null | undefined
  payload: Record<string, unknown> | undefined
  nextAttemptAt: Date
}

function fixture(bookingOverrides: Partial<BookingRecord> = {}) {
  let now = NOW
  const booking = makeBooking(bookingOverrides)

  const events: { event: string; actor: string; detail?: Record<string, unknown> }[] = []
  const setManageTokenHashCalls: string[] = []
  const setMeetingArtifactsCalls: unknown[] = []
  const transitions: { from: readonly string[]; to: string }[] = []
  const repository = {
    async getBooking(id: string) {
      return id === booking.id ? booking : null
    },
    async setManageTokenHash(id: string, tokenHash: string) {
      if (id !== booking.id || booking.manageTokenHash !== null) return null
      setManageTokenHashCalls.push(tokenHash)
      booking.manageTokenHash = tokenHash
      return booking
    },
    async setMeetingArtifacts(input: {
      bookingId: string
      meetingUrl: string
      googleCalendarEventId: string | null
      tencentMeetingId: string | null
    }) {
      if (input.bookingId !== booking.id || booking.meetingUrl !== null) return null
      setMeetingArtifactsCalls.push(input)
      booking.meetingUrl = input.meetingUrl
      booking.googleCalendarEventId = input.googleCalendarEventId
      booking.tencentMeetingId = input.tencentMeetingId
      booking.meetingCreatedAt = now
      return booking
    },
    async replaceMeetingArtifacts(input: {
      bookingId: string
      meetingUrl: string | null
      googleCalendarEventId: string | null
      tencentMeetingId: string | null
    }) {
      if (input.bookingId !== booking.id) return null
      booking.meetingUrl = input.meetingUrl
      booking.googleCalendarEventId = input.googleCalendarEventId
      booking.tencentMeetingId = input.tencentMeetingId
      return booking
    },
    async transitionStatus(input: {
      bookingId: string
      from: readonly BookingRecord['status'][]
      to: BookingRecord['status']
    }) {
      transitions.push({ from: input.from, to: input.to })
      if (input.bookingId !== booking.id || !input.from.includes(booking.status)) {
        return null
      }
      booking.status = input.to
      return booking
    },
    async appendEvent(input: {
      bookingId: string
      event: string
      actor: string
      detail?: Record<string, unknown>
    }) {
      events.push({ event: input.event, actor: input.actor, detail: input.detail })
    },
    async purgeBrief(id: string, purgedAt: Date) {
      if (id !== booking.id || booking.briefPurgedAt !== null) return null
      booking.briefText = null
      booking.briefUrls = null
      booking.briefPurgedAt = purgedAt
      return booking
    },
    async beginRefund() {
      return booking
    },
    async completeRefund(input: { bookingId: string; stripeRefundId: string }) {
      if (input.bookingId !== booking.id || booking.refundStatus !== 'pending') {
        return null
      }
      booking.refundStatus = 'refunded'
      booking.stripeRefundId = input.stripeRefundId
      return booking
    },
    async failRefund(id: string) {
      if (id !== booking.id || booking.refundStatus !== 'pending') return null
      booking.refundStatus = 'failed'
      return booking
    },
  } as unknown as BookingRepository

  const enqueued: EnqueuedOperation[] = []
  const dedupeKeys = new Set<string>()
  const operations = {
    async enqueue(input: EnqueuedOperation & { now: Date }) {
      const created = !dedupeKeys.has(input.dedupeKey)
      if (created) {
        dedupeKeys.add(input.dedupeKey)
        enqueued.push({
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          bookingId: input.bookingId,
          payload: input.payload,
          nextAttemptAt: input.nextAttemptAt,
        })
      }
      return { operation: makeOperation({ dedupeKey: input.dedupeKey }), created }
    },
  } as unknown as DurableOperationsRepository

  const createEventCalls: CalendarEventInput[] = []
  const moveEventCalls: { eventId: string; startsAt: Date; endsAt: Date }[] = []
  const deleteEventCalls: string[] = []
  const calendarState = {
    nextCreateResults: [] as CalendarEventResult[],
    moveResult: { status: 'done' } as CalendarMutationResult,
    deleteResult: { status: 'done' } as CalendarMutationResult,
  }
  const calendar: BookingCalendar = {
    async createEvent(input) {
      createEventCalls.push(input)
      return (
        calendarState.nextCreateResults.shift() ?? {
          status: 'created',
          meetUrl: 'https://meet.google.com/fake-meet',
        }
      )
    },
    async moveEvent(input) {
      moveEventCalls.push(input)
      return calendarState.moveResult
    },
    async deleteEvent(eventId) {
      deleteEventCalls.push(eventId)
      return calendarState.deleteResult
    },
  }

  const tencentCreateCalls: MeetingCreateInput[] = []
  const tencentCancelCalls: string[] = []
  const tencentState = {
    createError: null as Error | null,
    cancelResult: 'cancelled' as 'cancelled' | 'unsupported',
    cancelError: null as Error | null,
  }
  const tencent: MeetingProviderAdapter = {
    name: 'tencent-meeting',
    capabilities: { cancellation: false },
    async createMeeting(input) {
      tencentCreateCalls.push(input)
      if (tencentState.createError) throw tencentState.createError
      return {
        meetingUrl: 'https://meeting.tencent.com/dm/fake',
        providerMeetingId: 'tm_1',
      }
    },
    async cancelMeeting(providerMeetingId) {
      tencentCancelCalls.push(providerMeetingId)
      if (tencentState.cancelError) throw tencentState.cancelError
      return tencentState.cancelResult
    },
  }

  const emailSends: { message: EmailMessage; idempotencyKey: string }[] = []
  const emailState = { sendError: null as Error | null }
  const email = {
    async send(message: EmailMessage, idempotencyKey: string) {
      if (emailState.sendError) throw emailState.sendError
      emailSends.push({ message, idempotencyKey })
      return { id: 'resend-id' }
    },
  }

  const refundCalls: { idempotencyKey: string; paymentIntentId: string }[] = []
  const stripeState = { refundError: null as Error | null }
  const stripe = {
    async createRefund(input: { idempotencyKey: string; paymentIntentId: string }) {
      if (stripeState.refundError) throw stripeState.refundError
      refundCalls.push(input)
      return { id: 're_1', status: 'succeeded' }
    },
  }

  const build = (overrides: { tencent?: MeetingProviderAdapter | null; stripe?: typeof stripe | null } = {}) =>
    createOperationHandlers({
      repository,
      claims: {} as SlotClaimsRepository,
      operations,
      calendar,
      tencent: 'tencent' in overrides ? overrides.tencent! : tencent,
      email,
      stripe: 'stripe' in overrides ? overrides.stripe! : stripe,
      encryptionKey: ENCRYPTION_KEY,
      baseUrl: BASE_URL,
      clock: { now: () => now },
    })

  return {
    booking,
    events,
    setManageTokenHashCalls,
    setMeetingArtifactsCalls,
    transitions,
    enqueued,
    createEventCalls,
    moveEventCalls,
    deleteEventCalls,
    calendarState,
    tencentCreateCalls,
    tencentCancelCalls,
    tencentState,
    emailSends,
    emailState,
    refundCalls,
    stripeState,
    handle: build(),
    build,
    setNow(next: Date) {
      now = next
    },
  }
}

const finalizeOp = (payload: Record<string, unknown> = {}) =>
  makeOperation({
    kind: 'finalize_booking',
    dedupeKey: `finalize:bk_1:${STARTS_AT.toISOString()}`,
    payload: { startsAt: STARTS_AT.toISOString(), email: 'confirmation', ...payload },
  })

describe('finalize_booking', () => {
  it('creates the Google Meet calendar event with a deterministic id and stores artifacts', async () => {
    const f = fixture()

    await f.handle(finalizeOp())

    const expectedEventId = deriveCalendarEventId('bk_1', STARTS_AT)
    expect(f.createEventCalls).toHaveLength(1)
    expect(f.createEventCalls[0]).toMatchObject({
      eventId: expectedEventId,
      withMeetConference: true,
      guestEmail: 'ada@example.com',
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
    })
    expect(f.setMeetingArtifactsCalls).toHaveLength(1)
    expect(f.booking.meetingUrl).toBe('https://meet.google.com/fake-meet')
    expect(f.booking.googleCalendarEventId).toBe(expectedEventId)
  })

  it('enqueues the confirmation email and both reminders keyed by start time', async () => {
    const f = fixture()

    await f.handle(finalizeOp())

    const iso = STARTS_AT.toISOString()
    expect(f.enqueued.map((op) => op.dedupeKey)).toEqual([
      `email:confirmation:bk_1:${iso}`,
      `reminder:24h:bk_1:${iso}`,
      `reminder:1h:bk_1:${iso}`,
    ])
    const [, reminder24h, reminder1h] = f.enqueued
    expect(reminder24h.nextAttemptAt).toEqual(
      new Date(STARTS_AT.getTime() - 24 * 60 * 60_000),
    )
    expect(reminder1h.nextAttemptAt).toEqual(
      new Date(STARTS_AT.getTime() - 60 * 60_000),
    )
    expect(reminder24h.payload).toEqual({ reminder: '24h', startsAt: iso })
  })

  it('skips reminders whose send time has already passed', async () => {
    const soon = new Date(NOW.getTime() + 30 * 60_000)
    const f = fixture({
      startsAt: soon,
      endsAt: new Date(soon.getTime() + 60 * 60_000),
    })

    await f.handle(
      makeOperation({
        kind: 'finalize_booking',
        payload: { startsAt: soon.toISOString(), email: 'confirmation' },
      }),
    )

    expect(f.enqueued.map((op) => op.kind)).toEqual(['send_booking_email'])
  })

  it('confirms the Booking, appends the finalized event, and issues the manage token once', async () => {
    const f = fixture()

    await f.handle(finalizeOp())
    await f.handle(finalizeOp())

    expect(f.booking.status).toBe('confirmed')
    expect(f.events.map((event) => event.event)).toContain('finalized')
    const expectedHash = manageTokenHash(deriveManageToken(ENCRYPTION_KEY, 'bk_1'))
    expect(f.setManageTokenHashCalls).toEqual([expectedHash])
    expect(f.booking.manageTokenHash).toBe(expectedHash)
  })

  it('provisions Tencent Meeting artifacts and a conference-free calendar event', async () => {
    const f = fixture({ meetingProvider: 'tencent-meeting' })

    await f.handle(finalizeOp())

    expect(f.tencentCreateCalls).toHaveLength(1)
    expect(f.tencentCreateCalls[0].subject).toBe('AMA Session with Ada Lovelace')
    expect(f.createEventCalls[0].withMeetConference).toBe(false)
    expect(f.createEventCalls[0].location).toBe('https://meeting.tencent.com/dm/fake')
    expect(f.createEventCalls[0].description).toContain(
      'https://meeting.tencent.com/dm/fake',
    )
    expect(f.booking.meetingUrl).toBe('https://meeting.tencent.com/dm/fake')
    expect(f.booking.tencentMeetingId).toBe('tm_1')
  })

  it('reuses the same calendar event id on a retry after a pre-store crash', async () => {
    const f = fixture()
    f.calendarState.nextCreateResults.push({ status: 'unavailable' })

    await expect(f.handle(finalizeOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'calendar_unavailable',
    })
    await f.handle(finalizeOp())

    expect(f.createEventCalls).toHaveLength(2)
    expect(f.createEventCalls[0].eventId).toBe(f.createEventCalls[1].eventId)
    expect(f.createEventCalls[1].eventId).toBe(deriveCalendarEventId('bk_1', STARTS_AT))
    expect(f.setMeetingArtifactsCalls).toHaveLength(1)
  })

  it('does not create another meeting when artifacts are already stored', async () => {
    const f = fixture({
      meetingUrl: 'https://meet.google.com/existing',
      googleCalendarEventId: 'evt-existing',
    })

    await f.handle(finalizeOp())

    expect(f.createEventCalls).toHaveLength(0)
    expect(f.enqueued.map((op) => op.kind)).toEqual([
      'send_booking_email',
      'send_reminder',
      'send_reminder',
    ])
    expect(f.booking.status).toBe('confirmed')
  })

  it('routes a needs_reschedule Booking to its apology email without meeting work', async () => {
    const f = fixture({ status: 'needs_reschedule' })

    await f.handle(finalizeOp())

    expect(f.createEventCalls).toHaveLength(0)
    expect(f.tencentCreateCalls).toHaveLength(0)
    expect(f.enqueued).toEqual([
      expect.objectContaining({
        kind: 'send_booking_email',
        dedupeKey: 'email:needs_reschedule:bk_1',
        payload: { kind: 'needs_reschedule' },
      }),
    ])
    expect(f.setManageTokenHashCalls).toHaveLength(1)
  })

  it('treats a cancelled Booking as a no-op', async () => {
    const f = fixture({ status: 'cancelled' })

    await f.handle(finalizeOp())

    expect(f.createEventCalls).toHaveLength(0)
    expect(f.enqueued).toEqual([])
    expect(f.setManageTokenHashCalls).toHaveLength(0)
    expect(f.transitions).toEqual([])
  })

  it('treats a stale payload start time as a superseded no-op', async () => {
    const f = fixture()

    await f.handle(
      makeOperation({
        kind: 'finalize_booking',
        payload: { startsAt: '2026-07-09T09:00:00.000Z', email: 'confirmation' },
      }),
    )

    expect(f.createEventCalls).toHaveLength(0)
    expect(f.enqueued).toEqual([])
    expect(f.transitions).toEqual([])
  })

  it('retries when the meet link is missing from a created event', async () => {
    const f = fixture()
    f.calendarState.nextCreateResults.push({ status: 'created', meetUrl: null })

    await expect(f.handle(finalizeOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'meeting_link_missing',
    })
    expect(f.setMeetingArtifactsCalls).toHaveLength(0)
  })

  it('retries when the Tencent provider fails', async () => {
    const f = fixture({ meetingProvider: 'tencent-meeting' })
    f.tencentState.createError = new MeetingProviderError(
      'provider_unavailable',
      'down',
    )

    await expect(f.handle(finalizeOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'tencent_provider_unavailable',
    })
  })

  it('retries when the Tencent feature is disabled', async () => {
    const f = fixture({ meetingProvider: 'tencent-meeting' })

    await expect(f.build({ tencent: null })(finalizeOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'tencent_disabled',
    })
  })
})

describe('update_booking_artifacts', () => {
  const updateOp = () =>
    makeOperation({
      kind: 'update_booking_artifacts',
      dedupeKey: `artifacts:bk_1:${STARTS_AT.toISOString()}`,
      payload: { startsAt: STARTS_AT.toISOString() },
    })

  it('moves the existing calendar event and re-enqueues deliveries', async () => {
    const f = fixture({
      meetingUrl: 'https://meet.google.com/existing',
      googleCalendarEventId: 'evt-existing',
    })

    await f.handle(updateOp())

    expect(f.moveEventCalls).toEqual([
      { eventId: 'evt-existing', startsAt: STARTS_AT, endsAt: ENDS_AT },
    ])
    expect(f.createEventCalls).toHaveLength(0)
    const iso = STARTS_AT.toISOString()
    expect(f.enqueued.map((op) => op.dedupeKey)).toEqual([
      `email:rescheduled:bk_1:${iso}`,
      `reminder:24h:bk_1:${iso}`,
      `reminder:1h:bk_1:${iso}`,
    ])
    expect(f.booking.status).toBe('confirmed')
    expect(f.events.map((event) => event.event)).toContain('artifacts_updated')
  })

  it('re-creates the event with the derived id when the original went missing', async () => {
    const f = fixture({
      meetingUrl: 'https://meet.google.com/existing',
      googleCalendarEventId: 'evt-old',
    })
    f.calendarState.moveResult = { status: 'missing' }

    await f.handle(updateOp())

    expect(f.createEventCalls).toHaveLength(1)
    expect(f.createEventCalls[0].eventId).toBe(deriveCalendarEventId('bk_1', STARTS_AT))
    expect(f.createEventCalls[0].eventId).not.toBe('evt-old')
    expect(f.setMeetingArtifactsCalls).toHaveLength(1)
    expect(f.booking.meetingUrl).toBe('https://meet.google.com/fake-meet')
  })

  it('retries when the calendar move fails for provider reasons', async () => {
    const f = fixture({ googleCalendarEventId: 'evt-existing' })
    f.calendarState.moveResult = { status: 'unavailable' }

    await expect(f.handle(updateOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'calendar_unavailable',
    })
  })

  it('treats a stale payload start time as a no-op', async () => {
    const f = fixture({ googleCalendarEventId: 'evt-existing' })

    await f.handle(
      makeOperation({
        kind: 'update_booking_artifacts',
        payload: { startsAt: '2026-07-09T09:00:00.000Z' },
      }),
    )

    expect(f.moveEventCalls).toHaveLength(0)
    expect(f.enqueued).toEqual([])
  })

  it('treats a cancelled Booking as a no-op', async () => {
    const f = fixture({ status: 'cancelled', googleCalendarEventId: 'evt-existing' })

    await f.handle(updateOp())

    expect(f.moveEventCalls).toHaveLength(0)
    expect(f.enqueued).toEqual([])
  })
})

describe('remove_booking_artifacts', () => {
  const removeOp = () =>
    makeOperation({ kind: 'remove_booking_artifacts', dedupeKey: 'remove-artifacts:bk_1' })

  it('deletes the calendar event and records the removal', async () => {
    const f = fixture({ googleCalendarEventId: 'evt-existing' })

    await f.handle(removeOp())

    expect(f.deleteEventCalls).toEqual(['evt-existing'])
    expect(f.events).toEqual([
      { event: 'artifacts_removed', actor: 'system', detail: {} },
    ])
  })

  it('treats an already-missing calendar event as removed', async () => {
    const f = fixture({ googleCalendarEventId: 'evt-existing' })
    f.calendarState.deleteResult = { status: 'missing' }

    await f.handle(removeOp())

    expect(f.events.map((event) => event.event)).toEqual(['artifacts_removed'])
  })

  it('records an unsupported Tencent cancellation without failing', async () => {
    const f = fixture({ tencentMeetingId: 'tm_1' })
    f.tencentState.cancelResult = 'unsupported'

    await f.handle(removeOp())

    expect(f.tencentCancelCalls).toEqual(['tm_1'])
    expect(f.events).toEqual([
      {
        event: 'artifacts_removed',
        actor: 'system',
        detail: { tencentCleanup: 'unsupported' },
      },
    ])
  })

  it('retries when the calendar is unavailable', async () => {
    const f = fixture({ googleCalendarEventId: 'evt-existing' })
    f.calendarState.deleteResult = { status: 'unavailable' }

    await expect(f.handle(removeOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'calendar_unavailable',
    })
    expect(f.events).toEqual([])
  })
})

describe('send_booking_email', () => {
  const emailOp = (payload: Record<string, unknown>, dedupeKey = 'email-dedupe') =>
    makeOperation({ kind: 'send_booking_email', dedupeKey, payload })

  it.each(['confirmation', 'rescheduled', 'needs_reschedule'] as const)(
    'sends the %s email with the dedupe key as idempotency key and a manage link',
    async (kind) => {
      const f = fixture({ meetingUrl: 'https://meet.google.com/existing' })
      const dedupeKey = `email:${kind}:bk_1`

      await f.handle(emailOp({ kind }, dedupeKey))

      expect(f.emailSends).toHaveLength(1)
      const sent = f.emailSends[0]
      expect(sent.idempotencyKey).toBe(dedupeKey)
      expect(sent.message.to).toBe('ada@example.com')
      const rawToken = deriveManageToken(ENCRYPTION_KEY, 'bk_1')
      expect(sent.message.text).toContain(`https://cali.so/en/ama/manage/${rawToken}`)
      expect(f.events.at(-1)).toMatchObject({ event: 'email_sent', detail: { kind } })
    },
  )

  it('builds the manage link without a locale prefix for Chinese guests', async () => {
    const f = fixture({ locale: 'zh', meetingUrl: 'https://meet.google.com/existing' })

    await f.handle(emailOp({ kind: 'confirmation' }))

    const rawToken = deriveManageToken(ENCRYPTION_KEY, 'bk_1')
    expect(f.emailSends[0].message.text).toContain(
      `https://cali.so/ama/manage/${rawToken}`,
    )
    expect(f.emailSends[0].message.text).not.toContain('/en/ama/manage/')
  })

  it('sends the cancellation email with the automatic refund note and no manage link', async () => {
    const f = fixture({ status: 'cancelled' })

    await f.handle(emailOp({ kind: 'cancelled', refund: 'automatic' }))

    expect(f.emailSends).toHaveLength(1)
    expect(f.emailSends[0].message.subject).toBe(
      'Your AMA Session has been cancelled',
    )
    expect(f.emailSends[0].message.text).toContain('A full refund has been issued')
    expect(f.emailSends[0].message.text).not.toContain('/ama/manage/')
  })

  it('sends the cancellation email with the no-refund policy note', async () => {
    const f = fixture({ status: 'cancelled' })

    await f.handle(emailOp({ kind: 'cancelled', refund: 'none' }))

    expect(f.emailSends[0].message.text).toContain('not automatically refunded')
  })

  it('skips non-cancellation emails for a cancelled Booking', async () => {
    const f = fixture({ status: 'cancelled' })

    await f.handle(emailOp({ kind: 'confirmation' }))

    expect(f.emailSends).toEqual([])
    expect(f.events).toEqual([])
  })

  it('fails terminally for an unknown email kind', async () => {
    const f = fixture()

    await expect(f.handle(emailOp({ kind: 'party' }))).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'unknown_email_kind',
    })
  })

  it('fails terminally when the provider rejects the message', async () => {
    const f = fixture()
    f.emailState.sendError = new EmailDeliveryError('invalid_request', 'bad')

    await expect(f.handle(emailOp({ kind: 'confirmation' }))).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'email_invalid_request',
    })
  })

  it('retries when the email provider is unavailable', async () => {
    const f = fixture()
    f.emailState.sendError = new EmailDeliveryError('provider_unavailable', 'down')

    await expect(f.handle(emailOp({ kind: 'confirmation' }))).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'email_unavailable',
    })
  })
})

describe('send_reminder', () => {
  const reminderOp = (payload: Record<string, unknown>, dedupeKey = 'reminder-dedupe') =>
    makeOperation({ kind: 'send_reminder', dedupeKey, payload })

  it.each([
    ['24h', 'Your AMA Session is in 24 hours'],
    ['1h', 'Your AMA Session starts in 1 hour'],
  ] as const)('sends the %s reminder with the dedupe key', async (reminder, subject) => {
    const f = fixture({
      status: 'confirmed',
      meetingUrl: 'https://meet.google.com/existing',
    })
    const dedupeKey = `reminder:${reminder}:bk_1`

    await f.handle(
      reminderOp({ reminder, startsAt: STARTS_AT.toISOString() }, dedupeKey),
    )

    expect(f.emailSends).toHaveLength(1)
    expect(f.emailSends[0].idempotencyKey).toBe(dedupeKey)
    expect(f.emailSends[0].message.subject).toBe(subject)
    expect(f.events.at(-1)).toMatchObject({
      event: 'reminder_sent',
      detail: { reminder },
    })
  })

  it('skips a reminder whose payload start time is stale', async () => {
    const f = fixture({ status: 'confirmed' })

    await f.handle(
      reminderOp({ reminder: '24h', startsAt: '2026-07-09T09:00:00.000Z' }),
    )

    expect(f.emailSends).toEqual([])
  })

  it.each(['cancelled', 'needs_reschedule'] as const)(
    'skips reminders for a %s Booking',
    async (status) => {
      const f = fixture({ status })

      await f.handle(
        reminderOp({ reminder: '24h', startsAt: STARTS_AT.toISOString() }),
      )

      expect(f.emailSends).toEqual([])
    },
  )

  it('skips reminders once the session has started', async () => {
    const f = fixture({ status: 'confirmed' })
    f.setNow(new Date(STARTS_AT.getTime() + 1))

    await f.handle(
      reminderOp({ reminder: '1h', startsAt: STARTS_AT.toISOString() }),
    )

    expect(f.emailSends).toEqual([])
  })

  it('fails terminally for an unknown reminder kind', async () => {
    const f = fixture({ status: 'confirmed' })

    await expect(
      f.handle(reminderOp({ reminder: '5m', startsAt: STARTS_AT.toISOString() })),
    ).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'unknown_reminder_kind',
    })
  })
})

describe('issue_refund', () => {
  const refundOp = () =>
    makeOperation({ kind: 'issue_refund', dedupeKey: 'refund:bk_1' })

  it('issues the Stripe refund idempotently and completes the record', async () => {
    const f = fixture({ refundStatus: 'pending' })

    await f.handle(refundOp())

    expect(f.refundCalls).toEqual([
      { idempotencyKey: 'ama-refund:bk_1', paymentIntentId: 'pi_1' },
    ])
    expect(f.booking.refundStatus).toBe('refunded')
    expect(f.booking.stripeRefundId).toBe('re_1')
    expect(f.events.map((event) => event.event)).toEqual(['refund_issued'])
  })

  it('treats an already-refunded Booking as a no-op', async () => {
    const f = fixture({ refundStatus: 'refunded' })

    await f.handle(refundOp())

    expect(f.refundCalls).toEqual([])
    expect(f.events).toEqual([])
  })

  it('fails terminally when no refund was requested', async () => {
    const f = fixture({ refundStatus: 'none' })

    await expect(f.handle(refundOp())).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'refund_not_requested',
    })
    expect(f.refundCalls).toEqual([])
  })

  it('marks the refund failed when Stripe rejects the request', async () => {
    const f = fixture({ refundStatus: 'pending' })
    f.stripeState.refundError = new StripeError('invalid_request', 'rejected')

    await expect(f.handle(refundOp())).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'refund_rejected',
    })
    expect(f.booking.refundStatus).toBe('failed')
    expect(f.events.map((event) => event.event)).toEqual(['refund_failed'])
  })

  it('retries a Stripe outage while the refund stays pending', async () => {
    const f = fixture({ refundStatus: 'pending' })
    f.stripeState.refundError = new StripeError('provider_unavailable', 'down')

    await expect(f.handle(refundOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'stripe_unavailable',
    })
    expect(f.booking.refundStatus).toBe('pending')
  })

  it('retries when payments are disabled', async () => {
    const f = fixture({ refundStatus: 'pending' })

    await expect(f.build({ stripe: null })(refundOp())).rejects.toMatchObject({
      name: 'RetryableOperationError',
      code: 'payments_disabled',
    })
  })

  it('fails terminally without a payment intent to refund', async () => {
    const f = fixture({ refundStatus: 'pending', stripePaymentIntentId: null })

    await expect(f.handle(refundOp())).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'missing_payment_intent',
    })
    expect(f.booking.refundStatus).toBe('failed')
  })
})

describe('purge_booking_brief', () => {
  const purgeOp = () =>
    makeOperation({ kind: 'purge_booking_brief', dedupeKey: 'purge:bk_1' })
  const dueAt = new Date(ENDS_AT.getTime() + 90 * 24 * 60 * 60_000)

  it('retries with the retention due date before the brief is due for purge', async () => {
    const f = fixture()

    await expect(f.handle(purgeOp())).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof RetryableOperationError &&
        error.code === 'purge_not_due' &&
        error.retryAt?.getTime() === dueAt.getTime(),
    )
    expect(f.booking.briefText).toBe('A brief.')
  })

  it('purges the brief and records the event once retention has elapsed', async () => {
    const f = fixture()
    f.setNow(new Date(dueAt.getTime() + 1))

    await f.handle(purgeOp())

    expect(f.booking.briefText).toBeNull()
    expect(f.booking.briefUrls).toBeNull()
    expect(f.booking.briefPurgedAt).not.toBeNull()
    expect(f.events.map((event) => event.event)).toEqual(['brief_purged'])
  })

  it('treats an already-purged brief as a no-op', async () => {
    const f = fixture({ briefPurgedAt: NOW, briefText: null, briefUrls: null })
    f.setNow(new Date(dueAt.getTime() + 1))

    await f.handle(purgeOp())

    expect(f.events).toEqual([])
  })
})

describe('operation dispatch', () => {
  it('fails terminally for an unknown operation kind', async () => {
    const f = fixture()

    await expect(
      f.handle(makeOperation({ kind: 'mint_nft' as never })),
    ).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'unknown_operation_kind',
    })
  })

  it('fails terminally when the operation lacks a Booking id', async () => {
    const f = fixture()

    await expect(
      f.handle(makeOperation({ kind: 'finalize_booking', bookingId: null })),
    ).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'missing_booking_id',
    })
  })

  it('fails terminally when the Booking no longer exists', async () => {
    const f = fixture()

    await expect(
      f.handle(makeOperation({ kind: 'finalize_booking', bookingId: 'bk_missing' })),
    ).rejects.toMatchObject({
      name: 'TerminalOperationError',
      code: 'booking_missing',
    })
  })

  it('exports terminal errors that carry their code', () => {
    expect(new TerminalOperationError('x').name).toBe('TerminalOperationError')
    expect(new RetryableOperationError('y').name).toBe('RetryableOperationError')
  })
})

import 'server-only'

import { createHash } from 'node:crypto'

import type { EmailSender } from '../email/types'
import { EmailDeliveryError } from '../email/types'
import { renderBookingEmail, type BookingEmailContext } from '../email/templates'
import type { BookingCalendar } from '../meeting/calendar'
import type { MeetingProviderAdapter } from '../meeting/types'
import { MeetingProviderError } from '../meeting/types'
import type { StripeClient } from '../stripe/client'
import { StripeError } from '../stripe/client'
import { deriveManageToken, manageTokenHash } from '../booking/manage-token'
import type { SlotClaimsRepository } from '../booking/claims'
import type { BookingRecord, BookingRepository } from '../booking/repository'
import type {
  DurableOperationRecord,
  DurableOperationsRepository,
} from './repository'

const MS_PER_MINUTE = 60_000
const REMINDERS = [
  { kind: '24h', offsetMinutes: 24 * 60 },
  { kind: '1h', offsetMinutes: 60 },
] as const

export class RetryableOperationError extends Error {
  constructor(
    readonly code: string,
    readonly retryAt?: Date,
  ) {
    super(`Retryable operation failure: ${code}`)
    this.name = 'RetryableOperationError'
  }
}

export class TerminalOperationError extends Error {
  constructor(readonly code: string) {
    super(`Terminal operation failure: ${code}`)
    this.name = 'TerminalOperationError'
  }
}

export type OperationHandlerDependencies = {
  repository: BookingRepository
  claims: SlotClaimsRepository
  operations: DurableOperationsRepository
  calendar: BookingCalendar
  tencent: MeetingProviderAdapter | null
  email: EmailSender
  stripe: Pick<StripeClient, 'createRefund'> | null
  encryptionKey: string
  baseUrl: URL
  clock?: { now(): Date }
}

export function deriveCalendarEventId(bookingId: string, startsAt: Date) {
  return createHash('sha256')
    .update(`cali.so:ama:calendar-event:${bookingId}:${startsAt.toISOString()}`)
    .digest('hex')
}

function payloadString(operation: DurableOperationRecord, key: string) {
  const value = operation.payload[key]
  return typeof value === 'string' ? value : null
}

export function createOperationHandlers(dependencies: OperationHandlerDependencies) {
  const {
    repository,
    operations,
    calendar,
    tencent,
    email,
    stripe,
    encryptionKey,
    baseUrl,
    clock = { now: () => new Date() },
  } = dependencies

  async function requireBooking(operation: DurableOperationRecord) {
    if (!operation.bookingId) throw new TerminalOperationError('missing_booking_id')
    const booking = await repository.getBooking(operation.bookingId)
    if (!booking) throw new TerminalOperationError('booking_missing')
    return booking
  }

  async function ensureManageToken(booking: BookingRecord) {
    const rawToken = deriveManageToken(encryptionKey, booking.id)
    if (booking.manageTokenHash === null) {
      await repository.setManageTokenHash(booking.id, manageTokenHash(rawToken), clock.now())
    }
    return rawToken
  }

  function manageUrl(booking: BookingRecord, rawToken: string) {
    const prefix = booking.locale === 'en' ? '/en' : ''
    return new URL(`${prefix}/ama/manage/${rawToken}`, baseUrl).toString()
  }

  function calendarDescription(booking: BookingRecord, meetingUrl: string | null) {
    const lines = [
      `AMA Session with ${booking.guestName}`,
      `Topics: ${booking.topics.join(', ')}`,
    ]
    if (meetingUrl) lines.push(`Meeting link: ${meetingUrl}`)
    return lines.join('\n')
  }

  /**
   * Creates the meeting and calendar artifacts for the Booking's current
   * time. Idempotent: the calendar event id is derived from the Booking and
   * start time, and artifacts are stored with compare-and-set.
   */
  async function createArtifacts(booking: BookingRecord) {
    let tencentUrl: string | null = null
    let tencentMeetingId: string | null = null
    if (booking.meetingProvider === 'tencent-meeting') {
      if (!tencent) throw new RetryableOperationError('tencent_disabled')
      try {
        const meeting = await tencent.createMeeting({
          bookingId: booking.id,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          guestName: booking.guestName,
          subject: `AMA Session with ${booking.guestName}`,
        })
        tencentUrl = meeting.meetingUrl
        tencentMeetingId = meeting.providerMeetingId
      } catch (error) {
        if (error instanceof MeetingProviderError) {
          throw new RetryableOperationError(`tencent_${error.code}`)
        }
        throw error
      }
    }

    const eventId = deriveCalendarEventId(booking.id, booking.startsAt)
    const eventResult = await calendar.createEvent({
      eventId,
      summary: `AMA Session: ${booking.guestName}`,
      description: calendarDescription(booking, tencentUrl),
      location: tencentUrl,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      guestEmail: booking.guestEmail,
      guestName: booking.guestName,
      withMeetConference: booking.meetingProvider === 'google-meet',
    })
    if (eventResult.status !== 'created') {
      throw new RetryableOperationError(`calendar_${eventResult.status}`)
    }
    const meetingUrl =
      booking.meetingProvider === 'google-meet' ? eventResult.meetUrl : tencentUrl
    if (!meetingUrl) throw new RetryableOperationError('meeting_link_missing')

    const stored = await repository.setMeetingArtifacts({
      bookingId: booking.id,
      meetingUrl,
      googleCalendarEventId: eventId,
      tencentMeetingId,
      now: clock.now(),
    })
    return stored ?? (await repository.getBooking(booking.id))
  }

  async function enqueueDeliveries(input: {
    booking: BookingRecord
    emailKind: 'confirmation' | 'rescheduled'
    now: Date
  }) {
    const startsAtIso = input.booking.startsAt.toISOString()
    await operations.enqueue({
      kind: 'send_booking_email',
      dedupeKey: `email:${input.emailKind}:${input.booking.id}:${startsAtIso}`,
      bookingId: input.booking.id,
      payload: { kind: input.emailKind },
      nextAttemptAt: input.now,
      now: input.now,
    })
    for (const reminder of REMINDERS) {
      const sendAt = new Date(
        input.booking.startsAt.getTime() - reminder.offsetMinutes * MS_PER_MINUTE,
      )
      if (sendAt.getTime() <= input.now.getTime()) continue
      await operations.enqueue({
        kind: 'send_reminder',
        dedupeKey: `reminder:${reminder.kind}:${input.booking.id}:${startsAtIso}`,
        bookingId: input.booking.id,
        payload: { reminder: reminder.kind, startsAt: startsAtIso },
        nextAttemptAt: sendAt,
        now: input.now,
      })
    }
  }

  async function sendEmail(input: {
    booking: BookingRecord
    kind: BookingEmailContext['kind']
    refund: BookingEmailContext['refund']
    idempotencyKey: string
    includeManageUrl: boolean
  }) {
    const rawToken = input.includeManageUrl
      ? await ensureManageToken(input.booking)
      : null
    const rendered = renderBookingEmail({
      kind: input.kind,
      locale: input.booking.locale,
      guestName: input.booking.guestName,
      startsAt: input.booking.startsAt,
      endsAt: input.booking.endsAt,
      guestTimeZone: input.booking.guestTimeZone,
      meetingProvider: input.booking.meetingProvider,
      meetingUrl: input.booking.meetingUrl,
      manageUrl: rawToken ? manageUrl(input.booking, rawToken) : null,
      refund: input.refund,
    })
    try {
      await email.send(
        {
          to: input.booking.guestEmail,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        },
        input.idempotencyKey,
      )
    } catch (error) {
      if (error instanceof EmailDeliveryError) {
        if (error.code === 'invalid_request') {
          throw new TerminalOperationError('email_invalid_request')
        }
        throw new RetryableOperationError('email_unavailable')
      }
      throw error
    }
  }

  async function finalizeBooking(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.status === 'cancelled') return
    const expectedStartsAt = payloadString(operation, 'startsAt')
    if (expectedStartsAt && booking.startsAt.toISOString() !== expectedStartsAt) {
      // A reschedule superseded this finalization; its own artifacts
      // operation owns the new time.
      return
    }

    await ensureManageToken(booking)
    if (booking.status === 'needs_reschedule') {
      await operations.enqueue({
        kind: 'send_booking_email',
        dedupeKey: `email:needs_reschedule:${booking.id}`,
        bookingId: booking.id,
        payload: { kind: 'needs_reschedule' },
        nextAttemptAt: now,
        now,
      })
      return
    }

    let current = booking
    if (current.meetingUrl === null) {
      const stored = await createArtifacts(current)
      if (!stored) throw new TerminalOperationError('booking_missing')
      current = stored
    }

    const emailKind =
      payloadString(operation, 'email') === 'rescheduled' ? 'rescheduled' : 'confirmation'
    await enqueueDeliveries({ booking: current, emailKind, now })
    await repository.transitionStatus({
      bookingId: current.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })
    await repository.appendEvent({
      bookingId: current.id,
      event: 'finalized',
      actor: 'system',
      occurredAt: now,
    })
  }

  async function updateBookingArtifacts(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.status === 'cancelled') return
    const expectedStartsAt = payloadString(operation, 'startsAt')
    if (!expectedStartsAt) throw new TerminalOperationError('missing_starts_at')
    if (booking.startsAt.toISOString() !== expectedStartsAt) return

    let current = booking
    if (current.googleCalendarEventId) {
      const moved = await calendar.moveEvent({
        eventId: current.googleCalendarEventId,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
      })
      if (moved.status === 'missing') {
        const cleared = await repository.replaceMeetingArtifacts({
          bookingId: current.id,
          meetingUrl: null,
          googleCalendarEventId: null,
          tencentMeetingId: current.tencentMeetingId,
          now,
        })
        if (!cleared) throw new TerminalOperationError('booking_missing')
        current = cleared
      } else if (moved.status !== 'done') {
        throw new RetryableOperationError(`calendar_${moved.status}`)
      }
    }
    if (!current.googleCalendarEventId) {
      const stored = await createArtifacts(current)
      if (!stored) throw new TerminalOperationError('booking_missing')
      current = stored
    }

    await enqueueDeliveries({ booking: current, emailKind: 'rescheduled', now })
    await repository.transitionStatus({
      bookingId: current.id,
      from: ['finalizing'],
      to: 'confirmed',
      now,
    })
    await repository.appendEvent({
      bookingId: current.id,
      event: 'artifacts_updated',
      actor: 'system',
      occurredAt: now,
    })
  }

  async function removeBookingArtifacts(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.googleCalendarEventId) {
      const deleted = await calendar.deleteEvent(booking.googleCalendarEventId)
      if (deleted.status !== 'done' && deleted.status !== 'missing') {
        throw new RetryableOperationError(`calendar_${deleted.status}`)
      }
    }
    let tencentCleanup: 'cancelled' | 'unsupported' | null = null
    if (booking.tencentMeetingId && tencent) {
      try {
        tencentCleanup = await tencent.cancelMeeting(booking.tencentMeetingId)
      } catch (error) {
        if (error instanceof MeetingProviderError) {
          throw new RetryableOperationError(`tencent_${error.code}`)
        }
        throw error
      }
    }
    await repository.appendEvent({
      bookingId: booking.id,
      event: 'artifacts_removed',
      actor: 'system',
      occurredAt: now,
      detail: tencentCleanup ? { tencentCleanup } : {},
    })
  }

  async function sendBookingEmail(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const kind = payloadString(operation, 'kind')
    if (
      kind !== 'confirmation' &&
      kind !== 'rescheduled' &&
      kind !== 'needs_reschedule' &&
      kind !== 'cancelled'
    ) {
      throw new TerminalOperationError('unknown_email_kind')
    }
    if (booking.status === 'cancelled' && kind !== 'cancelled') return
    const refundValue = payloadString(operation, 'refund')
    await sendEmail({
      booking,
      kind,
      refund:
        kind === 'cancelled'
          ? refundValue === 'automatic'
            ? 'automatic'
            : 'none'
          : null,
      idempotencyKey: operation.dedupeKey,
      includeManageUrl: kind !== 'cancelled',
    })
    await repository.appendEvent({
      bookingId: booking.id,
      event: 'email_sent',
      actor: 'system',
      occurredAt: clock.now(),
      detail: { kind },
    })
  }

  async function sendReminder(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.status === 'cancelled' || booking.status === 'needs_reschedule') return
    const expectedStartsAt = payloadString(operation, 'startsAt')
    if (expectedStartsAt && booking.startsAt.toISOString() !== expectedStartsAt) return
    if (now.getTime() >= booking.startsAt.getTime()) return
    const reminder = payloadString(operation, 'reminder')
    if (reminder !== '24h' && reminder !== '1h') {
      throw new TerminalOperationError('unknown_reminder_kind')
    }
    await sendEmail({
      booking,
      kind: reminder === '24h' ? 'reminder_24h' : 'reminder_1h',
      refund: null,
      idempotencyKey: operation.dedupeKey,
      includeManageUrl: true,
    })
    await repository.appendEvent({
      bookingId: booking.id,
      event: 'reminder_sent',
      actor: 'system',
      occurredAt: clock.now(),
      detail: { reminder },
    })
  }

  async function issueRefund(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.refundStatus === 'refunded') return
    if (booking.refundStatus !== 'pending') {
      throw new TerminalOperationError('refund_not_requested')
    }
    if (!stripe) throw new RetryableOperationError('payments_disabled')
    if (!booking.stripePaymentIntentId) {
      await repository.failRefund(booking.id, now)
      throw new TerminalOperationError('missing_payment_intent')
    }
    try {
      const refund = await stripe.createRefund({
        idempotencyKey: `ama-refund:${booking.id}`,
        paymentIntentId: booking.stripePaymentIntentId,
      })
      await repository.completeRefund({
        bookingId: booking.id,
        stripeRefundId: refund.id,
        now: clock.now(),
      })
      await repository.appendEvent({
        bookingId: booking.id,
        event: 'refund_issued',
        actor: 'system',
        occurredAt: clock.now(),
      })
    } catch (error) {
      if (error instanceof StripeError) {
        if (error.code === 'invalid_request') {
          await repository.failRefund(booking.id, clock.now())
          await repository.appendEvent({
            bookingId: booking.id,
            event: 'refund_failed',
            actor: 'system',
            occurredAt: clock.now(),
          })
          throw new TerminalOperationError('refund_rejected')
        }
        throw new RetryableOperationError('stripe_unavailable')
      }
      throw error
    }
  }

  async function purgeBookingBrief(operation: DurableOperationRecord) {
    const booking = await requireBooking(operation)
    const now = clock.now()
    if (booking.briefPurgedAt) return
    const dueAt = new Date(booking.endsAt.getTime() + 90 * 24 * 60 * MS_PER_MINUTE)
    if (now.getTime() < dueAt.getTime()) {
      throw new RetryableOperationError('purge_not_due', dueAt)
    }
    await repository.purgeBrief(booking.id, now)
    await repository.appendEvent({
      bookingId: booking.id,
      event: 'brief_purged',
      actor: 'system',
      occurredAt: now,
    })
  }

  return async function handleOperation(operation: DurableOperationRecord) {
    switch (operation.kind) {
      case 'finalize_booking':
        return finalizeBooking(operation)
      case 'update_booking_artifacts':
        return updateBookingArtifacts(operation)
      case 'remove_booking_artifacts':
        return removeBookingArtifacts(operation)
      case 'send_booking_email':
        return sendBookingEmail(operation)
      case 'send_reminder':
        return sendReminder(operation)
      case 'issue_refund':
        return issueRefund(operation)
      case 'purge_booking_brief':
        return purgeBookingBrief(operation)
      default:
        throw new TerminalOperationError('unknown_operation_kind')
    }
  }
}

export type OperationHandler = ReturnType<typeof createOperationHandlers>

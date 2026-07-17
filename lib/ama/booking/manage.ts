import 'server-only'

import type { DurableOperationsRepository } from '../operations/repository'
import { AMA_MANAGE_CUTOFF_MINUTES } from './policy'
import { manageTokenHash } from './manage-token'
import type { SlotClaimsRepository } from './claims'
import type { BookingRecord, BookingRepository } from './repository'
import type { BookingService } from './service'

const MS_PER_MINUTE = 60_000

export type ManagedBookingView = {
  bookingId: string
  status: BookingRecord['status']
  guestName: string
  locale: BookingRecord['locale']
  guestTimeZone: string
  startsAt: Date
  endsAt: Date
  meetingProvider: BookingRecord['meetingProvider']
  meetingUrl: string | null
  refundStatus: BookingRecord['refundStatus']
  canReschedule: boolean
  canCancel: boolean
  refundOnCancel: boolean
}

export type ManageActionResult =
  | { outcome: 'done'; view: ManagedBookingView }
  | { outcome: 'not_found' }
  | { outcome: 'window_closed' }
  | { outcome: 'stale_slot' }
  | { outcome: 'slot_taken' }
  | { outcome: 'unavailable' }
  | { outcome: 'already_cancelled' }

type ManageServiceDependencies = {
  repository: BookingRepository
  claims: SlotClaimsRepository
  operations: DurableOperationsRepository
  booking: Pick<BookingService, 'computeSlots'>
  clock?: { now(): Date }
}

function beforeCutoff(booking: BookingRecord, now: Date) {
  return (
    now.getTime() <
    booking.startsAt.getTime() - AMA_MANAGE_CUTOFF_MINUTES * MS_PER_MINUTE
  )
}

export function createManageService(dependencies: ManageServiceDependencies) {
  const {
    repository,
    claims,
    operations,
    booking: bookingService,
    clock = { now: () => new Date() },
  } = dependencies

  function view(booking: BookingRecord, now: Date): ManagedBookingView {
    const open = booking.status !== 'cancelled'
    const withinWindow = beforeCutoff(booking, now)
    // A Booking whose paid time was lost to a conflict may pick any new
    // time; its recorded start no longer represents a real session.
    const conflicted = booking.status === 'needs_reschedule'
    return {
      bookingId: booking.id,
      status: booking.status,
      guestName: booking.guestName,
      locale: booking.locale,
      guestTimeZone: booking.guestTimeZone,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      meetingProvider: booking.meetingProvider,
      meetingUrl: booking.meetingUrl,
      refundStatus: booking.refundStatus,
      canReschedule: open && (withinWindow || conflicted),
      canCancel: open,
      refundOnCancel: open && (withinWindow || conflicted),
    }
  }

  async function findBooking(rawToken: string) {
    if (!rawToken || rawToken.length > 128) return null
    return repository.getBookingByManageTokenHash(manageTokenHash(rawToken))
  }

  return {
    /**
     * Resolves a Manage Link. Invalid, revoked, or unknown tokens all
     * return null so the route discloses nothing about why.
     */
    async getView(rawToken: string): Promise<ManagedBookingView | null> {
      const booking = await findBooking(rawToken)
      if (!booking) return null
      return view(booking, clock.now())
    },

    async listRescheduleSlots(rawToken: string) {
      const booking = await findBooking(rawToken)
      if (!booking) return null
      return bookingService.computeSlots()
    },

    async reschedule(rawToken: string, startsAt: Date): Promise<ManageActionResult> {
      const booking = await findBooking(rawToken)
      if (!booking) return { outcome: 'not_found' }
      const now = clock.now()
      if (booking.status === 'cancelled') return { outcome: 'already_cancelled' }
      if (!beforeCutoff(booking, now) && booking.status !== 'needs_reschedule') {
        return { outcome: 'window_closed' }
      }
      const result = await rescheduleBookingTo({
        booking,
        startsAt,
        actor: 'guest',
        repository,
        claims,
        operations,
        slotsSource: bookingService,
        now,
      })
      if (result.outcome !== 'done') return result
      return { outcome: 'done', view: view(result.booking, now) }
    },

    async cancel(
      rawToken: string,
      actor: 'guest' | 'owner' = 'guest',
    ): Promise<ManageActionResult> {
      const booking = await findBooking(rawToken)
      if (!booking) return { outcome: 'not_found' }
      return cancelBooking({
        booking,
        actor,
        repository,
        claims,
        operations,
        now: clock.now(),
      })
    },
  }
}

/**
 * Shared reschedule path for guests (through a Manage Link) and the owner
 * (through admin). Availability is rechecked, the new claim goes through the
 * same exclusion guarantee as any other, and payment plus lifecycle history
 * survive the move.
 */
export async function rescheduleBookingTo(input: {
  booking: BookingRecord
  startsAt: Date
  actor: 'guest' | 'owner'
  repository: BookingRepository
  claims: SlotClaimsRepository
  operations: DurableOperationsRepository
  slotsSource: Pick<BookingService, 'computeSlots'>
  now: Date
}): Promise<
  | { outcome: 'done'; booking: BookingRecord }
  | { outcome: 'stale_slot' }
  | { outcome: 'slot_taken' }
  | { outcome: 'unavailable' }
  | { outcome: 'already_cancelled' }
> {
  const { booking, actor, repository, claims, operations, now } = input
  const slots = await input.slotsSource.computeSlots()
  if (slots.status !== 'available') return { outcome: 'unavailable' }
  const slot = slots.slots.find(
    (candidate) => candidate.startsAt.getTime() === input.startsAt.getTime(),
  )
  if (!slot) return { outcome: 'stale_slot' }

  const claim = await claims.createBookingClaim({
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    now,
  })
  if (!claim) return { outcome: 'slot_taken' }

  const previousClaimId = booking.claimId
  const previousStartsAt = booking.startsAt
  const updated = await repository.rescheduleBooking({
    bookingId: booking.id,
    expectedStartsAt: previousStartsAt,
    claimId: claim.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    now,
  })
  if (!updated) {
    // A concurrent management request won; give the claim back.
    await claims.release(claim.id, 'superseded', now)
    const current = await repository.getBooking(booking.id)
    if (!current || current.status === 'cancelled') {
      return { outcome: 'already_cancelled' }
    }
    return { outcome: 'slot_taken' }
  }
  if (previousClaimId) {
    await claims.release(previousClaimId, 'rescheduled', now)
  }

  await operations.cancelPendingForBooking({
    bookingId: booking.id,
    kinds: ['send_reminder', 'purge_booking_brief'],
    now,
  })
  await repository.appendEvent({
    bookingId: booking.id,
    event: 'rescheduled',
    actor,
    occurredAt: now,
    detail: {
      fromStartsAt: previousStartsAt.toISOString(),
      toStartsAt: slot.startsAt.toISOString(),
    },
  })
  await operations.enqueue({
    kind: 'update_booking_artifacts',
    dedupeKey: `artifacts:${booking.id}:${slot.startsAt.toISOString()}`,
    bookingId: booking.id,
    payload: { startsAt: slot.startsAt.toISOString() },
    nextAttemptAt: now,
    now,
  })
  await operations.enqueue({
    kind: 'purge_booking_brief',
    dedupeKey: `purge:${booking.id}:${slot.endsAt.toISOString()}`,
    bookingId: booking.id,
    payload: {},
    nextAttemptAt: new Date(slot.endsAt.getTime() + 90 * 24 * 60 * MS_PER_MINUTE),
    maxAttempts: 32,
    now,
  })
  return { outcome: 'done', booking: updated }
}

/**
 * Shared cancellation path for guests (through a Manage Link) and the owner
 * (through admin). Refund eligibility follows the cancellation time; owner
 * exceptions are granted separately.
 */
export async function cancelBooking(input: {
  booking: BookingRecord
  actor: 'guest' | 'owner'
  repository: BookingRepository
  claims: SlotClaimsRepository
  operations: DurableOperationsRepository
  now: Date
  refundOverride?: boolean
}): Promise<ManageActionResult> {
  const { booking, actor, repository, claims, operations, now } = input
  if (booking.status === 'cancelled') return { outcome: 'already_cancelled' }

  const cancelled = await repository.cancelBooking({
    bookingId: booking.id,
    cancelledBy: actor,
    now,
  })
  if (!cancelled) return { outcome: 'already_cancelled' }

  if (cancelled.claimId) {
    await claims.release(cancelled.claimId, 'cancelled', now)
  }
  await operations.cancelPendingForBooking({
    bookingId: booking.id,
    kinds: ['send_reminder', 'finalize_booking', 'update_booking_artifacts'],
    now,
  })
  await repository.appendEvent({
    bookingId: booking.id,
    event: actor === 'guest' ? 'cancelled_by_guest' : 'cancelled_by_owner',
    actor,
    occurredAt: now,
  })

  const automaticRefund =
    input.refundOverride ??
    (booking.status === 'needs_reschedule' || beforeCutoff(booking, now))
  if (automaticRefund) {
    const begun = await repository.beginRefund({
      bookingId: booking.id,
      reason: actor === 'guest' ? 'guest_cancellation' : 'owner_cancellation',
      now,
    })
    if (begun) {
      await operations.enqueue({
        kind: 'issue_refund',
        dedupeKey: `refund:${booking.id}`,
        bookingId: booking.id,
        payload: {},
        nextAttemptAt: now,
        now,
      })
    }
  }
  if (cancelled.googleCalendarEventId || cancelled.tencentMeetingId) {
    await operations.enqueue({
      kind: 'remove_booking_artifacts',
      dedupeKey: `remove-artifacts:${booking.id}`,
      bookingId: booking.id,
      payload: {},
      nextAttemptAt: now,
      now,
    })
  }
  await operations.enqueue({
    kind: 'send_booking_email',
    dedupeKey: `email:cancelled:${booking.id}`,
    bookingId: booking.id,
    payload: { kind: 'cancelled', refund: automaticRefund ? 'automatic' : 'none' },
    nextAttemptAt: now,
    now,
  })

  const finalView: ManagedBookingView = {
    bookingId: cancelled.id,
    status: 'cancelled',
    guestName: cancelled.guestName,
    locale: cancelled.locale,
    guestTimeZone: cancelled.guestTimeZone,
    startsAt: cancelled.startsAt,
    endsAt: cancelled.endsAt,
    meetingProvider: cancelled.meetingProvider,
    meetingUrl: cancelled.meetingUrl,
    refundStatus: automaticRefund ? 'pending' : cancelled.refundStatus,
    canReschedule: false,
    canCancel: false,
    refundOnCancel: false,
  }
  return { outcome: 'done', view: finalView }
}

export type ManageService = ReturnType<typeof createManageService>

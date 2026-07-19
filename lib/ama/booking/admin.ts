import 'server-only'

import type {
  DurableOperationRecord,
  DurableOperationsRepository,
} from '../operations/repository'
import type { SlotClaimsRepository } from './claims'
import { cancelBooking, rescheduleBookingTo } from './manage'
import type {
  AlternateTimeRequestRecord,
  BookingEventRecord,
  BookingRecord,
  BookingRepository,
} from './repository'
import type { BookingService } from './service'

export type BookingDetail = {
  booking: BookingRecord
  events: BookingEventRecord[]
  operations: DurableOperationRecord[]
}

export type AdminActionResult =
  | { outcome: 'done' }
  | { outcome: 'not_found' }
  | { outcome: 'stale_slot' }
  | { outcome: 'slot_taken' }
  | { outcome: 'unavailable' }
  | { outcome: 'already_cancelled' }
  | { outcome: 'not_applicable' }

type BookingAdminDependencies = {
  repository: BookingRepository
  claims: SlotClaimsRepository
  operations: DurableOperationsRepository
  slotsSource: Pick<BookingService, 'computeSlots'>
  clock?: { now(): Date }
}

export function createBookingAdminService(dependencies: BookingAdminDependencies) {
  const {
    repository,
    claims,
    operations,
    slotsSource,
    clock = { now: () => new Date() },
  } = dependencies

  return {
    listBookings(view: 'upcoming' | 'past' | 'attention') {
      return repository.listBookings({ view, now: clock.now() })
    },

    listAlternateTimeRequests(status?: AlternateTimeRequestRecord['status']) {
      return repository.listAlternateTimeRequests(status)
    },

    listUnresolvedOperations() {
      return operations.listUnresolved()
    },

    countOperationsByStatus() {
      return operations.countByStatus()
    },

    async getBookingDetail(bookingId: string): Promise<BookingDetail | null> {
      const booking = await repository.getBooking(bookingId)
      if (!booking) return null
      const [events, bookingOperations] = await Promise.all([
        repository.listEvents(bookingId),
        operations.listForBooking(bookingId),
      ])
      return { booking, events, operations: bookingOperations }
    },

    async cancel(
      bookingId: string,
      options: { refund: boolean },
    ): Promise<AdminActionResult> {
      const booking = await repository.getBooking(bookingId)
      if (!booking) return { outcome: 'not_found' }
      const result = await cancelBooking({
        booking,
        actor: 'owner',
        repository,
        claims,
        operations,
        now: clock.now(),
        refundOverride: options.refund,
      })
      if (result.outcome === 'done') return { outcome: 'done' }
      if (result.outcome === 'already_cancelled') return { outcome: 'already_cancelled' }
      return { outcome: 'unavailable' }
    },

    async reschedule(bookingId: string, startsAt: Date): Promise<AdminActionResult> {
      const booking = await repository.getBooking(bookingId)
      if (!booking) return { outcome: 'not_found' }
      if (booking.status === 'cancelled') return { outcome: 'already_cancelled' }
      const result = await rescheduleBookingTo({
        booking,
        startsAt,
        actor: 'owner',
        repository,
        claims,
        operations,
        slotsSource,
        now: clock.now(),
      })
      if (result.outcome === 'done') return { outcome: 'done' }
      return { outcome: result.outcome }
    },

    /**
     * Grants a manual refund exception for a Booking that no longer
     * qualifies automatically (inside 24 hours or a no-show).
     */
    async grantRefundException(bookingId: string): Promise<AdminActionResult> {
      const booking = await repository.getBooking(bookingId)
      if (!booking) return { outcome: 'not_found' }
      const now = clock.now()
      if (booking.refundStatus === 'refunded' || booking.refundStatus === 'pending') {
        return { outcome: 'not_applicable' }
      }
      const begun = await repository.beginRefund({
        bookingId,
        reason: 'owner_exception',
        now,
      })
      if (!begun) return { outcome: 'not_applicable' }
      await repository.appendEvent({
        bookingId,
        event: 'refund_exception_granted',
        actor: 'owner',
        occurredAt: now,
      })
      await operations.enqueue({
        kind: 'issue_refund',
        dedupeKey: `refund:${bookingId}`,
        bookingId,
        payload: {},
        nextAttemptAt: now,
        now,
      })
      const existing = await operations.getByDedupeKey(`refund:${bookingId}`)
      if (existing && existing.status === 'failed') {
        await operations.retry(existing.id, now)
      }
      return { outcome: 'done' }
    },

    async retryOperation(operationId: string): Promise<AdminActionResult> {
      const retried = await operations.retry(operationId, clock.now())
      if (!retried) return { outcome: 'not_applicable' }
      if (retried.bookingId) {
        await repository.appendEvent({
          bookingId: retried.bookingId,
          event: 'operation_retried',
          actor: 'owner',
          occurredAt: clock.now(),
          detail: { kind: retried.kind },
        })
      }
      return { outcome: 'done' }
    },

    async resolveOperation(operationId: string): Promise<AdminActionResult> {
      const resolved = await operations.resolve(operationId, clock.now())
      if (!resolved) return { outcome: 'not_applicable' }
      if (resolved.bookingId) {
        await repository.appendEvent({
          bookingId: resolved.bookingId,
          event: 'operation_resolved',
          actor: 'owner',
          occurredAt: clock.now(),
          detail: { kind: resolved.kind },
        })
      }
      return { outcome: 'done' }
    },

    async resolveAlternateTimeRequest(
      requestId: string,
      resolution: 'resolved' | 'dismissed',
    ): Promise<AdminActionResult> {
      const resolved = await repository.resolveAlternateTimeRequest(
        requestId,
        resolution,
        clock.now(),
      )
      return resolved ? { outcome: 'done' } : { outcome: 'not_applicable' }
    },
  }
}

export type BookingAdminService = ReturnType<typeof createBookingAdminService>

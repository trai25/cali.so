import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createBookingAdminService } from './admin'
import type { PublicSlotsResult } from './service'
import {
  createFakeBookingRepository,
  createFakeClaimsRepository,
  createFakeOperationsRepository,
  seedPaidBooking,
} from './testing'

const MS_PER_MINUTE = 60_000
const NOW = new Date('2026-08-01T00:00:00.000Z')
const START = new Date('2026-08-03T02:00:00.000Z')
const END = new Date('2026-08-03T03:00:00.000Z')
const NEW_START = new Date('2026-08-06T02:00:00.000Z')
const NEW_END = new Date('2026-08-06T03:00:00.000Z')

function fixture() {
  let now = new Date(NOW)
  const claims = createFakeClaimsRepository()
  const repo = createFakeBookingRepository()
  const operations = createFakeOperationsRepository()

  const slotsResult: PublicSlotsResult = {
    status: 'available',
    slots: [{ startsAt: NEW_START, endsAt: NEW_END }],
  }

  const service = createBookingAdminService({
    repository: repo.repository,
    claims: claims.repository,
    operations: operations.repository,
    slotsSource: { computeSlots: async () => slotsResult },
    clock: { now: () => now },
  })

  return {
    service,
    claims,
    repo,
    operations,
    setNow(next: Date) {
      now = next
    },
    async seed(input: { startsAt?: Date; endsAt?: Date } = {}) {
      const seeded = await seedPaidBooking({
        claims: claims.repository,
        repository: repo.repository,
        startsAt: input.startsAt ?? START,
        endsAt: input.endsAt ?? END,
        now: NOW,
      })
      return {
        ...seeded,
        row: () => repo.bookings.find((booking) => booking.id === seeded.booking.id)!,
      }
    },
  }
}

describe('Booking admin listings', () => {
  it('returns filtered pages with a real total', async () => {
    const f = fixture()
    const upcoming = await f.seed()

    await expect(
      f.service.searchBookings({
        view: 'upcoming',
        page: 1,
        pageSize: 20,
        filters: { guestEmail: upcoming.booking.guestEmail },
      }),
    ).resolves.toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      items: [expect.objectContaining({ id: upcoming.booking.id })],
    })
  })

  it('passes booking views and detail with events and operations through', async () => {
    const f = fixture()
    const upcoming = await f.seed()
    const past = await f.seed({
      startsAt: new Date('2026-07-20T02:00:00.000Z'),
      endsAt: new Date('2026-07-20T03:00:00.000Z'),
    })
    await f.repo.repository.appendEvent({
      bookingId: upcoming.booking.id,
      event: 'payment_verified',
      actor: 'provider',
      occurredAt: NOW,
    })
    await f.operations.repository.enqueue({
      kind: 'finalize_booking',
      dedupeKey: `finalize:${upcoming.booking.id}:${START.toISOString()}`,
      bookingId: upcoming.booking.id,
      nextAttemptAt: NOW,
      now: NOW,
    })

    await expect(f.service.listBookings('upcoming')).resolves.toEqual([
      expect.objectContaining({ id: upcoming.booking.id }),
    ])
    await expect(f.service.listBookings('past')).resolves.toEqual([
      expect.objectContaining({ id: past.booking.id }),
    ])
    const detail = await f.service.getBookingDetail(upcoming.booking.id)
    expect(detail?.booking.id).toBe(upcoming.booking.id)
    expect(detail?.events).toEqual([
      expect.objectContaining({ event: 'payment_verified' }),
    ])
    expect(detail?.operations).toEqual([
      expect.objectContaining({ kind: 'finalize_booking' }),
    ])
    await expect(f.service.getBookingDetail('booking-404')).resolves.toBeNull()
  })
})

describe('Booking admin cancellation', () => {
  it('refunds inside 24 hours when the owner overrides eligibility', async () => {
    const f = fixture()
    const seeded = await f.seed()
    f.setNow(new Date(START.getTime() - 60 * MS_PER_MINUTE))

    const result = await f.service.cancel(seeded.booking.id, { refund: true })

    expect(result).toEqual({ outcome: 'done' })
    expect(seeded.row()).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'owner',
      refundStatus: 'pending',
      refundReason: 'owner_cancellation',
    })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toMatchObject({
      dedupeKey: `refund:${seeded.booking.id}`,
      status: 'pending',
    })
    expect(f.repo.events).toEqual([
      expect.objectContaining({ event: 'cancelled_by_owner', actor: 'owner' }),
    ])
  })

  it('withholds the refund outside 24 hours when the owner declines it', async () => {
    const f = fixture()
    const seeded = await f.seed()

    const result = await f.service.cancel(seeded.booking.id, { refund: false })

    expect(result).toEqual({ outcome: 'done' })
    expect(seeded.row()).toMatchObject({ status: 'cancelled', refundStatus: 'none' })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toBeUndefined()
    expect(
      f.operations.rows.find((row) => row.kind === 'send_booking_email'),
    ).toMatchObject({ payload: { kind: 'cancelled', refund: 'none' } })
  })

  it('reports unknown bookings and repeated cancellation distinctly', async () => {
    const f = fixture()
    const seeded = await f.seed()

    await expect(f.service.cancel('booking-404', { refund: false })).resolves.toEqual({
      outcome: 'not_found',
    })
    await f.service.cancel(seeded.booking.id, { refund: false })
    await expect(
      f.service.cancel(seeded.booking.id, { refund: false }),
    ).resolves.toEqual({ outcome: 'already_cancelled' })
  })
})

describe('Booking admin reschedule', () => {
  it('delegates to the shared path and records the owner as actor', async () => {
    const f = fixture()
    const seeded = await f.seed()

    const result = await f.service.reschedule(seeded.booking.id, NEW_START)

    expect(result).toEqual({ outcome: 'done' })
    expect(seeded.row()).toMatchObject({
      startsAt: NEW_START,
      endsAt: NEW_END,
      status: 'finalizing',
    })
    expect(f.repo.events).toEqual([
      expect.objectContaining({ event: 'rescheduled', actor: 'owner' }),
    ])
    await expect(f.claims.repository.get(seeded.claimId)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'rescheduled',
    })
  })

  it('propagates stale slots and refuses cancelled bookings', async () => {
    const f = fixture()
    const seeded = await f.seed()

    await expect(f.service.reschedule('booking-404', NEW_START)).resolves.toEqual({
      outcome: 'not_found',
    })
    await expect(
      f.service.reschedule(seeded.booking.id, new Date('2026-08-07T02:00:00.000Z')),
    ).resolves.toEqual({ outcome: 'stale_slot' })

    await f.service.cancel(seeded.booking.id, { refund: false })
    await expect(f.service.reschedule(seeded.booking.id, NEW_START)).resolves.toEqual({
      outcome: 'already_cancelled',
    })
  })
})

describe('Booking admin refund exceptions', () => {
  it('grants an exception from a clean slate and queues the refund', async () => {
    const f = fixture()
    const seeded = await f.seed()

    const result = await f.service.grantRefundException(seeded.booking.id)

    expect(result).toEqual({ outcome: 'done' })
    expect(seeded.row()).toMatchObject({
      refundStatus: 'pending',
      refundReason: 'owner_exception',
    })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toMatchObject({
      dedupeKey: `refund:${seeded.booking.id}`,
      status: 'pending',
    })
    expect(f.repo.events).toEqual([
      expect.objectContaining({ event: 'refund_exception_granted', actor: 'owner' }),
    ])
  })

  it('declines an exception when a refund is already pending or done', async () => {
    const f = fixture()
    const seeded = await f.seed()

    seeded.row().refundStatus = 'pending'
    await expect(f.service.grantRefundException(seeded.booking.id)).resolves.toEqual({
      outcome: 'not_applicable',
    })

    seeded.row().refundStatus = 'refunded'
    await expect(f.service.grantRefundException(seeded.booking.id)).resolves.toEqual({
      outcome: 'not_applicable',
    })
    await expect(f.service.grantRefundException('booking-404')).resolves.toEqual({
      outcome: 'not_found',
    })
  })

  it('restarts a failed refund and retries its failed operation', async () => {
    const f = fixture()
    const seeded = await f.seed()
    seeded.row().refundStatus = 'failed'
    await f.operations.repository.enqueue({
      kind: 'issue_refund',
      dedupeKey: `refund:${seeded.booking.id}`,
      bookingId: seeded.booking.id,
      nextAttemptAt: NOW,
      now: NOW,
    })
    const operation = f.operations.rows[0]
    operation.status = 'failed'
    operation.attemptCount = 8
    operation.completedAt = NOW

    const result = await f.service.grantRefundException(seeded.booking.id)

    expect(result).toEqual({ outcome: 'done' })
    expect(seeded.row()).toMatchObject({
      refundStatus: 'pending',
      refundReason: 'owner_exception',
    })
    expect(operation).toMatchObject({ status: 'pending', attemptCount: 0 })
    expect(f.operations.rows.filter((row) => row.kind === 'issue_refund')).toHaveLength(1)
  })
})

describe('Booking admin operations recovery', () => {
  async function failedOperationFixture() {
    const f = fixture()
    const seeded = await f.seed()
    await f.operations.repository.enqueue({
      kind: 'finalize_booking',
      dedupeKey: `finalize:${seeded.booking.id}:${START.toISOString()}`,
      bookingId: seeded.booking.id,
      nextAttemptAt: NOW,
      now: NOW,
    })
    const operation = f.operations.rows[0]
    operation.status = 'failed'
    operation.attemptCount = 8
    operation.completedAt = NOW
    return { ...f, seeded, operation }
  }

  it('returns a failed operation to the queue with a fresh attempt budget', async () => {
    const f = await failedOperationFixture()

    const result = await f.service.retryOperation(f.operation.id)

    expect(result).toEqual({ outcome: 'done' })
    expect(f.operation).toMatchObject({
      status: 'pending',
      attemptCount: 0,
      completedAt: null,
    })
    expect(f.repo.events).toEqual([
      expect.objectContaining({
        event: 'operation_retried',
        actor: 'owner',
        detail: { kind: 'finalize_booking' },
      }),
    ])
  })

  it('refuses to retry an operation that has not failed', async () => {
    const f = fixture()
    const seeded = await f.seed()
    await f.operations.repository.enqueue({
      kind: 'finalize_booking',
      dedupeKey: `finalize:${seeded.booking.id}:${START.toISOString()}`,
      bookingId: seeded.booking.id,
      nextAttemptAt: NOW,
      now: NOW,
    })

    await expect(f.service.retryOperation(f.operations.rows[0].id)).resolves.toEqual({
      outcome: 'not_applicable',
    })
    expect(f.repo.events).toHaveLength(0)
  })

  it('resolves a failed operation once and only once', async () => {
    const f = await failedOperationFixture()

    await expect(f.service.resolveOperation(f.operation.id)).resolves.toEqual({
      outcome: 'done',
    })
    expect(f.operation.status).toBe('resolved')
    expect(f.repo.events).toEqual([
      expect.objectContaining({ event: 'operation_resolved', actor: 'owner' }),
    ])

    await expect(f.service.resolveOperation(f.operation.id)).resolves.toEqual({
      outcome: 'not_applicable',
    })
    expect(f.repo.events).toHaveLength(1)
  })
})

describe('Booking admin alternate time requests', () => {
  it('resolves a request with compare-and-set so a second decision loses', async () => {
    const f = fixture()
    const request = await f.repo.repository.createAlternateTimeRequest({
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      locale: 'en',
      guestTimeZone: 'America/New_York',
      preferredWindows: 'Weekday mornings ET',
      note: null,
      now: NOW,
    })

    await expect(
      f.service.resolveAlternateTimeRequest(request.id, 'resolved'),
    ).resolves.toEqual({ outcome: 'done' })
    expect(f.repo.alternateTimeRequests[0]).toMatchObject({
      status: 'resolved',
      resolvedAt: NOW,
    })

    await expect(
      f.service.resolveAlternateTimeRequest(request.id, 'dismissed'),
    ).resolves.toEqual({ outcome: 'not_applicable' })
    expect(f.repo.alternateTimeRequests[0].status).toBe('resolved')
  })

  it('dismisses a request directly', async () => {
    const f = fixture()
    const request = await f.repo.repository.createAlternateTimeRequest({
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      locale: 'en',
      guestTimeZone: 'America/New_York',
      preferredWindows: 'Weekday mornings ET',
      note: null,
      now: NOW,
    })

    await expect(
      f.service.resolveAlternateTimeRequest(request.id, 'dismissed'),
    ).resolves.toEqual({ outcome: 'done' })
    expect(f.repo.alternateTimeRequests[0].status).toBe('dismissed')
  })
})

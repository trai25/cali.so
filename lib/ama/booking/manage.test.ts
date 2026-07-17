import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createManageService } from './manage'
import { deriveManageToken, manageTokenHash } from './manage-token'
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
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')

async function fixture(options: { status?: 'confirmed' | 'needs_reschedule' } = {}) {
  let now = new Date(NOW)
  const claims = createFakeClaimsRepository()
  const repo = createFakeBookingRepository()
  const operations = createFakeOperationsRepository()

  let slotsResult: PublicSlotsResult = {
    status: 'available',
    slots: [{ startsAt: NEW_START, endsAt: NEW_END }],
  }

  const service = createManageService({
    repository: repo.repository,
    claims: claims.repository,
    operations: operations.repository,
    booking: { computeSlots: async () => slotsResult },
    clock: { now: () => now },
  })

  const seeded = await seedPaidBooking({
    claims: claims.repository,
    repository: repo.repository,
    startsAt: START,
    endsAt: END,
    now: NOW,
    status: options.status ?? 'confirmed',
  })
  const token = deriveManageToken(ENCRYPTION_KEY, seeded.booking.id)
  await repo.repository.setManageTokenHash(
    seeded.booking.id,
    manageTokenHash(token),
    NOW,
  )

  return {
    service,
    claims,
    repo,
    operations,
    token,
    bookingId: seeded.booking.id,
    claimId: seeded.claimId,
    bookingRow: () => repo.bookings.find((booking) => booking.id === seeded.booking.id)!,
    setNow(next: Date) {
      now = next
    },
    setSlots(result: PublicSlotsResult) {
      slotsResult = result
    },
  }
}

describe('Manage Link view', () => {
  it('opens reschedule, cancel, and refund more than 24 hours before the session', async () => {
    const f = await fixture()

    await expect(f.service.getView(f.token)).resolves.toMatchObject({
      bookingId: f.bookingId,
      status: 'confirmed',
      startsAt: START,
      canReschedule: true,
      canCancel: true,
      refundOnCancel: true,
    })
  })

  it('closes reschedule and refund inside 24 hours while cancel stays open', async () => {
    const f = await fixture()
    f.setNow(new Date(START.getTime() - 2 * 60 * MS_PER_MINUTE))

    await expect(f.service.getView(f.token)).resolves.toMatchObject({
      canReschedule: false,
      canCancel: true,
      refundOnCancel: false,
    })
  })

  it('keeps reschedule open for a conflicted booking regardless of the window', async () => {
    const f = await fixture({ status: 'needs_reschedule' })
    f.setNow(new Date(START.getTime() - 2 * 60 * MS_PER_MINUTE))

    await expect(f.service.getView(f.token)).resolves.toMatchObject({
      canReschedule: true,
      canCancel: true,
      refundOnCancel: true,
    })
  })

  it('offers no actions on a cancelled booking', async () => {
    const f = await fixture()
    f.bookingRow().status = 'cancelled'

    await expect(f.service.getView(f.token)).resolves.toMatchObject({
      canReschedule: false,
      canCancel: false,
      refundOnCancel: false,
    })
  })

  it('discloses nothing for invalid, revoked, or unknown tokens', async () => {
    const f = await fixture()

    await expect(f.service.getView('')).resolves.toBeNull()
    await expect(f.service.getView('a'.repeat(129))).resolves.toBeNull()
    await expect(
      f.service.getView(deriveManageToken(ENCRYPTION_KEY, 'booking-404')),
    ).resolves.toBeNull()

    f.bookingRow().manageTokenRevokedAt = NOW
    await expect(f.service.getView(f.token)).resolves.toBeNull()
  })
})

describe('Manage Link reschedule', () => {
  it('moves the booking, swaps claims, and requeues durable work', async () => {
    const f = await fixture()
    await f.operations.repository.enqueue({
      kind: 'send_reminder',
      dedupeKey: `reminder:${f.bookingId}`,
      bookingId: f.bookingId,
      nextAttemptAt: START,
      now: NOW,
    })
    await f.operations.repository.enqueue({
      kind: 'purge_booking_brief',
      dedupeKey: `purge:${f.bookingId}`,
      bookingId: f.bookingId,
      nextAttemptAt: END,
      now: NOW,
    })

    const result = await f.service.reschedule(f.token, NEW_START)

    expect(result).toMatchObject({
      outcome: 'done',
      view: expect.objectContaining({ startsAt: NEW_START, status: 'finalizing' }),
    })
    const booking = f.bookingRow()
    expect(booking).toMatchObject({
      startsAt: NEW_START,
      endsAt: NEW_END,
      status: 'finalizing',
    })
    expect(booking.claimId).not.toBe(f.claimId)
    await expect(f.claims.repository.get(booking.claimId!)).resolves.toMatchObject({
      kind: 'booking',
      status: 'active',
      startsAt: NEW_START,
    })
    await expect(f.claims.repository.get(f.claimId)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'rescheduled',
    })
    expect(
      f.operations.rows.find((row) => row.dedupeKey === `reminder:${f.bookingId}`),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      f.operations.rows.find((row) => row.dedupeKey === `purge:${f.bookingId}`),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      f.operations.rows.find((row) => row.kind === 'update_booking_artifacts'),
    ).toMatchObject({
      dedupeKey: `artifacts:${f.bookingId}:${NEW_START.toISOString()}`,
      status: 'pending',
      payload: { startsAt: NEW_START.toISOString() },
    })
    expect(
      f.operations.rows.find(
        (row) => row.dedupeKey === `purge:${f.bookingId}:${NEW_END.toISOString()}`,
      ),
    ).toMatchObject({ kind: 'purge_booking_brief', status: 'pending' })
    expect(f.repo.events).toEqual([
      expect.objectContaining({
        event: 'rescheduled',
        actor: 'guest',
        detail: {
          fromStartsAt: START.toISOString(),
          toStartsAt: NEW_START.toISOString(),
        },
      }),
    ])
  })

  it('refuses to reschedule inside the 24-hour window', async () => {
    const f = await fixture()
    f.setNow(new Date(START.getTime() - 60 * MS_PER_MINUTE))

    await expect(f.service.reschedule(f.token, NEW_START)).resolves.toEqual({
      outcome: 'window_closed',
    })
  })

  it('still reschedules a conflicted booking inside the window', async () => {
    const f = await fixture({ status: 'needs_reschedule' })
    f.setNow(new Date(START.getTime() - 60 * MS_PER_MINUTE))

    await expect(f.service.reschedule(f.token, NEW_START)).resolves.toMatchObject({
      outcome: 'done',
    })
  })

  it('rejects a target that is no longer offered as stale', async () => {
    const f = await fixture()

    await expect(
      f.service.reschedule(f.token, new Date('2026-08-07T02:00:00.000Z')),
    ).resolves.toEqual({ outcome: 'stale_slot' })
  })

  it('loses the race for a just-claimed target as slot_taken', async () => {
    const f = await fixture()
    await f.claims.repository.createBookingClaim({
      startsAt: NEW_START,
      endsAt: NEW_END,
      now: NOW,
    })

    await expect(f.service.reschedule(f.token, NEW_START)).resolves.toEqual({
      outcome: 'slot_taken',
    })
    expect(f.bookingRow().startsAt).toEqual(START)
  })

  it('fails closed when slots cannot be computed', async () => {
    const f = await fixture()
    f.setSlots({ status: 'unavailable' })

    await expect(f.service.reschedule(f.token, NEW_START)).resolves.toEqual({
      outcome: 'unavailable',
    })
  })

  it('refuses to reschedule a cancelled booking', async () => {
    const f = await fixture()
    await f.service.cancel(f.token)

    await expect(f.service.reschedule(f.token, NEW_START)).resolves.toEqual({
      outcome: 'already_cancelled',
    })
  })

  it('does not duplicate claims or durable work on a repeated identical reschedule', async () => {
    const f = await fixture()
    await f.service.reschedule(f.token, NEW_START)

    const repeat = await f.service.reschedule(f.token, NEW_START)

    expect(repeat).toEqual({ outcome: 'slot_taken' })
    expect(
      f.claims.rows.filter(
        (row) =>
          row.status === 'active' && row.startsAt.getTime() === NEW_START.getTime(),
      ),
    ).toHaveLength(1)
    expect(
      f.operations.rows.filter((row) => row.kind === 'update_booking_artifacts'),
    ).toHaveLength(1)
    expect(f.repo.events.filter((event) => event.event === 'rescheduled')).toHaveLength(1)
  })
})

describe('Manage Link cancellation', () => {
  it('cancels with an automatic refund more than 24 hours out', async () => {
    const f = await fixture()
    await f.operations.repository.enqueue({
      kind: 'send_reminder',
      dedupeKey: `reminder:${f.bookingId}`,
      bookingId: f.bookingId,
      nextAttemptAt: START,
      now: NOW,
    })
    await f.operations.repository.enqueue({
      kind: 'finalize_booking',
      dedupeKey: `finalize:${f.bookingId}:${START.toISOString()}`,
      bookingId: f.bookingId,
      nextAttemptAt: NOW,
      now: NOW,
    })

    const result = await f.service.cancel(f.token)

    expect(result).toMatchObject({
      outcome: 'done',
      view: expect.objectContaining({
        status: 'cancelled',
        refundStatus: 'pending',
        canReschedule: false,
        canCancel: false,
        refundOnCancel: false,
      }),
    })
    expect(f.bookingRow()).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'guest',
      refundStatus: 'pending',
      refundReason: 'guest_cancellation',
    })
    await expect(f.claims.repository.get(f.claimId)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'cancelled',
    })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toMatchObject({
      dedupeKey: `refund:${f.bookingId}`,
      status: 'pending',
    })
    expect(
      f.operations.rows.find((row) => row.kind === 'send_booking_email'),
    ).toMatchObject({
      dedupeKey: `email:cancelled:${f.bookingId}`,
      payload: { kind: 'cancelled', refund: 'automatic' },
      status: 'pending',
    })
    expect(
      f.operations.rows.find((row) => row.kind === 'send_reminder'),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      f.operations.rows.find((row) => row.kind === 'finalize_booking'),
    ).toMatchObject({ status: 'cancelled' })
    expect(
      f.operations.rows.find((row) => row.kind === 'remove_booking_artifacts'),
    ).toBeUndefined()
    expect(f.repo.events).toEqual([
      expect.objectContaining({ event: 'cancelled_by_guest', actor: 'guest' }),
    ])
  })

  it('removes provider artifacts only when the meeting was already created', async () => {
    const f = await fixture()
    f.bookingRow().googleCalendarEventId = 'gcal-event-1'

    await f.service.cancel(f.token)

    expect(
      f.operations.rows.find((row) => row.kind === 'remove_booking_artifacts'),
    ).toMatchObject({ dedupeKey: `remove-artifacts:${f.bookingId}`, status: 'pending' })
  })

  it('cancels without a refund inside 24 hours', async () => {
    const f = await fixture()
    f.setNow(new Date(START.getTime() - 60 * MS_PER_MINUTE))

    const result = await f.service.cancel(f.token)

    expect(result).toMatchObject({ outcome: 'done' })
    expect(f.bookingRow()).toMatchObject({
      status: 'cancelled',
      refundStatus: 'none',
      refundReason: null,
    })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toBeUndefined()
    expect(
      f.operations.rows.find((row) => row.kind === 'send_booking_email'),
    ).toMatchObject({ payload: { kind: 'cancelled', refund: 'none' } })
  })

  it('answers a duplicate cancel as already_cancelled without a second refund', async () => {
    const f = await fixture()

    await f.service.cancel(f.token)
    const repeat = await f.service.cancel(f.token)

    expect(repeat).toEqual({ outcome: 'already_cancelled' })
    expect(f.operations.rows.filter((row) => row.kind === 'issue_refund')).toHaveLength(1)
    expect(
      f.repo.events.filter((event) => event.event === 'cancelled_by_guest'),
    ).toHaveLength(1)
  })

  it('refunds a conflicted booking automatically even inside 24 hours', async () => {
    const f = await fixture({ status: 'needs_reschedule' })
    f.setNow(new Date(START.getTime() - 60 * MS_PER_MINUTE))

    const result = await f.service.cancel(f.token)

    expect(result).toMatchObject({ outcome: 'done' })
    expect(f.bookingRow()).toMatchObject({
      status: 'cancelled',
      refundStatus: 'pending',
      refundReason: 'guest_cancellation',
    })
    expect(f.operations.rows.find((row) => row.kind === 'issue_refund')).toMatchObject({
      status: 'pending',
    })
  })
})

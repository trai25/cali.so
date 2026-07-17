import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import { createSlotClaimsRepository, type ClaimsDatabase } from './claims'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const now = new Date('2026-08-01T00:00:00.000Z')
const holdExpiry = new Date(now.getTime() + 30 * MINUTE)
const unknownClaimId = '00000000-0000-4000-8000-000000000000'

function slot(startIso: string) {
  const startsAt = new Date(startIso)
  return { startsAt, endsAt: new Date(startsAt.getTime() + HOUR) }
}

describe('Slot Claim repository', () => {
  const getClient = usePGliteTestClient([
    '0001_ama_owner_auth.sql',
    '0002_ama_availability.sql',
    '0003_ama_google_calendar.sql',
    '0004_ama_google_oauth.sql',
    '0011_ama_booking_system.sql',
  ])
  let repository: ReturnType<typeof createSlotClaimsRepository>

  beforeEach(() => {
    const database = drizzle(getClient())
    repository = createSlotClaimsRepository(() => database as unknown as ClaimsDatabase)
  })

  it('creates a Slot Hold on a free interval', async () => {
    const { startsAt, endsAt } = slot('2026-08-10T02:00:00.000Z')

    const hold = await repository.createHold({ startsAt, endsAt, expiresAt: holdExpiry, now })

    expect(hold).toMatchObject({
      kind: 'hold',
      status: 'active',
      startsAt,
      endsAt,
      expiresAt: holdExpiry,
      releasedAt: null,
      releaseReason: null,
    })
  })

  it('rejects a second hold over the same interval', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')
    await repository.createHold({ ...interval, expiresAt: holdExpiry, now })

    await expect(
      repository.createHold({ ...interval, expiresAt: holdExpiry, now }),
    ).resolves.toBeNull()
  })

  it('rejects a hold that lands inside the buffer of an existing hold', async () => {
    await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })

    // Starts 15 minutes after the first hold ends; the trailing and leading
    // buffers still collide, so the exclusion constraint rejects it.
    await expect(
      repository.createHold({
        ...slot('2026-08-10T03:15:00.000Z'),
        expiresAt: holdExpiry,
        now,
      }),
    ).resolves.toBeNull()
  })

  it('accepts a hold that clears the buffers of an existing hold', async () => {
    await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })

    // Starts 30 minutes after the first hold ends, so the buffered ranges
    // touch without overlapping.
    await expect(
      repository.createHold({
        ...slot('2026-08-10T03:30:00.000Z'),
        expiresAt: holdExpiry,
        now,
      }),
    ).resolves.not.toBeNull()
  })

  it('grants exactly one of two concurrent holds for the same start time', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')

    const holds = await Promise.all([
      repository.createHold({ ...interval, expiresAt: holdExpiry, now }),
      repository.createHold({ ...interval, expiresAt: holdExpiry, now }),
    ])

    expect(holds.filter((hold) => hold !== null)).toHaveLength(1)
  })

  it('releases an expired overlapping hold before claiming the interval', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')
    const stale = await repository.createHold({ ...interval, expiresAt: holdExpiry, now })
    const later = new Date(holdExpiry.getTime() + MINUTE)

    const fresh = await repository.createHold({
      ...interval,
      expiresAt: new Date(later.getTime() + 30 * MINUTE),
      now: later,
    })

    expect(fresh).not.toBeNull()
    await expect(repository.get(stale!.id)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'expired',
      releasedAt: later,
    })
  })

  it('does not claim over an active unexpired hold', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')
    const active = await repository.createHold({ ...interval, expiresAt: holdExpiry, now })
    const later = new Date(now.getTime() + 10 * MINUTE)

    await expect(
      repository.createHold({
        ...interval,
        expiresAt: new Date(later.getTime() + 30 * MINUTE),
        now: later,
      }),
    ).resolves.toBeNull()
    await expect(repository.get(active!.id)).resolves.toMatchObject({ status: 'active' })
  })

  it('converts an active unexpired hold into a Booking claim', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })

    const converted = await repository.convertHoldToBooking(
      hold!.id,
      new Date(now.getTime() + 5 * MINUTE),
    )

    expect(converted).toMatchObject({
      id: hold!.id,
      kind: 'booking',
      status: 'active',
      expiresAt: null,
    })
  })

  it('does not convert an expired hold', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })

    await expect(repository.convertHoldToBooking(hold!.id, holdExpiry)).resolves.toBeNull()
  })

  it('does not convert a released hold', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })
    await repository.release(hold!.id, 'abandoned', now)

    await expect(
      repository.convertHoldToBooking(hold!.id, new Date(now.getTime() + 5 * MINUTE)),
    ).resolves.toBeNull()
  })

  it('lets exactly one of two concurrent conversions win', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })
    const convertAt = new Date(now.getTime() + 5 * MINUTE)

    const conversions = await Promise.all([
      repository.convertHoldToBooking(hold!.id, convertAt),
      repository.convertHoldToBooking(hold!.id, convertAt),
    ])

    expect(conversions.filter((claim) => claim !== null)).toHaveLength(1)
  })

  it('keeps a converted claim out of reach of the expiry sweep', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })
    await repository.convertHoldToBooking(hold!.id, new Date(now.getTime() + 5 * MINUTE))

    // Conversion nulls the expiry, so even a sweep from the far future must
    // leave the Booking claim untouched.
    await expect(
      repository.releaseExpiredHolds(new Date('2027-01-01T00:00:00.000Z')),
    ).resolves.toBe(0)
    await expect(repository.get(hold!.id)).resolves.toMatchObject({
      kind: 'booking',
      status: 'active',
    })
  })

  it('creates a Booking claim directly without an expiry', async () => {
    const { startsAt, endsAt } = slot('2026-08-10T02:00:00.000Z')

    const claim = await repository.createBookingClaim({ startsAt, endsAt, now })

    expect(claim).toMatchObject({
      kind: 'booking',
      status: 'active',
      startsAt,
      endsAt,
      expiresAt: null,
    })
  })

  it('rejects a Booking claim over an active unexpired hold', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')
    await repository.createHold({ ...interval, expiresAt: holdExpiry, now })

    await expect(repository.createBookingClaim({ ...interval, now })).resolves.toBeNull()
  })

  it('claims a Booking claim over an expired overlapping hold', async () => {
    const interval = slot('2026-08-10T02:00:00.000Z')
    const stale = await repository.createHold({ ...interval, expiresAt: holdExpiry, now })
    const later = new Date(holdExpiry.getTime() + MINUTE)

    await expect(
      repository.createBookingClaim({ ...interval, now: later }),
    ).resolves.not.toBeNull()
    await expect(repository.get(stale!.id)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'expired',
    })
  })

  it('releases an active claim with a reason exactly once', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })
    const releaseAt = new Date(now.getTime() + 5 * MINUTE)

    const released = await repository.release(hold!.id, 'cancelled', releaseAt)

    expect(released).toMatchObject({
      id: hold!.id,
      status: 'released',
      releaseReason: 'cancelled',
      releasedAt: releaseAt,
    })
    await expect(repository.release(hold!.id, 'superseded', releaseAt)).resolves.toBeNull()
  })

  it('sweeps only expired holds', async () => {
    const expired = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })
    const active = await repository.createHold({
      ...slot('2026-08-11T02:00:00.000Z'),
      expiresAt: new Date(now.getTime() + 2 * HOUR),
      now,
    })
    const booking = await repository.createBookingClaim({
      ...slot('2026-08-12T02:00:00.000Z'),
      now,
    })
    const sweepAt = new Date(holdExpiry.getTime() + MINUTE)

    await expect(repository.releaseExpiredHolds(sweepAt)).resolves.toBe(1)

    await expect(repository.get(expired!.id)).resolves.toMatchObject({
      status: 'released',
      releaseReason: 'expired',
    })
    await expect(repository.get(active!.id)).resolves.toMatchObject({ status: 'active' })
    await expect(repository.get(booking!.id)).resolves.toMatchObject({ status: 'active' })
  })

  it('lists active claims that can still block availability', async () => {
    const upcomingHold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: new Date(now.getTime() + 2 * HOUR),
      now,
    })
    const expiredUnsweptHold = await repository.createHold({
      ...slot('2026-08-11T02:00:00.000Z'),
      expiresAt: new Date(now.getTime() + 5 * MINUTE),
      now,
    })
    const bookingClaim = await repository.createBookingClaim({
      ...slot('2026-08-12T02:00:00.000Z'),
      now,
    })
    const released = await repository.createHold({
      ...slot('2026-08-13T02:00:00.000Z'),
      expiresAt: new Date(now.getTime() + 2 * HOUR),
      now,
    })
    await repository.release(released!.id, 'abandoned', now)
    await repository.createBookingClaim({ ...slot('2026-07-20T02:00:00.000Z'), now })

    const blocking = await repository.listBlocking(new Date(now.getTime() + HOUR))

    expect(blocking.map((claim) => claim.id).sort()).toEqual(
      [upcomingHold!.id, expiredUnsweptHold!.id, bookingClaim!.id].sort(),
    )
  })

  it('returns a claim by id and null for an unknown id', async () => {
    const hold = await repository.createHold({
      ...slot('2026-08-10T02:00:00.000Z'),
      expiresAt: holdExpiry,
      now,
    })

    await expect(repository.get(hold!.id)).resolves.toMatchObject({ id: hold!.id })
    await expect(repository.get(unknownClaimId)).resolves.toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { computeAvailableSlots, type AvailabilityInput } from './engine'
import { AMA_BOOKING_POLICY } from './policy'

const at = (value: string) => new Date(value)

function starts(input: AvailabilityInput) {
  return computeAvailableSlots(input).map((slot) => slot.startsAt.toISOString())
}

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    now: at('2026-07-13T00:00:00.000Z'),
    ownerTimeZone: 'UTC',
    windows: [{ isoWeekday: 2, startMinute: 9 * 60, endMinute: 12 * 60 }],
    googleBusy: [],
    slotHolds: [],
    bookings: [],
    ...overrides,
  }
}

describe('AMA availability policy', () => {
  it('keeps the fixed booking rules in one policy value', () => {
    expect(AMA_BOOKING_POLICY).toEqual({
      sessionMinutes: 60,
      minimumNoticeMinutes: 24 * 60,
      horizonDays: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      startCadenceMinutes: 30,
    })
  })
})

describe('computeAvailableSlots', () => {
  it('requires the session, but not its buffers, to fit inside each window', () => {
    const result = starts(baseInput())

    expect(result.slice(0, 5)).toEqual([
      '2026-07-14T09:00:00.000Z',
      '2026-07-14T09:30:00.000Z',
      '2026-07-14T10:00:00.000Z',
      '2026-07-14T10:30:00.000Z',
      '2026-07-14T11:00:00.000Z',
    ])
    expect(result).not.toContain('2026-07-14T11:30:00.000Z')
  })

  it('includes the notice boundary and excludes the rolling horizon boundary', () => {
    const result = starts(
      baseInput({
        now: at('2026-07-13T09:00:00.000Z'),
        windows: [
          { isoWeekday: 2, startMinute: 9 * 60, endMinute: 10 * 60 },
          { isoWeekday: 3, startMinute: 9 * 60, endMinute: 10 * 60 },
        ],
      }),
    )

    expect(result).toContain('2026-07-14T09:00:00.000Z')
    expect(result).not.toContain('2026-08-12T09:00:00.000Z')
  })

  it('applies buffers to busy time while preserving half-open touching edges', () => {
    const result = starts(
      baseInput({
        googleBusy: [
          {
            startsAt: at('2026-07-14T10:15:00.000Z'),
            endsAt: at('2026-07-14T10:45:00.000Z'),
          },
        ],
      }),
    )

    expect(result.filter((start) => start.startsWith('2026-07-14'))).toEqual([
      '2026-07-14T09:00:00.000Z',
      '2026-07-14T11:00:00.000Z',
    ])
  })

  it('ignores expired holds and blocks active holds and Bookings', () => {
    const result = starts(
      baseInput({
        windows: [{ isoWeekday: 2, startMinute: 9 * 60, endMinute: 13 * 60 }],
        slotHolds: [
          {
            startsAt: at('2026-07-14T09:00:00.000Z'),
            endsAt: at('2026-07-14T10:00:00.000Z'),
            expiresAt: at('2026-07-13T00:00:00.000Z'),
          },
          {
            startsAt: at('2026-07-14T12:00:00.000Z'),
            endsAt: at('2026-07-14T13:00:00.000Z'),
            expiresAt: at('2026-07-13T00:00:00.001Z'),
          },
        ],
        bookings: [
          {
            startsAt: at('2026-07-14T10:30:00.000Z'),
            endsAt: at('2026-07-14T11:30:00.000Z'),
          },
        ],
      }),
    )

    expect(result).toContain('2026-07-14T09:00:00.000Z')
    expect(result).not.toContain('2026-07-14T10:00:00.000Z')
    expect(result).not.toContain('2026-07-14T11:30:00.000Z')
  })

  it('interprets recurring windows in the owner time zone across a UTC date boundary', () => {
    const result = starts(
      baseInput({
        ownerTimeZone: 'Asia/Taipei',
        windows: [{ isoWeekday: 2, startMinute: 7 * 60, endMinute: 9 * 60 }],
      }),
    )

    expect(result[0]).toBe('2026-07-14T00:00:00.000Z')
  })

  it('skips nonexistent starts in a daylight-saving gap', () => {
    const result = starts(
      baseInput({
        now: at('2026-03-06T00:00:00.000Z'),
        ownerTimeZone: 'America/New_York',
        windows: [{ isoWeekday: 7, startMinute: 60, endMinute: 4 * 60 }],
      }),
    ).filter((start) => start.startsWith('2026-03-08'))

    expect(result).toEqual([
      '2026-03-08T06:00:00.000Z',
      '2026-03-08T06:30:00.000Z',
      '2026-03-08T07:00:00.000Z',
    ])
  })

  it('offers both real instants for repeated starts in a daylight-saving fold', () => {
    const result = starts(
      baseInput({
        now: at('2026-10-30T00:00:00.000Z'),
        ownerTimeZone: 'America/New_York',
        windows: [{ isoWeekday: 7, startMinute: 30, endMinute: 3 * 60 }],
      }),
    ).filter((start) => start.startsWith('2026-11-01'))

    expect(result).toEqual([
      '2026-11-01T04:30:00.000Z',
      '2026-11-01T05:00:00.000Z',
      '2026-11-01T05:30:00.000Z',
      '2026-11-01T06:00:00.000Z',
      '2026-11-01T06:30:00.000Z',
      '2026-11-01T07:00:00.000Z',
    ])
  })

  it('merges multiple windows into a sorted deterministic set without duplicates', () => {
    const first = baseInput({
      windows: [
        { isoWeekday: 2, startMinute: 10 * 60, endMinute: 12 * 60 },
        { isoWeekday: 2, startMinute: 9 * 60, endMinute: 11 * 60 },
      ],
      googleBusy: [
        {
          startsAt: at('2026-07-21T09:45:00.000Z'),
          endsAt: at('2026-07-21T10:15:00.000Z'),
        },
        {
          startsAt: at('2026-07-14T09:45:00.000Z'),
          endsAt: at('2026-07-14T10:15:00.000Z'),
        },
      ],
    })
    const second = {
      ...first,
      windows: [...first.windows].reverse(),
      googleBusy: [...first.googleBusy].reverse(),
    }

    const firstResult = starts(first)
    const secondResult = starts(second)

    expect(firstResult).toEqual(secondResult)
    expect(firstResult).toEqual([...new Set(firstResult)].sort())
  })
})

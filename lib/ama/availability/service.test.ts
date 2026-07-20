import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { TimeInterval, SlotHold } from './engine'
import {
  createAvailabilityService,
  InvalidAvailabilityOverrideError,
  InvalidAvailabilityTimeZoneError,
  type AvailabilityRepository,
  type CalendarAvailability,
} from './service'

function fixture() {
  let id = 3
  let timeZone = 'Asia/Taipei'
  let overrides: Awaited<ReturnType<AvailabilityRepository['listOverrides']>> = []
  const windows = [
    {
      id: 1,
      isoWeekday: 3,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    },
    {
      id: 2,
      isoWeekday: 3,
      startMinute: 13 * 60,
      endMinute: 17 * 60,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    },
  ]
  const repository: AvailabilityRepository = {
    async getTimeZone() {
      return timeZone
    },
    async setTimeZone(value) {
      timeZone = value
      return value
    },
    async listOverrides() {
      return overrides
    },
    async saveOverride(localDate, intervals) {
      const saved = {
        id: 1,
        localDate,
        intervals: intervals.map((interval, index) => ({
          id: index + 1,
          overrideId: 1,
          ...interval,
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          updatedAt: new Date('2026-07-14T00:00:00.000Z'),
        })),
        createdAt: new Date('2026-07-14T00:00:00.000Z'),
        updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      }
      overrides = [saved]
      return saved
    },
    async deleteOverride(localDate) {
      const found = overrides.some((override) => override.localDate === localDate)
      overrides = overrides.filter((override) => override.localDate !== localDate)
      return found
    },
    async replaceWeekday(isoWeekday, intervals) {
      for (let index = windows.length - 1; index >= 0; index -= 1) {
        if (windows[index].isoWeekday === isoWeekday) windows.splice(index, 1)
      }
      for (const interval of intervals) {
        windows.push({
          id: id++,
          isoWeekday,
          ...interval,
          createdAt: new Date('2026-07-14T00:00:00.000Z'),
          updatedAt: new Date('2026-07-14T00:00:00.000Z'),
        })
      }
    },
    async copyWeekday(sourceWeekday, targetWeekdays) {
      const source = windows.filter((window) => window.isoWeekday === sourceWeekday)
      for (const target of targetWeekdays) {
        for (let index = windows.length - 1; index >= 0; index -= 1) {
          if (windows[index].isoWeekday === target) windows.splice(index, 1)
        }
        for (const window of source) {
          windows.push({ ...window, id: id++, isoWeekday: target })
        }
      }
    },
    async list() {
      return [...windows]
    },
    async create(input) {
      const created = {
        id: id++,
        ...input,
        createdAt: new Date('2026-07-14T00:00:00.000Z'),
        updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      }
      windows.push(created)
      return created
    },
    async update(windowId, input) {
      const existing = windows.find((window) => window.id === windowId)
      if (!existing) return null
      Object.assign(existing, input)
      return existing
    },
    async delete(windowId) {
      const index = windows.findIndex((window) => window.id === windowId)
      if (index === -1) return false
      windows.splice(index, 1)
      return true
    },
  }
  let calendarResult: Awaited<ReturnType<CalendarAvailability['queryFreeBusy']>> = {
    status: 'connected',
    busy: [],
  }
  const calendar: CalendarAvailability = {
    async queryFreeBusy() {
      return calendarResult
    },
  }
  const service = createAvailabilityService({
    repository,
    calendar,
    clock: { now: () => new Date('2026-07-14T00:00:00.000Z') },
  })
  return {
    service,
    windows,
    setCalendarResult(value: typeof calendarResult) {
      calendarResult = value
    },
  }
}

describe('Availability Window service', () => {
  it('returns the complete persisted schedule for the admin UI', async () => {
    const f = fixture()

    await f.service.saveOverride('2026-07-16', [])

    await expect(f.service.getSchedule()).resolves.toMatchObject({
      timeZone: 'Asia/Taipei',
      windows: [{ id: 1 }, { id: 2 }],
      overrides: [{ localDate: '2026-07-16', intervals: [] }],
    })
  })

  it('validates and persists the schedule time zone', async () => {
    const f = fixture()

    await expect(f.service.setTimeZone('America/Los_Angeles')).resolves.toBe(
      'America/Los_Angeles',
    )
    await expect(f.service.getSchedule()).resolves.toMatchObject({
      timeZone: 'America/Los_Angeles',
    })
    expect(() => f.service.setTimeZone('Not/AZone')).toThrow(
      InvalidAvailabilityTimeZoneError,
    )
  })

  it('turns weekdays off and restores a useful default interval', async () => {
    const f = fixture()

    await f.service.setWeekday(3, false)
    expect(f.windows).toEqual([])

    await f.service.setWeekday(5, true)
    expect(f.windows).toMatchObject([
      { isoWeekday: 5, startMinute: 540, endMinute: 720 },
    ])
  })

  it('copies one day to selected weekdays', async () => {
    const f = fixture()

    await f.service.copyWeekday(3, [1, 5])

    expect(
      f.windows
        .filter((window) => window.isoWeekday !== 3)
        .map(({ isoWeekday, startMinute, endMinute }) => ({
          isoWeekday,
          startMinute,
          endMinute,
        })),
    ).toEqual([
      { isoWeekday: 1, startMinute: 540, endMinute: 720 },
      { isoWeekday: 1, startMinute: 780, endMinute: 1020 },
      { isoWeekday: 5, startMinute: 540, endMinute: 720 },
      { isoWeekday: 5, startMinute: 780, endMinute: 1020 },
    ])
  })

  it('rejects malformed date overrides before persistence', async () => {
    const f = fixture()

    expect(() => f.service.saveOverride('2026-02-30', [])).toThrow(
      InvalidAvailabilityOverrideError,
    )
    expect(() =>
      f.service.saveOverride('2026-07-16', [
        { startMinute: 720, endMinute: 540 },
      ]),
    ).toThrow(InvalidAvailabilityOverrideError)
  })

  it('stores touching and overlapping windows without a racy preflight check', async () => {
    const f = fixture()

    await expect(
      f.service.create({ isoWeekday: 3, startMinute: 12 * 60, endMinute: 13 * 60 }),
    ).resolves.toMatchObject({ startMinute: 720, endMinute: 780 })
    await expect(
      f.service.create({ isoWeekday: 3, startMinute: 11 * 60, endMinute: 14 * 60 }),
    ).resolves.toMatchObject({ startMinute: 660, endMinute: 840 })
  })

  it('edits a window even when the result overlaps another window', async () => {
    const f = fixture()

    await expect(
      f.service.update(1, { isoWeekday: 3, startMinute: 8 * 60, endMinute: 12 * 60 }),
    ).resolves.toMatchObject({ id: 1, startMinute: 480 })
    await expect(
      f.service.update(1, { isoWeekday: 3, startMinute: 12 * 60, endMinute: 14 * 60 }),
    ).resolves.toMatchObject({ id: 1, startMinute: 720, endMinute: 840 })
  })

  it('deletes only the selected Availability Window', async () => {
    const f = fixture()

    await f.service.delete(1)

    expect(f.windows.map((window) => window.id)).toEqual([2])
  })

  it('previews slots through the production engine with Google busy time', async () => {
    const f = fixture()
    f.setCalendarResult({
      status: 'connected',
      busy: [
        {
          startsAt: new Date('2026-07-15T02:00:00.000Z'),
          endsAt: new Date('2026-07-15T03:00:00.000Z'),
        },
      ],
    })

    const preview = await f.service.preview()

    expect(preview.status).toBe('connected')
    expect(preview.slots.slice(0, 3).map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-07-15T05:00:00.000Z',
      '2026-07-15T05:30:00.000Z',
      '2026-07-15T06:00:00.000Z',
    ])
  })

  it('previews custom date overrides in the persisted schedule time zone', async () => {
    const f = fixture()
    await f.service.saveOverride('2026-07-15', [
      { startMinute: 18 * 60, endMinute: 20 * 60 },
    ])

    const preview = await f.service.preview()

    expect(
      preview.slots
        .map((slot) => slot.startsAt.toISOString())
        .filter((start) => start.startsWith('2026-07-15')),
    ).toEqual([
      '2026-07-15T10:00:00.000Z',
      '2026-07-15T10:30:00.000Z',
      '2026-07-15T11:00:00.000Z',
    ])
  })

  it('fails closed when Calendar is disconnected or unavailable', async () => {
    const f = fixture()
    f.setCalendarResult({ status: 'disconnected', busy: [] })

    await expect(f.service.preview()).resolves.toEqual({
      status: 'disconnected',
      slots: [],
    })
  })

  it('combines caller-provided active holds and Bookings in the same preview engine', async () => {
    const f = fixture()
    const slotHolds: SlotHold[] = [
      {
        startsAt: new Date('2026-07-15T01:00:00.000Z'),
        endsAt: new Date('2026-07-15T02:00:00.000Z'),
        expiresAt: new Date('2026-07-14T00:15:00.000Z'),
      },
    ]
    const bookings: TimeInterval[] = [
      {
        startsAt: new Date('2026-07-15T04:00:00.000Z'),
        endsAt: new Date('2026-07-15T05:00:00.000Z'),
      },
    ]

    const preview = await f.service.preview({ slotHolds, bookings })

    expect(preview.slots.slice(0, 2).map((slot) => slot.startsAt.toISOString())).toEqual([
      '2026-07-15T02:30:00.000Z',
      '2026-07-15T05:30:00.000Z',
    ])
  })
})

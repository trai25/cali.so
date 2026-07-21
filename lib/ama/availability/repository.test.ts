import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createAvailabilityRepository,
  type AvailabilityDatabase,
} from './repository'

describe('Availability Window repository', () => {
  const getClient = usePGliteTestClient([
    '0001_ama_owner_auth.sql',
    '0002_ama_availability.sql',
    '0014_ama_availability_overrides.sql',
    '0015_ama_availability_weekdays.sql',
  ])
  let repository: ReturnType<typeof createAvailabilityRepository>

  beforeEach(() => {
    const database = drizzle(getClient())
    repository = createAvailabilityRepository(() => database as unknown as AvailabilityDatabase)
  })

  it('stores multiple same-day Availability Windows in deterministic order', async () => {
    await repository.create({ isoWeekday: 3, startMinute: 780, endMinute: 1020 })
    await repository.create({ isoWeekday: 1, startMinute: 540, endMinute: 720 })
    await repository.create({ isoWeekday: 1, startMinute: 780, endMinute: 900 })

    const windows = await repository.list()

    expect(windows.map(({ isoWeekday, startMinute, endMinute }) => ({
      isoWeekday,
      startMinute,
      endMinute,
    }))).toEqual([
      { isoWeekday: 1, startMinute: 540, endMinute: 720 },
      { isoWeekday: 1, startMinute: 780, endMinute: 900 },
      { isoWeekday: 3, startMinute: 780, endMinute: 1020 },
    ])
  })

  it('returns the default schedule time zone and persists an owner change', async () => {
    await expect(repository.getTimeZone()).resolves.toBe('Asia/Taipei')

    await repository.setTimeZone('America/Los_Angeles')

    await expect(repository.getTimeZone()).resolves.toBe('America/Los_Angeles')
  })

  it('persists weekday state separately from retained intervals', async () => {
    await repository.create({
      isoWeekday: 3,
      startMinute: 9 * 60,
      endMinute: 12 * 60,
    })

    await expect(repository.listWeekdayStates()).resolves.toContainEqual({
      isoWeekday: 3,
      enabled: true,
    })
    await repository.setWeekdayEnabled(3, false)

    await expect(repository.listWeekdayStates()).resolves.toContainEqual({
      isoWeekday: 3,
      enabled: false,
    })
    await expect(repository.list()).resolves.toMatchObject([
      { isoWeekday: 3, startMinute: 540, endMinute: 720 },
    ])
  })

  it('stores a closed date override as an override without intervals', async () => {
    await repository.saveOverride('2026-07-22', [])

    await expect(repository.listOverrides()).resolves.toMatchObject([
      { localDate: '2026-07-22', intervals: [] },
    ])
  })

  it('atomically replaces custom override intervals and can restore the weekly schedule', async () => {
    await repository.saveOverride('2026-07-23', [
      { startMinute: 9 * 60, endMinute: 11 * 60 },
      { startMinute: 14 * 60, endMinute: 17 * 60 },
    ])
    await repository.saveOverride('2026-07-23', [
      { startMinute: 12 * 60, endMinute: 13 * 60 },
    ])

    await expect(repository.listOverrides()).resolves.toMatchObject([
      {
        localDate: '2026-07-23',
        intervals: [{ startMinute: 720, endMinute: 780 }],
      },
    ])
    await expect(repository.deleteOverride('2026-07-23')).resolves.toBe(true)
    await expect(repository.deleteOverride('2026-07-23')).resolves.toBe(false)
    await expect(repository.listOverrides()).resolves.toEqual([])
  })

  it('edits an existing Availability Window', async () => {
    const created = await repository.create({ isoWeekday: 2, startMinute: 540, endMinute: 720 })

    const updated = await repository.update(created.id, {
      isoWeekday: 4,
      startMinute: 780,
      endMinute: 960,
    })

    expect(updated).toMatchObject({
      id: created.id,
      isoWeekday: 4,
      startMinute: 780,
      endMinute: 960,
    })
  })

  it('deletes an Availability Window by id', async () => {
    const kept = await repository.create({ isoWeekday: 2, startMinute: 540, endMinute: 720 })
    const removed = await repository.create({
      isoWeekday: 4,
      startMinute: 780,
      endMinute: 960,
    })

    await expect(repository.delete(removed.id)).resolves.toBe(true)
    await expect(repository.delete(removed.id)).resolves.toBe(false)
    await expect(repository.list()).resolves.toMatchObject([{ id: kept.id }])
  })

  it('copies one weekday to selected weekdays as one schedule mutation', async () => {
    await repository.create({ isoWeekday: 2, startMinute: 540, endMinute: 720 })
    await repository.create({ isoWeekday: 2, startMinute: 780, endMinute: 1020 })
    await repository.create({ isoWeekday: 4, startMinute: 600, endMinute: 660 })
    await repository.setWeekdayEnabled(2, false)

    await repository.copyWeekday(2, [4, 5])

    const windows = await repository.list()
    expect(
      windows
        .filter((window) => window.isoWeekday === 4 || window.isoWeekday === 5)
        .map(({ isoWeekday, startMinute, endMinute }) => ({
          isoWeekday,
          startMinute,
          endMinute,
        })),
    ).toEqual([
      { isoWeekday: 4, startMinute: 540, endMinute: 720 },
      { isoWeekday: 4, startMinute: 780, endMinute: 1020 },
      { isoWeekday: 5, startMinute: 540, endMinute: 720 },
      { isoWeekday: 5, startMinute: 780, endMinute: 1020 },
    ])
    await expect(repository.listWeekdayStates()).resolves.toEqual(
      expect.arrayContaining([
        { isoWeekday: 4, enabled: false },
        { isoWeekday: 5, enabled: false },
      ]),
    )
  })

  it('replaces a weekday with one complete set of hours', async () => {
    await repository.create({ isoWeekday: 3, startMinute: 540, endMinute: 720 })

    await repository.replaceWeekday(3, [])
    expect((await repository.list()).filter((window) => window.isoWeekday === 3)).toEqual([])

    await repository.replaceWeekday(3, [
      { startMinute: 600, endMinute: 720 },
      { startMinute: 780, endMinute: 1020 },
    ])
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({
        isoWeekday: 3,
        startMinute: 600,
        endMinute: 720,
      }),
      expect.objectContaining({
        isoWeekday: 3,
        startMinute: 780,
        endMinute: 1020,
      }),
    ])
  })

  it('rolls back the weekday replacement when an insert fails', async () => {
    await repository.create({ isoWeekday: 3, startMinute: 540, endMinute: 720 })

    await expect(
      repository.replaceWeekday(3, [
        { startMinute: 780, endMinute: 1020 },
        { startMinute: -1, endMinute: 720 },
      ]),
    ).rejects.toThrow()

    expect((await repository.list()).filter((window) => window.isoWeekday === 3))
      .toEqual([
        expect.objectContaining({
          isoWeekday: 3,
          startMinute: 540,
          endMinute: 720,
        }),
      ])
  })

  it.each([
    { isoWeekday: 0, startMinute: 540, endMinute: 720 },
    { isoWeekday: 8, startMinute: 540, endMinute: 720 },
  ])('rejects an invalid ISO weekday: $isoWeekday', async (input) => {
    await expect(repository.create(input)).rejects.toThrow()
  })

  it.each([
    { isoWeekday: 1, startMinute: -1, endMinute: 720 },
    { isoWeekday: 1, startMinute: 1440, endMinute: 1441 },
    { isoWeekday: 1, startMinute: 0, endMinute: 0 },
    { isoWeekday: 1, startMinute: 1439, endMinute: 1441 },
  ])(
    'rejects invalid minute bounds: $startMinute-$endMinute',
    async (input) => {
      await expect(repository.create(input)).rejects.toThrow()
    },
  )

  it.each([
    { isoWeekday: 1, startMinute: 720, endMinute: 720 },
    { isoWeekday: 1, startMinute: 900, endMinute: 540 },
  ])(
    'rejects an equal or overnight Availability Window: $startMinute-$endMinute',
    async (input) => {
      await expect(repository.create(input)).rejects.toThrow()
    },
  )
})

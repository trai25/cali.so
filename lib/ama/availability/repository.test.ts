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

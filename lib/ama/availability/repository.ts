import 'server-only'

import { asc, eq, inArray, sql } from 'drizzle-orm'

import { getDatabase } from '~/db'
import {
  amaAvailabilityOverrides,
  amaAvailabilityOverrideWindows,
  amaAvailabilitySettings,
  amaAvailabilityWindows,
} from '~/db/schema'

export const DEFAULT_AVAILABILITY_TIME_ZONE = 'Asia/Taipei'

export type AvailabilityDatabase = ReturnType<typeof getDatabase>

export type AvailabilityWindowInput = {
  isoWeekday: number
  startMinute: number
  endMinute: number
}

export type AvailabilityOverrideIntervalInput = Pick<
  AvailabilityWindowInput,
  'startMinute' | 'endMinute'
>

export function createAvailabilityRepository(database: () => AvailabilityDatabase) {
  return {
    async getTimeZone() {
      const [settings] = await database()
        .select({ timeZone: amaAvailabilitySettings.timeZone })
        .from(amaAvailabilitySettings)
        .where(eq(amaAvailabilitySettings.id, 1))
        .limit(1)
      return settings?.timeZone ?? DEFAULT_AVAILABILITY_TIME_ZONE
    },

    async setTimeZone(timeZone: string) {
      const [settings] = await database()
        .insert(amaAvailabilitySettings)
        .values({ id: 1, timeZone })
        .onConflictDoUpdate({
          target: amaAvailabilitySettings.id,
          set: { timeZone, updatedAt: sql`now()` },
        })
        .returning({ timeZone: amaAvailabilitySettings.timeZone })
      return settings.timeZone
    },

    async listOverrides() {
      const [overrides, intervals] = await Promise.all([
        database()
          .select()
          .from(amaAvailabilityOverrides)
          .orderBy(asc(amaAvailabilityOverrides.localDate)),
        database()
          .select()
          .from(amaAvailabilityOverrideWindows)
          .orderBy(
            asc(amaAvailabilityOverrideWindows.overrideId),
            asc(amaAvailabilityOverrideWindows.startMinute),
            asc(amaAvailabilityOverrideWindows.endMinute),
            asc(amaAvailabilityOverrideWindows.id),
          ),
      ])
      return overrides.map((override) => ({
        ...override,
        intervals: intervals.filter(
          (interval) => interval.overrideId === override.id,
        ),
      }))
    },

    async saveOverride(
      localDate: string,
      intervals: readonly AvailabilityOverrideIntervalInput[],
    ) {
      return database().transaction(async (transaction) => {
        const [override] = await transaction
          .insert(amaAvailabilityOverrides)
          .values({ localDate })
          .onConflictDoUpdate({
            target: amaAvailabilityOverrides.localDate,
            set: { updatedAt: sql`now()` },
          })
          .returning()

        await transaction
          .delete(amaAvailabilityOverrideWindows)
          .where(eq(amaAvailabilityOverrideWindows.overrideId, override.id))

        if (intervals.length > 0) {
          await transaction.insert(amaAvailabilityOverrideWindows).values(
            intervals.map((interval) => ({
              overrideId: override.id,
              ...interval,
            })),
          )
        }

        return {
          ...override,
          intervals: intervals.map((interval) => ({ ...interval })),
        }
      })
    },

    async deleteOverride(localDate: string) {
      const [deleted] = await database()
        .delete(amaAvailabilityOverrides)
        .where(eq(amaAvailabilityOverrides.localDate, localDate))
        .returning({ id: amaAvailabilityOverrides.id })
      return deleted !== undefined
    },

    async copyWeekday(sourceWeekday: number, targetWeekdays: readonly number[]) {
      const targets = [...new Set(targetWeekdays)].filter(
        (weekday) => weekday !== sourceWeekday,
      )
      if (targets.length === 0) return

      await database().transaction(async (transaction) => {
        const source = await transaction
          .select({
            startMinute: amaAvailabilityWindows.startMinute,
            endMinute: amaAvailabilityWindows.endMinute,
          })
          .from(amaAvailabilityWindows)
          .where(eq(amaAvailabilityWindows.isoWeekday, sourceWeekday))
          .orderBy(
            asc(amaAvailabilityWindows.startMinute),
            asc(amaAvailabilityWindows.endMinute),
            asc(amaAvailabilityWindows.id),
          )

        await transaction
          .delete(amaAvailabilityWindows)
          .where(inArray(amaAvailabilityWindows.isoWeekday, targets))

        if (source.length > 0) {
          await transaction.insert(amaAvailabilityWindows).values(
            targets.flatMap((isoWeekday) =>
              source.map((window) => ({ isoWeekday, ...window })),
            ),
          )
        }
      })
    },

    async replaceWeekday(
      isoWeekday: number,
      intervals: readonly AvailabilityOverrideIntervalInput[],
    ) {
      await database().transaction(async (transaction) => {
        await transaction
          .delete(amaAvailabilityWindows)
          .where(eq(amaAvailabilityWindows.isoWeekday, isoWeekday))
        if (intervals.length > 0) {
          await transaction.insert(amaAvailabilityWindows).values(
            intervals.map((interval) => ({ isoWeekday, ...interval })),
          )
        }
      })
    },

    async create(input: AvailabilityWindowInput) {
      const [created] = await database()
        .insert(amaAvailabilityWindows)
        .values(input)
        .returning()
      return created
    },

    async update(id: number, input: AvailabilityWindowInput) {
      const [updated] = await database()
        .update(amaAvailabilityWindows)
        .set({ ...input, updatedAt: sql`now()` })
        .where(eq(amaAvailabilityWindows.id, id))
        .returning()
      return updated ?? null
    },

    async delete(id: number) {
      const [deleted] = await database()
        .delete(amaAvailabilityWindows)
        .where(eq(amaAvailabilityWindows.id, id))
        .returning({ id: amaAvailabilityWindows.id })
      return deleted !== undefined
    },

    list() {
      return database()
        .select()
        .from(amaAvailabilityWindows)
        .orderBy(
          asc(amaAvailabilityWindows.isoWeekday),
          asc(amaAvailabilityWindows.startMinute),
          asc(amaAvailabilityWindows.endMinute),
          asc(amaAvailabilityWindows.id),
        )
    },
  }
}

export const availabilityRepository = createAvailabilityRepository(getDatabase)

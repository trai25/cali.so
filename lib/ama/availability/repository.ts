import 'server-only'

import { asc, eq, sql } from 'drizzle-orm'

import { getDatabase } from '~/db'
import { amaAvailabilityWindows } from '~/db/schema'

export type AvailabilityDatabase = ReturnType<typeof getDatabase>

export type AvailabilityWindowInput = {
  isoWeekday: number
  startMinute: number
  endMinute: number
}

export function createAvailabilityRepository(database: () => AvailabilityDatabase) {
  return {
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

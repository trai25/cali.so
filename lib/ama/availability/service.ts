import 'server-only'

import { AMA_BOOKING_POLICY } from './policy'
import {
  computeAvailableSlots,
  type AvailabilityWindow,
  type SlotHold,
  type TimeInterval,
} from './engine'

export type AvailabilityWindowRecord = AvailabilityWindow & {
  id: number
  createdAt: Date
  updatedAt: Date
}

export interface AvailabilityRepository {
  list(): Promise<AvailabilityWindowRecord[]>
  create(input: AvailabilityWindow): Promise<AvailabilityWindowRecord>
  update(id: number, input: AvailabilityWindow): Promise<AvailabilityWindowRecord | null>
  delete(id: number): Promise<boolean>
}

export type CalendarAvailabilityStatus =
  | 'connected'
  | 'disconnected'
  | 'denied-scope'
  | 'expired'
  | 'revoked'
  | 'unavailable'

export interface CalendarAvailability {
  queryFreeBusy(input: { timeMin: Date; timeMax: Date }): Promise<{
    status: CalendarAvailabilityStatus
    busy: TimeInterval[]
  }>
}

type AvailabilityServiceDependencies = {
  repository: AvailabilityRepository
  calendar: CalendarAvailability
  ownerTimeZone: string
  clock?: { now(): Date }
}

export class InvalidAvailabilityWindowError extends Error {
  constructor() {
    super('Availability Window must be a same-day interval')
    this.name = 'InvalidAvailabilityWindowError'
  }
}

function assertWindow(input: AvailabilityWindow) {
  if (
    !Number.isInteger(input.isoWeekday) ||
    input.isoWeekday < 1 ||
    input.isoWeekday > 7 ||
    !Number.isInteger(input.startMinute) ||
    input.startMinute < 0 ||
    input.startMinute > 1439 ||
    !Number.isInteger(input.endMinute) ||
    input.endMinute < 1 ||
    input.endMinute > 1440 ||
    input.startMinute >= input.endMinute
  ) {
    throw new InvalidAvailabilityWindowError()
  }
}

export function createAvailabilityService(dependencies: AvailabilityServiceDependencies) {
  const {
    repository,
    calendar,
    ownerTimeZone,
    clock = { now: () => new Date() },
  } = dependencies

  return {
    list() {
      return repository.list()
    },

    create(input: AvailabilityWindow) {
      assertWindow(input)
      return repository.create(input)
    },

    update(id: number, input: AvailabilityWindow) {
      assertWindow(input)
      return repository.update(id, input)
    },

    delete(id: number) {
      return repository.delete(id)
    },

    async preview(input: {
      slotHolds?: readonly SlotHold[]
      bookings?: readonly TimeInterval[]
    } = {}) {
      const now = clock.now()
      const calendarResult = await calendar.queryFreeBusy({
        timeMin: new Date(
          now.getTime() +
            (AMA_BOOKING_POLICY.minimumNoticeMinutes -
              AMA_BOOKING_POLICY.bufferBeforeMinutes) *
              60_000,
        ),
        timeMax: new Date(
          now.getTime() +
            (AMA_BOOKING_POLICY.horizonDays * 24 * 60 +
              AMA_BOOKING_POLICY.sessionMinutes +
              AMA_BOOKING_POLICY.bufferAfterMinutes) *
              60_000,
        ),
      })
      if (calendarResult.status !== 'connected') {
        return { status: calendarResult.status, slots: [] }
      }

      const windows = await repository.list()
      return {
        status: 'connected' as const,
        slots: computeAvailableSlots({
          now,
          ownerTimeZone,
          windows,
          googleBusy: calendarResult.busy,
          slotHolds: input.slotHolds ?? [],
          bookings: input.bookings ?? [],
        }),
      }
    },
  }
}

export type AvailabilityService = ReturnType<typeof createAvailabilityService>

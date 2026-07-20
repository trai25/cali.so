import 'server-only'

import { AMA_BOOKING_POLICY } from './policy'
import {
  computeAvailableSlots,
  type AvailabilityOverride,
  type AvailabilityWeekday,
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
  getTimeZone(): Promise<string>
  setTimeZone(timeZone: string): Promise<string>
  list(): Promise<AvailabilityWindowRecord[]>
  listWeekdayStates(): Promise<AvailabilityWeekday[]>
  listOverrides(): Promise<AvailabilityOverrideRecord[]>
  create(input: AvailabilityWindow): Promise<AvailabilityWindowRecord>
  update(id: number, input: AvailabilityWindow): Promise<AvailabilityWindowRecord | null>
  delete(id: number): Promise<boolean>
  saveOverride(
    localDate: string,
    intervals: AvailabilityOverride['intervals'],
  ): Promise<AvailabilityOverrideRecord>
  deleteOverride(localDate: string): Promise<boolean>
  replaceWeekday(
    isoWeekday: number,
    intervals: AvailabilityOverride['intervals'],
  ): Promise<void>
  setWeekdayEnabled(
    isoWeekday: number,
    enabled: boolean,
    defaultIntervals: AvailabilityOverride['intervals'],
  ): Promise<AvailabilityWeekday>
  copyWeekday(sourceWeekday: number, targetWeekdays: readonly number[]): Promise<void>
}

export type AvailabilityOverrideRecord = AvailabilityOverride & {
  id: number
  createdAt: Date
  updatedAt: Date
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

export type AvailabilityPreviewDiagnosis =
  | 'open'
  | 'calendar-unavailable'
  | 'no-configured-hours'
  | 'no-policy-eligible-hours'
  | 'calendar-conflicts'
  | 'holds-or-bookings'

type AvailabilityServiceDependencies = {
  repository: AvailabilityRepository
  calendar: CalendarAvailability
  clock?: { now(): Date }
}

export class InvalidAvailabilityWindowError extends Error {
  constructor() {
    super('Availability Window must be a same-day interval')
    this.name = 'InvalidAvailabilityWindowError'
  }
}

export class InvalidAvailabilityTimeZoneError extends Error {
  constructor() {
    super('Schedule time zone must be a valid IANA time zone')
    this.name = 'InvalidAvailabilityTimeZoneError'
  }
}

export class InvalidAvailabilityOverrideError extends Error {
  constructor() {
    super('Date override must have a valid date and same-day intervals')
    this.name = 'InvalidAvailabilityOverrideError'
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

function assertWeekday(isoWeekday: number) {
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new InvalidAvailabilityWindowError()
  }
}

function normalizeTimeZone(value: string) {
  const timeZone = value.trim()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
  } catch {
    throw new InvalidAvailabilityTimeZoneError()
  }
  if (timeZone.length === 0 || timeZone.length > 64) {
    throw new InvalidAvailabilityTimeZoneError()
  }
  return timeZone
}

function normalizeLocalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidAvailabilityOverrideError()
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new InvalidAvailabilityOverrideError()
  }
  return value
}

function assertIntervals(intervals: AvailabilityOverride['intervals']) {
  try {
    for (const interval of intervals) {
      assertWindow({ ...interval, isoWeekday: 1 })
    }
  } catch {
    throw new InvalidAvailabilityOverrideError()
  }
}

export function createAvailabilityService(dependencies: AvailabilityServiceDependencies) {
  const {
    repository,
    calendar,
    clock = { now: () => new Date() },
  } = dependencies

  return {
    list() {
      return repository.list()
    },

    async getSchedule() {
      const [timeZone, weekdays, windows, overrides] = await Promise.all([
        repository.getTimeZone(),
        repository.listWeekdayStates(),
        repository.list(),
        repository.listOverrides(),
      ])
      return { timeZone, weekdays, windows, overrides }
    },

    setTimeZone(timeZone: string) {
      return repository.setTimeZone(normalizeTimeZone(timeZone))
    },

    async setWeekday(isoWeekday: number, enabled: boolean) {
      assertWeekday(isoWeekday)
      await repository.setWeekdayEnabled(
        isoWeekday,
        enabled,
        enabled ? [{ startMinute: 9 * 60, endMinute: 12 * 60 }] : [],
      )
    },

    copyWeekday(sourceWeekday: number, targetWeekdays: readonly number[]) {
      assertWeekday(sourceWeekday)
      const targets = [...new Set(targetWeekdays)]
      for (const target of targets) assertWeekday(target)
      if (targets.length === 0) throw new InvalidAvailabilityWindowError()
      return repository.copyWeekday(sourceWeekday, targets)
    },

    saveOverride(
      localDate: string,
      intervals: AvailabilityOverride['intervals'],
    ) {
      const normalizedDate = normalizeLocalDate(localDate)
      assertIntervals(intervals)
      return repository.saveOverride(normalizedDate, intervals)
    },

    deleteOverride(localDate: string) {
      return repository.deleteOverride(normalizeLocalDate(localDate))
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
      const [calendarResult, [ownerTimeZone, weekdays, windows, overrides]] =
        await Promise.all([
          calendar.queryFreeBusy({
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
          }),
          Promise.all([
            repository.getTimeZone(),
            repository.listWeekdayStates(),
            repository.list(),
            repository.listOverrides(),
          ]),
        ])
      const common = {
        now,
        ownerTimeZone,
        weekdays,
        windows,
        overrides,
      }
      const hasConfiguredHours =
        windows.some(
          (window) =>
            weekdays.find(
              (weekday) => weekday.isoWeekday === window.isoWeekday,
            )?.enabled !== false,
        ) || overrides.some((override) => override.intervals.length > 0)
      if (!hasConfiguredHours) {
        return {
          status: calendarResult.status,
          diagnosis: 'no-configured-hours' as const,
          slots: [],
        }
      }

      const policyEligible = computeAvailableSlots({
        ...common,
        googleBusy: [],
        slotHolds: [],
        bookings: [],
      })
      if (policyEligible.length === 0) {
        return {
          status: calendarResult.status,
          diagnosis: 'no-policy-eligible-hours' as const,
          slots: [],
        }
      }

      if (calendarResult.status !== 'connected') {
        return {
          status: calendarResult.status,
          diagnosis: 'calendar-unavailable' as const,
          slots: [],
        }
      }

      const afterCalendar = computeAvailableSlots({
        ...common,
        googleBusy: calendarResult.busy,
        slotHolds: [],
        bookings: [],
      })
      if (afterCalendar.length === 0) {
        return {
          status: 'connected' as const,
          diagnosis: 'calendar-conflicts' as const,
          slots: [],
        }
      }

      const slots = computeAvailableSlots({
        ...common,
        googleBusy: calendarResult.busy,
        slotHolds: input.slotHolds ?? [],
        bookings: input.bookings ?? [],
      })
      return {
        status: 'connected' as const,
        diagnosis:
          slots.length > 0
            ? ('open' as const)
            : ('holds-or-bookings' as const),
        slots,
      }
    },
  }
}

export type AvailabilityService = ReturnType<typeof createAvailabilityService>

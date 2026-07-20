import { Temporal } from '@js-temporal/polyfill'

import { AMA_BOOKING_POLICY } from './policy'

export type AvailabilityWindow = {
  /** ISO weekday: Monday is 1 and Sunday is 7. */
  isoWeekday: number
  /** Inclusive local wall-clock minute from midnight. */
  startMinute: number
  /** Exclusive local wall-clock minute from midnight; 1440 means midnight. */
  endMinute: number
}

export type TimeInterval = {
  startsAt: Date
  endsAt: Date
}

export type SlotHold = TimeInterval & {
  expiresAt: Date
}

export type AvailabilityInput = {
  now: Date
  ownerTimeZone: string
  windows: readonly AvailabilityWindow[]
  googleBusy: readonly TimeInterval[]
  slotHolds: readonly SlotHold[]
  bookings: readonly TimeInterval[]
}

export type AvailableSlot = TimeInterval

const millisecondsPerMinute = 60_000

function instant(date: Date) {
  if (Number.isNaN(date.getTime())) throw new RangeError('Availability dates must be valid')
  return Temporal.Instant.fromEpochMilliseconds(date.getTime())
}

function plainDateTimeAt(date: Temporal.PlainDate, minute: number) {
  if (!Number.isInteger(minute) || minute < 0 || minute > 24 * 60) {
    throw new RangeError(
      'Availability window minutes must be integers from 0 through 1440',
    )
  }
  if (minute === 24 * 60) return date.add({ days: 1 }).toPlainDateTime('00:00')
  return date.toPlainDateTime({
    hour: Math.floor(minute / 60),
    minute: minute % 60,
  })
}

function possibleStartInstants(plain: Temporal.PlainDateTime, timeZone: string) {
  const earlier = plain.toZonedDateTime(timeZone, { disambiguation: 'earlier' })
  const later = plain.toZonedDateTime(timeZone, { disambiguation: 'later' })
  const candidates = [earlier, later].filter((value) =>
    value.toPlainDateTime().equals(plain),
  )

  const unique = new Map<string, Temporal.Instant>()
  for (const candidate of candidates) {
    const candidateInstant = candidate.toInstant()
    unique.set(candidateInstant.toString(), candidateInstant)
  }
  return [...unique.values()].sort(Temporal.Instant.compare)
}

function windowBoundary(
  plain: Temporal.PlainDateTime,
  timeZone: string,
  edge: 'start' | 'end',
) {
  const earlier = plain.toZonedDateTime(timeZone, { disambiguation: 'earlier' })
  const later = plain.toZonedDateTime(timeZone, { disambiguation: 'later' })
  const earlierMatches = earlier.toPlainDateTime().equals(plain)
  const laterMatches = later.toPlainDateTime().equals(plain)

  if (earlierMatches && laterMatches) {
    return edge === 'start' ? earlier.toInstant() : later.toInstant()
  }

  // A boundary inside a spring-forward gap has no real instant. The start
  // advances beyond the gap while the end stops before it.
  return edge === 'start' ? later.toInstant() : earlier.toInstant()
}

function assertWindow(window: AvailabilityWindow) {
  if (
    !Number.isInteger(window.isoWeekday) ||
    window.isoWeekday < 1 ||
    window.isoWeekday > 7
  ) {
    throw new RangeError(
      'Availability window weekday must be an ISO weekday from 1 through 7',
    )
  }
  plainDateTimeAt(Temporal.PlainDate.from('2000-01-03'), window.startMinute)
  plainDateTimeAt(Temporal.PlainDate.from('2000-01-03'), window.endMinute)
  if (window.startMinute >= window.endMinute) {
    throw new RangeError('Availability window start must be before its end')
  }
}

function intervalMilliseconds(interval: TimeInterval) {
  const startsAt = interval.startsAt.getTime()
  const endsAt = interval.endsAt.getTime()
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    throw new RangeError('Blocking intervals must have valid ascending dates')
  }
  return { startsAt, endsAt }
}

function overlapsHalfOpen(
  candidateStart: number,
  candidateEnd: number,
  blocker: { startsAt: number; endsAt: number },
) {
  return candidateStart < blocker.endsAt && blocker.startsAt < candidateEnd
}

export function computeAvailableSlots(input: AvailabilityInput): AvailableSlot[] {
  const now = instant(input.now)
  // Resolving the instant in the supplied zone validates the IANA identifier.
  const ownerNow = now.toZonedDateTimeISO(input.ownerTimeZone)
  const minimumStart = now.add({ minutes: AMA_BOOKING_POLICY.minimumNoticeMinutes })
  const horizon = now.add({ hours: AMA_BOOKING_POLICY.horizonDays * 24 })
  const lastOwnerDate = horizon.toZonedDateTimeISO(input.ownerTimeZone).toPlainDate()

  for (const window of input.windows) assertWindow(window)

  const activeHolds = input.slotHolds
    .filter((hold) => hold.expiresAt.getTime() > input.now.getTime())
    .map(intervalMilliseconds)
  const blockers = [
    ...input.googleBusy.map(intervalMilliseconds),
    ...activeHolds,
    ...input.bookings.map(intervalMilliseconds),
  ]

  const slots = new Map<number, AvailableSlot>()
  let ownerDate = ownerNow.toPlainDate()
  while (Temporal.PlainDate.compare(ownerDate, lastOwnerDate) <= 0) {
    for (const window of input.windows) {
      if (window.isoWeekday !== ownerDate.dayOfWeek) continue

      const windowStart = windowBoundary(
        plainDateTimeAt(ownerDate, window.startMinute),
        input.ownerTimeZone,
        'start',
      )
      const windowEnd = windowBoundary(
        plainDateTimeAt(ownerDate, window.endMinute),
        input.ownerTimeZone,
        'end',
      )
      if (Temporal.Instant.compare(windowStart, windowEnd) >= 0) continue

      for (
        let candidateMinute = window.startMinute;
        candidateMinute < window.endMinute;
        candidateMinute += AMA_BOOKING_POLICY.startCadenceMinutes
      ) {
        const localCandidate = plainDateTimeAt(ownerDate, candidateMinute)
        for (const startsAt of possibleStartInstants(localCandidate, input.ownerTimeZone)) {
          const endsAt = startsAt.add({ minutes: AMA_BOOKING_POLICY.sessionMinutes })
          if (Temporal.Instant.compare(startsAt, windowStart) < 0) continue
          if (Temporal.Instant.compare(endsAt, windowEnd) > 0) continue
          if (Temporal.Instant.compare(startsAt, minimumStart) < 0) continue
          if (Temporal.Instant.compare(startsAt, horizon) >= 0) continue

          const startsAtMs = startsAt.epochMilliseconds
          const endsAtMs = endsAt.epochMilliseconds
          const bufferedStart =
            startsAtMs - AMA_BOOKING_POLICY.bufferBeforeMinutes * millisecondsPerMinute
          const bufferedEnd =
            endsAtMs + AMA_BOOKING_POLICY.bufferAfterMinutes * millisecondsPerMinute
          if (
            blockers.some((blocker) =>
              overlapsHalfOpen(bufferedStart, bufferedEnd, blocker),
            )
          ) {
            continue
          }

          slots.set(startsAtMs, {
            startsAt: new Date(startsAtMs),
            endsAt: new Date(endsAtMs),
          })
        }
      }
    }
    ownerDate = ownerDate.add({ days: 1 })
  }

  return [...slots.values()].sort(
    (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
  )
}

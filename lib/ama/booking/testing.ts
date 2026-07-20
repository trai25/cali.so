/**
 * In-memory fakes for AMA booking unit tests. Test-only module: nothing at
 * runtime may import it. Each fake mirrors the SQL semantics of its real
 * repository — exclusion constraints, compare-and-set updates, and
 * exactly-once inserts — so service tests exercise the same contracts.
 */

import { AMA_BOOKING_POLICY } from '../availability/policy'
import type {
  DurableOperationKind,
  DurableOperationRecord,
  DurableOperationsRepository,
} from '../operations/repository'
import type { ClaimReleaseReason, SlotClaimRecord, SlotClaimsRepository } from './claims'
import type {
  AlternateTimeRequestRecord,
  BookingEventRecord,
  BookingIntentRecord,
  BookingRecord,
  BookingRepository,
} from './repository'

const MS_PER_MINUTE = 60_000

type MutableClaim = SlotClaimRecord & { createdAt: Date; updatedAt: Date }

function blockedInterval(startsAt: Date, endsAt: Date) {
  return {
    start: startsAt.getTime() - AMA_BOOKING_POLICY.bufferBeforeMinutes * MS_PER_MINUTE,
    end: endsAt.getTime() + AMA_BOOKING_POLICY.bufferAfterMinutes * MS_PER_MINUTE,
  }
}

function blockedOverlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  const left = blockedInterval(a.startsAt, a.endsAt)
  const right = blockedInterval(b.startsAt, b.endsAt)
  // Half-open [start, end) ranges, like the tstzrange '[)' exclusion index.
  return left.start < right.end && right.start < left.end
}

function copyClaim(claim: MutableClaim): SlotClaimRecord {
  return {
    id: claim.id,
    kind: claim.kind,
    status: claim.status,
    startsAt: claim.startsAt,
    endsAt: claim.endsAt,
    expiresAt: claim.expiresAt,
    releasedAt: claim.releasedAt,
    releaseReason: claim.releaseReason,
  }
}

export function createFakeClaimsRepository() {
  const rows: MutableClaim[] = []
  let sequence = 0

  function releaseExpiredHoldsOverlapping(startsAt: Date, endsAt: Date, now: Date) {
    for (const row of rows) {
      if (
        row.kind === 'hold' &&
        row.status === 'active' &&
        row.expiresAt !== null &&
        row.expiresAt.getTime() <= now.getTime() &&
        blockedOverlaps(row, { startsAt, endsAt })
      ) {
        row.status = 'released'
        row.releasedAt = now
        row.releaseReason = 'expired'
        row.updatedAt = now
      }
    }
  }

  function insertClaim(input: {
    kind: 'hold' | 'booking'
    startsAt: Date
    endsAt: Date
    expiresAt: Date | null
    now: Date
  }): SlotClaimRecord | null {
    // The database exclusion constraint: at most one active claim may cover
    // any part of the buffered interval.
    const conflict = rows.some(
      (row) => row.status === 'active' && blockedOverlaps(row, input),
    )
    if (conflict) return null
    const created: MutableClaim = {
      id: `claim-${++sequence}`,
      kind: input.kind,
      status: 'active',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      expiresAt: input.expiresAt,
      releasedAt: null,
      releaseReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    }
    rows.push(created)
    return copyClaim(created)
  }

  const repository: SlotClaimsRepository = {
    async createHold(input) {
      releaseExpiredHoldsOverlapping(input.startsAt, input.endsAt, input.now)
      return insertClaim({
        kind: 'hold',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        expiresAt: input.expiresAt,
        now: input.now,
      })
    },

    async createBookingClaim(input) {
      releaseExpiredHoldsOverlapping(input.startsAt, input.endsAt, input.now)
      return insertClaim({
        kind: 'booking',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        expiresAt: null,
        now: input.now,
      })
    },

    async convertHoldToBooking(holdClaimId, now) {
      const row = rows.find(
        (candidate) =>
          candidate.id === holdClaimId &&
          candidate.kind === 'hold' &&
          candidate.status === 'active' &&
          candidate.expiresAt !== null &&
          candidate.expiresAt.getTime() > now.getTime(),
      )
      if (!row) return null
      row.kind = 'booking'
      row.expiresAt = null
      row.updatedAt = now
      return copyClaim(row)
    },

    async release(claimId, reason: ClaimReleaseReason, now) {
      const row = rows.find(
        (candidate) => candidate.id === claimId && candidate.status === 'active',
      )
      if (!row) return null
      row.status = 'released'
      row.releasedAt = now
      row.releaseReason = reason
      row.updatedAt = now
      return copyClaim(row)
    },

    async releaseExpiredHolds(now) {
      let released = 0
      for (const row of rows) {
        if (
          row.kind === 'hold' &&
          row.status === 'active' &&
          row.expiresAt !== null &&
          row.expiresAt.getTime() <= now.getTime()
        ) {
          row.status = 'released'
          row.releasedAt = now
          row.releaseReason = 'expired'
          row.updatedAt = now
          released += 1
        }
      }
      return released
    },

    async get(claimId) {
      const row = rows.find((candidate) => candidate.id === claimId)
      return row ? copyClaim(row) : null
    },

    async listBlocking(now) {
      return rows
        .filter((row) => row.status === 'active' && row.endsAt.getTime() > now.getTime())
        .map(copyClaim)
    },
  }

  return { repository, rows }
}

type ProviderEventRow = {
  provider: string
  eventId: string
  eventType: string
  receivedAt: Date
  processedAt: Date | null
  outcome: string | null
}

function copyBooking(booking: BookingRecord): BookingRecord {
  return { ...booking, topics: [...booking.topics] }
}

export function createFakeBookingRepository() {
  const intents: BookingIntentRecord[] = []
  const bookings: BookingRecord[] = []
  const events: BookingEventRecord[] = []
  const providerEvents: ProviderEventRow[] = []
  const alternateTimeRequests: AlternateTimeRequestRecord[] = []
  let sequence = 0

  function getBooking(bookingId: string) {
    return bookings.find((booking) => booking.id === bookingId) ?? null
  }

  const repository: BookingRepository = {
    async createIntent(input) {
      const created: BookingIntentRecord = {
        id: `intent-${++sequence}`,
        holdClaimId: input.holdClaimId,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        locale: input.locale,
        guestTimeZone: input.guestTimeZone,
        topics: [...input.topics],
        briefText: input.briefText,
        briefUrls: [...input.briefUrls],
        meetingProvider: input.meetingProvider,
        stripeCheckoutSessionId: null,
        createdAt: input.now,
      }
      intents.push(created)
      return { ...created }
    },

    async getIntent(intentId) {
      const intent = intents.find((candidate) => candidate.id === intentId)
      return intent ? { ...intent } : null
    },

    async getIntentByHoldClaim(holdClaimId) {
      const intent = intents.find((candidate) => candidate.holdClaimId === holdClaimId)
      return intent ? { ...intent } : null
    },

    async getIntentByCheckoutSession(sessionId) {
      const intent = intents.find(
        (candidate) => candidate.stripeCheckoutSessionId === sessionId,
      )
      return intent ? { ...intent } : null
    },

    async attachCheckoutSession(intentId, sessionId, _now) {
      const intent = intents.find((candidate) => candidate.id === intentId)
      // Unique index on the session id: an attach that would duplicate an
      // existing attachment falls through to re-reading the intent.
      const alreadyOwned = intents.some(
        (candidate) =>
          candidate.id !== intentId &&
          candidate.stripeCheckoutSessionId === sessionId,
      )
      if (intent && intent.stripeCheckoutSessionId === null && !alreadyOwned) {
        intent.stripeCheckoutSessionId = sessionId
        return { ...intent }
      }
      return this.getIntent(intentId)
    },

    async createBooking(input) {
      const existing = bookings.find(
        (booking) =>
          booking.stripeCheckoutSessionId === input.stripeCheckoutSessionId,
      )
      if (existing) return { booking: copyBooking(existing), created: false }
      const created: BookingRecord = {
        id: `booking-${++sequence}`,
        intentId: input.intent.id,
        claimId: input.claimId,
        status: input.status,
        guestName: input.intent.guestName,
        guestEmail: input.intent.guestEmail,
        locale: input.intent.locale,
        guestTimeZone: input.intent.guestTimeZone,
        topics: [...input.intent.topics],
        briefText: input.intent.briefText,
        briefUrls: [...input.intent.briefUrls],
        briefPurgedAt: null,
        meetingProvider: input.intent.meetingProvider,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        amountTotal: input.amountTotal,
        currency: input.currency,
        refundStatus: 'none',
        stripeRefundId: null,
        refundedAt: null,
        refundReason: null,
        cancelledAt: null,
        cancelledBy: null,
        meetingUrl: null,
        googleCalendarEventId: null,
        tencentMeetingId: null,
        meetingCreatedAt: null,
        manageTokenHash: null,
        manageTokenRevokedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      }
      bookings.push(created)
      return { booking: copyBooking(created), created: true }
    },

    async getBooking(bookingId) {
      const booking = getBooking(bookingId)
      return booking ? copyBooking(booking) : null
    },

    async getBookingByCheckoutSession(sessionId) {
      const booking = bookings.find(
        (candidate) => candidate.stripeCheckoutSessionId === sessionId,
      )
      return booking ? copyBooking(booking) : null
    },

    async getBookingByManageTokenHash(tokenHash) {
      const booking = bookings.find(
        (candidate) =>
          candidate.manageTokenHash === tokenHash &&
          candidate.manageTokenRevokedAt === null,
      )
      return booking ? copyBooking(booking) : null
    },

    async setManageTokenHash(bookingId, tokenHash, now) {
      const booking = getBooking(bookingId)
      if (!booking || booking.manageTokenHash !== null) return null
      booking.manageTokenHash = tokenHash
      booking.updatedAt = now
      return copyBooking(booking)
    },

    async setMeetingArtifacts(input) {
      const booking = getBooking(input.bookingId)
      if (!booking || booking.meetingUrl !== null) return null
      booking.meetingUrl = input.meetingUrl
      booking.googleCalendarEventId = input.googleCalendarEventId
      booking.tencentMeetingId = input.tencentMeetingId
      booking.meetingCreatedAt = input.now
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async replaceMeetingArtifacts(input) {
      const booking = getBooking(input.bookingId)
      if (!booking) return null
      booking.meetingUrl = input.meetingUrl
      booking.googleCalendarEventId = input.googleCalendarEventId
      booking.tencentMeetingId = input.tencentMeetingId
      booking.meetingCreatedAt = input.meetingUrl === null ? null : input.now
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async transitionStatus(input) {
      const booking = getBooking(input.bookingId)
      if (!booking || !input.from.includes(booking.status)) return null
      booking.status = input.to
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async rescheduleBooking(input) {
      const booking = getBooking(input.bookingId)
      if (
        !booking ||
        booking.startsAt.getTime() !== input.expectedStartsAt.getTime() ||
        !['finalizing', 'confirmed', 'needs_reschedule'].includes(booking.status)
      ) {
        return null
      }
      booking.claimId = input.claimId
      booking.startsAt = input.startsAt
      booking.endsAt = input.endsAt
      booking.status = 'finalizing'
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async cancelBooking(input) {
      const booking = getBooking(input.bookingId)
      if (
        !booking ||
        !['finalizing', 'confirmed', 'needs_reschedule'].includes(booking.status)
      ) {
        return null
      }
      booking.status = 'cancelled'
      booking.cancelledAt = input.now
      booking.cancelledBy = input.cancelledBy
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async beginRefund(input) {
      const booking = getBooking(input.bookingId)
      if (!booking || !['none', 'failed'].includes(booking.refundStatus)) return null
      booking.refundStatus = 'pending'
      booking.refundReason = input.reason
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async completeRefund(input) {
      const booking = getBooking(input.bookingId)
      if (!booking || booking.refundStatus !== 'pending') return null
      booking.refundStatus = 'refunded'
      booking.stripeRefundId = input.stripeRefundId
      booking.refundedAt = input.now
      booking.updatedAt = input.now
      return copyBooking(booking)
    },

    async failRefund(bookingId, now) {
      const booking = getBooking(bookingId)
      if (!booking || booking.refundStatus !== 'pending') return null
      booking.refundStatus = 'failed'
      booking.updatedAt = now
      return copyBooking(booking)
    },

    async purgeBrief(bookingId, now) {
      const booking = getBooking(bookingId)
      if (!booking || booking.briefPurgedAt !== null) return null
      booking.briefText = null
      booking.briefUrls = null
      booking.briefPurgedAt = now
      booking.updatedAt = now
      return copyBooking(booking)
    },

    async searchBookings(input) {
      const query = (input.filters.guestName ?? '').trim().toLocaleLowerCase()
      const email = (input.filters.guestEmail ?? '').trim().toLocaleLowerCase()
      const bookingId = (input.filters.bookingId ?? '').trim().toLocaleLowerCase()
      const matches = bookings
        .filter((booking) => {
          const inView =
            input.view === 'attention'
              ? booking.status === 'finalizing' ||
                booking.status === 'needs_reschedule' ||
                booking.refundStatus === 'failed'
              : input.view === 'upcoming'
                ? booking.endsAt.getTime() >= input.now.getTime() &&
                  booking.status !== 'cancelled'
                : input.view === 'past'
                  ? booking.endsAt.getTime() < input.now.getTime() &&
                    booking.status !== 'cancelled'
                  : booking.status === 'cancelled'
          return (
            inView &&
            (!query || booking.guestName.toLocaleLowerCase().includes(query)) &&
            (!email || booking.guestEmail.toLocaleLowerCase().includes(email)) &&
            (!bookingId || booking.id.toLocaleLowerCase().includes(bookingId)) &&
            (!input.filters.status || booking.status === input.filters.status) &&
            (!input.filters.startsFrom ||
              booking.startsAt.getTime() >= input.filters.startsFrom.getTime()) &&
            (!input.filters.startsBefore ||
              booking.startsAt.getTime() < input.filters.startsBefore.getTime())
          )
        })
        .sort((left, right) => {
          const difference = left.startsAt.getTime() - right.startsAt.getTime()
          return input.view === 'upcoming' || input.view === 'attention'
            ? difference
            : -difference
        })
      const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize)))
      const page = Math.min(
        Math.max(1, Math.floor(input.page)),
        Math.max(1, Math.ceil(matches.length / pageSize)),
      )
      return {
        items: matches
          .slice((page - 1) * pageSize, page * pageSize)
          .map(copyBooking),
        total: matches.length,
        page,
        pageSize,
      }
    },

    async listBookings(input) {
      const limit = input.limit ?? 100
      if (input.view === 'attention') {
        return bookings
          .filter(
            (booking) =>
              booking.status === 'finalizing' ||
              booking.status === 'needs_reschedule' ||
              booking.refundStatus === 'failed',
          )
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          .slice(0, limit)
          .map(copyBooking)
      }
      if (input.view === 'upcoming') {
        return bookings
          .filter(
            (booking) =>
              booking.endsAt.getTime() >= input.now.getTime() &&
              booking.status !== 'cancelled',
          )
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          .slice(0, limit)
          .map(copyBooking)
      }
      return bookings
        .filter(
          (booking) =>
            booking.endsAt.getTime() < input.now.getTime() &&
            booking.status !== 'cancelled',
        )
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
        .slice(0, limit)
        .map(copyBooking)
    },

    async appendEvent(input) {
      events.push({
        id: `event-${++sequence}`,
        bookingId: input.bookingId,
        event: input.event,
        actor: input.actor,
        occurredAt: input.occurredAt,
        detail: input.detail ?? {},
      })
    },

    async listEvents(bookingId) {
      return events
        .filter((event) => event.bookingId === bookingId)
        .sort(
          (a, b) =>
            a.occurredAt.getTime() - b.occurredAt.getTime() ||
            a.id.localeCompare(b.id, 'en', { numeric: true }),
        )
        .map((event) => ({ ...event }))
    },

    async recordProviderEvent(input) {
      const exists = providerEvents.some(
        (event) => event.provider === input.provider && event.eventId === input.eventId,
      )
      if (exists) return false
      providerEvents.push({
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        receivedAt: input.receivedAt,
        processedAt: null,
        outcome: null,
      })
      return true
    },

    async markProviderEventProcessed(input) {
      const event = providerEvents.find(
        (candidate) =>
          candidate.provider === input.provider && candidate.eventId === input.eventId,
      )
      if (event) {
        event.processedAt = input.processedAt
        event.outcome = input.outcome
      }
    },

    async getProviderEvent(provider, eventId) {
      const event = providerEvents.find(
        (candidate) => candidate.provider === provider && candidate.eventId === eventId,
      )
      return event ? { ...event } : null
    },

    async createAlternateTimeRequest(input) {
      const created: AlternateTimeRequestRecord = {
        id: `alternate-${++sequence}`,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        locale: input.locale,
        guestTimeZone: input.guestTimeZone,
        preferredWindows: input.preferredWindows,
        note: input.note,
        status: 'new',
        createdAt: input.now,
        resolvedAt: null,
      }
      alternateTimeRequests.push(created)
      return { ...created }
    },

    async listAlternateTimeRequests(status) {
      return alternateTimeRequests
        .filter((request) => (status ? request.status === status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((request) => ({ ...request }))
    },

    async resolveAlternateTimeRequest(requestId, status, now) {
      const request = alternateTimeRequests.find(
        (candidate) => candidate.id === requestId && candidate.status === 'new',
      )
      if (!request) return null
      request.status = status
      request.resolvedAt = now
      return { ...request }
    },
  }

  return {
    repository,
    intents,
    bookings,
    events,
    providerEvents,
    alternateTimeRequests,
  }
}

function copyOperation(operation: DurableOperationRecord): DurableOperationRecord {
  return { ...operation, payload: { ...operation.payload } }
}

export function createFakeOperationsRepository() {
  const rows: DurableOperationRecord[] = []
  let sequence = 0

  function get(operationId: string) {
    return rows.find((row) => row.id === operationId) ?? null
  }

  const repository: DurableOperationsRepository = {
    async enqueue(input) {
      const existing = rows.find((row) => row.dedupeKey === input.dedupeKey)
      if (existing) return { operation: copyOperation(existing), created: false }
      const created: DurableOperationRecord = {
        id: `operation-${++sequence}`,
        kind: input.kind,
        dedupeKey: input.dedupeKey,
        bookingId: input.bookingId ?? null,
        payload: input.payload ?? {},
        status: 'pending',
        attemptCount: 0,
        maxAttempts: input.maxAttempts ?? 8,
        nextAttemptAt: input.nextAttemptAt,
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        completedAt: null,
        createdAt: input.now,
        updatedAt: input.now,
      }
      rows.push(created)
      return { operation: copyOperation(created), created: true }
    },

    async claimDue(input) {
      const leaseToken = `lease-${++sequence}`
      const leaseExpiresAt = new Date(input.now.getTime() + input.leaseSeconds * 1000)
      const due = rows
        .filter(
          (row) =>
            (row.status === 'pending' &&
              row.nextAttemptAt.getTime() <= input.now.getTime()) ||
            (row.status === 'running' &&
              row.leaseExpiresAt !== null &&
              row.leaseExpiresAt.getTime() <= input.now.getTime()),
        )
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, input.limit)
      for (const row of due) {
        row.status = 'running'
        row.leaseToken = leaseToken
        row.leaseExpiresAt = leaseExpiresAt
        row.attemptCount += 1
        row.updatedAt = input.now
      }
      return due.map(copyOperation)
    },

    async complete(operationId, leaseToken, now) {
      const row = rows.find(
        (candidate) =>
          candidate.id === operationId &&
          candidate.leaseToken === leaseToken &&
          candidate.status === 'running',
      )
      if (!row) return null
      row.status = 'succeeded'
      row.leaseToken = null
      row.leaseExpiresAt = null
      row.lastErrorCode = null
      row.completedAt = now
      row.updatedAt = now
      return copyOperation(row)
    },

    async fail(input) {
      const row = rows.find(
        (candidate) =>
          candidate.id === input.operationId &&
          candidate.leaseToken === input.leaseToken &&
          candidate.status === 'running',
      )
      if (!row) return null
      const exhausted = input.terminal === true || row.attemptCount >= row.maxAttempts
      if (exhausted) {
        row.status = 'failed'
        row.completedAt = input.now
      } else {
        row.status = 'pending'
        row.nextAttemptAt = input.retryAt
      }
      row.leaseToken = null
      row.leaseExpiresAt = null
      row.lastErrorCode = input.errorCode
      row.updatedAt = input.now
      return copyOperation(row)
    },

    async cancelPendingForBooking(input) {
      let cancelled = 0
      for (const row of rows) {
        if (
          row.bookingId === input.bookingId &&
          input.kinds.includes(row.kind as DurableOperationKind) &&
          row.status === 'pending'
        ) {
          row.status = 'cancelled'
          row.leaseToken = null
          row.leaseExpiresAt = null
          row.completedAt = input.now
          row.updatedAt = input.now
          cancelled += 1
        }
      }
      return cancelled
    },

    async retry(operationId, now) {
      const row = rows.find(
        (candidate) => candidate.id === operationId && candidate.status === 'failed',
      )
      if (!row) return null
      row.status = 'pending'
      row.attemptCount = 0
      row.nextAttemptAt = now
      row.leaseToken = null
      row.leaseExpiresAt = null
      row.completedAt = null
      row.updatedAt = now
      return copyOperation(row)
    },

    async resolve(operationId, now) {
      const row = rows.find(
        (candidate) =>
          candidate.id === operationId &&
          ['pending', 'running', 'failed'].includes(candidate.status),
      )
      if (!row) return null
      row.status = 'resolved'
      row.leaseToken = null
      row.leaseExpiresAt = null
      row.completedAt = now
      row.updatedAt = now
      return copyOperation(row)
    },

    async get(operationId) {
      const row = get(operationId)
      return row ? copyOperation(row) : null
    },

    async getByDedupeKey(dedupeKey) {
      const row = rows.find((candidate) => candidate.dedupeKey === dedupeKey)
      return row ? copyOperation(row) : null
    },

    async listUnresolved(limit = 100) {
      return rows
        .filter((row) => ['pending', 'running', 'failed'].includes(row.status))
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, limit)
        .map(copyOperation)
    },

    async listForBooking(bookingId) {
      return rows
        .filter((row) => row.bookingId === bookingId)
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            b.id.localeCompare(a.id, 'en', { numeric: true }),
        )
        .map(copyOperation)
    },

    async countByStatus() {
      const counts: Record<string, number> = {}
      for (const row of rows) {
        counts[row.status] = (counts[row.status] ?? 0) + 1
      }
      return counts
    },
  }

  return { repository, rows }
}

/**
 * Seeds a paid Booking backed by an active booking claim, the way the
 * webhook path leaves the records after a verified payment.
 */
export async function seedPaidBooking(input: {
  claims: ReturnType<typeof createFakeClaimsRepository>['repository']
  repository: BookingRepository
  startsAt: Date
  endsAt: Date
  now: Date
  status?: BookingRecord['status']
  locale?: BookingRecord['locale']
}): Promise<{ booking: BookingRecord; claimId: string }> {
  const claim = await input.claims.createBookingClaim({
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    now: input.now,
  })
  if (!claim) throw new Error('seedPaidBooking: interval already claimed')
  const intent = await input.repository.createIntent({
    holdClaimId: claim.id,
    guestName: 'Ada Lovelace',
    guestEmail: 'ada@example.com',
    locale: input.locale ?? 'zh',
    guestTimeZone: 'Asia/Shanghai',
    topics: ['engineering'],
    briefText: 'Discuss engine designs',
    briefUrls: [],
    meetingProvider: 'google-meet',
    now: input.now,
  })
  const { booking } = await input.repository.createBooking({
    intent,
    claimId: claim.id,
    status: input.status ?? 'confirmed',
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    stripeCheckoutSessionId: `cs-${claim.id}`,
    stripePaymentIntentId: `pi-${claim.id}`,
    amountTotal: 9900,
    currency: 'usd',
    now: input.now,
  })
  return { booking, claimId: claim.id }
}

import 'server-only'

import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm'

import { getDatabase } from '~/db'
import {
  amaAlternateTimeRequests,
  amaBookingEvents,
  amaBookingIntents,
  amaBookings,
  amaProviderEvents,
} from '~/db/schema'

export type BookingDatabase = ReturnType<typeof getDatabase>

export type BookingLocale = 'zh' | 'en'
export type MeetingProviderName = 'google-meet' | 'tencent-meeting'
export type BookingStatus = 'finalizing' | 'confirmed' | 'needs_reschedule' | 'cancelled'
export type RefundStatus = 'none' | 'pending' | 'refunded' | 'failed'
export type AdminBookingView = 'upcoming' | 'attention' | 'past' | 'cancelled'

export type AdminBookingFilters = {
  guestName?: string
  guestEmail?: string
  bookingId?: string
  status?: BookingStatus
  startsFrom?: Date
  startsBefore?: Date
}

export type BookingIntentRecord = {
  id: string
  holdClaimId: string
  guestName: string
  guestEmail: string
  locale: BookingLocale
  guestTimeZone: string
  topics: string[]
  briefText: string
  briefUrls: string[]
  meetingProvider: MeetingProviderName
  stripeCheckoutSessionId: string | null
  createdAt: Date
}

export type BookingRecord = {
  id: string
  intentId: string
  claimId: string | null
  status: BookingStatus
  guestName: string
  guestEmail: string
  locale: BookingLocale
  guestTimeZone: string
  topics: string[]
  briefText: string | null
  briefUrls: string[] | null
  briefPurgedAt: Date | null
  meetingProvider: MeetingProviderName
  startsAt: Date
  endsAt: Date
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string | null
  amountTotal: number
  currency: string
  refundStatus: RefundStatus
  stripeRefundId: string | null
  refundedAt: Date | null
  refundReason: string | null
  cancelledAt: Date | null
  cancelledBy: 'guest' | 'owner' | null
  meetingUrl: string | null
  googleCalendarEventId: string | null
  tencentMeetingId: string | null
  meetingCreatedAt: Date | null
  manageTokenHash: string | null
  manageTokenRevokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type BookingEventRecord = {
  id: string
  bookingId: string
  event: string
  actor: 'guest' | 'owner' | 'system' | 'provider'
  occurredAt: Date
  detail: Record<string, unknown>
}

export type AlternateTimeRequestRecord = {
  id: string
  guestName: string
  guestEmail: string
  locale: BookingLocale
  guestTimeZone: string
  preferredWindows: string
  note: string | null
  status: 'new' | 'resolved' | 'dismissed'
  createdAt: Date
  resolvedAt: Date | null
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; cause?: unknown }
  if (candidate.code === '23505') return true
  return candidate.cause !== undefined && isUniqueViolation(candidate.cause)
}

function containsPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

export function createBookingRepository(database: () => BookingDatabase) {
  return {
    async createIntent(input: {
      holdClaimId: string
      guestName: string
      guestEmail: string
      locale: BookingLocale
      guestTimeZone: string
      topics: string[]
      briefText: string
      briefUrls: string[]
      meetingProvider: MeetingProviderName
      now: Date
    }): Promise<BookingIntentRecord> {
      const [created] = await database()
        .insert(amaBookingIntents)
        .values({
          holdClaimId: input.holdClaimId,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          locale: input.locale,
          guestTimeZone: input.guestTimeZone,
          topics: input.topics,
          briefText: input.briefText,
          briefUrls: input.briefUrls,
          meetingProvider: input.meetingProvider,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning()
      return created as BookingIntentRecord
    },

    async getIntent(intentId: string): Promise<BookingIntentRecord | null> {
      const [intent] = await database()
        .select()
        .from(amaBookingIntents)
        .where(eq(amaBookingIntents.id, intentId))
      return (intent as BookingIntentRecord | undefined) ?? null
    },

    async getIntentByHoldClaim(holdClaimId: string): Promise<BookingIntentRecord | null> {
      const [intent] = await database()
        .select()
        .from(amaBookingIntents)
        .where(eq(amaBookingIntents.holdClaimId, holdClaimId))
      return (intent as BookingIntentRecord | undefined) ?? null
    },

    async getIntentByCheckoutSession(
      sessionId: string,
    ): Promise<BookingIntentRecord | null> {
      const [intent] = await database()
        .select()
        .from(amaBookingIntents)
        .where(eq(amaBookingIntents.stripeCheckoutSessionId, sessionId))
      return (intent as BookingIntentRecord | undefined) ?? null
    },

    /**
     * Records the Checkout Session for a Slot Hold exactly once. When a
     * concurrent request already attached one, the stored session wins and
     * is returned so Checkout creation stays idempotent per hold.
     */
    async attachCheckoutSession(
      intentId: string,
      sessionId: string,
      now: Date,
    ): Promise<BookingIntentRecord | null> {
      try {
        const [updated] = await database()
          .update(amaBookingIntents)
          .set({ stripeCheckoutSessionId: sessionId, updatedAt: now })
          .where(
            and(
              eq(amaBookingIntents.id, intentId),
              isNull(amaBookingIntents.stripeCheckoutSessionId),
            ),
          )
          .returning()
        if (updated) return updated as BookingIntentRecord
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
      return this.getIntent(intentId)
    },

    /**
     * Creates the Booking for a verified payment exactly once. A replayed
     * provider event lands on the Checkout Session unique index and returns
     * the already-created Booking instead of inserting a duplicate.
     */
    async createBooking(input: {
      intent: BookingIntentRecord
      claimId: string | null
      status: BookingStatus
      startsAt: Date
      endsAt: Date
      stripeCheckoutSessionId: string
      stripePaymentIntentId: string | null
      amountTotal: number
      currency: string
      now: Date
    }): Promise<{ booking: BookingRecord; created: boolean }> {
      const [created] = await database()
        .insert(amaBookings)
        .values({
          intentId: input.intent.id,
          claimId: input.claimId,
          status: input.status,
          guestName: input.intent.guestName,
          guestEmail: input.intent.guestEmail,
          locale: input.intent.locale,
          guestTimeZone: input.intent.guestTimeZone,
          topics: input.intent.topics,
          briefText: input.intent.briefText,
          briefUrls: input.intent.briefUrls,
          meetingProvider: input.intent.meetingProvider,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
          stripePaymentIntentId: input.stripePaymentIntentId,
          amountTotal: input.amountTotal,
          currency: input.currency,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing({ target: amaBookings.stripeCheckoutSessionId })
        .returning()
      if (created) return { booking: created as BookingRecord, created: true }
      const existing = await this.getBookingByCheckoutSession(
        input.stripeCheckoutSessionId,
      )
      if (!existing) {
        throw new Error('Booking insert conflicted without an existing Booking')
      }
      return { booking: existing, created: false }
    },

    async getBooking(bookingId: string): Promise<BookingRecord | null> {
      const [booking] = await database()
        .select()
        .from(amaBookings)
        .where(eq(amaBookings.id, bookingId))
      return (booking as BookingRecord | undefined) ?? null
    },

    async getBookingByCheckoutSession(sessionId: string): Promise<BookingRecord | null> {
      const [booking] = await database()
        .select()
        .from(amaBookings)
        .where(eq(amaBookings.stripeCheckoutSessionId, sessionId))
      return (booking as BookingRecord | undefined) ?? null
    },

    async getBookingByManageTokenHash(tokenHash: string): Promise<BookingRecord | null> {
      const [booking] = await database()
        .select()
        .from(amaBookings)
        .where(
          and(
            eq(amaBookings.manageTokenHash, tokenHash),
            isNull(amaBookings.manageTokenRevokedAt),
          ),
        )
      return (booking as BookingRecord | undefined) ?? null
    },

    /**
     * Issues the Manage Link token hash exactly once per Booking.
     */
    async setManageTokenHash(
      bookingId: string,
      tokenHash: string,
      now: Date,
    ): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({ manageTokenHash: tokenHash, manageTokenIssuedAt: now, updatedAt: now })
        .where(and(eq(amaBookings.id, bookingId), isNull(amaBookings.manageTokenHash)))
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    /**
     * Stores meeting artifacts once; a retried finalization observes the
     * stored artifacts instead of creating a second meeting.
     */
    async setMeetingArtifacts(input: {
      bookingId: string
      meetingUrl: string
      googleCalendarEventId: string | null
      tencentMeetingId: string | null
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          meetingUrl: input.meetingUrl,
          googleCalendarEventId: input.googleCalendarEventId,
          tencentMeetingId: input.tencentMeetingId,
          meetingCreatedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(eq(amaBookings.id, input.bookingId), isNull(amaBookings.meetingUrl)),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async replaceMeetingArtifacts(input: {
      bookingId: string
      meetingUrl: string | null
      googleCalendarEventId: string | null
      tencentMeetingId: string | null
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          meetingUrl: input.meetingUrl,
          googleCalendarEventId: input.googleCalendarEventId,
          tencentMeetingId: input.tencentMeetingId,
          meetingCreatedAt: input.meetingUrl === null ? null : input.now,
          updatedAt: input.now,
        })
        .where(eq(amaBookings.id, input.bookingId))
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    /**
     * Compare-and-set status transition; returns null when the Booking was
     * not in one of the expected states so callers can re-read and decide.
     */
    async transitionStatus(input: {
      bookingId: string
      from: readonly BookingStatus[]
      to: BookingStatus
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({ status: input.to, updatedAt: input.now })
        .where(
          and(
            eq(amaBookings.id, input.bookingId),
            inArray(amaBookings.status, [...input.from]),
          ),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async rescheduleBooking(input: {
      bookingId: string
      expectedStartsAt: Date
      claimId: string
      startsAt: Date
      endsAt: Date
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          claimId: input.claimId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: 'finalizing',
          updatedAt: input.now,
        })
        .where(
          and(
            eq(amaBookings.id, input.bookingId),
            eq(amaBookings.startsAt, input.expectedStartsAt),
            inArray(amaBookings.status, ['finalizing', 'confirmed', 'needs_reschedule']),
          ),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async cancelBooking(input: {
      bookingId: string
      cancelledBy: 'guest' | 'owner'
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          status: 'cancelled',
          cancelledAt: input.now,
          cancelledBy: input.cancelledBy,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(amaBookings.id, input.bookingId),
            inArray(amaBookings.status, ['finalizing', 'confirmed', 'needs_reschedule']),
          ),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    /**
     * Marks a refund as requested exactly once. Duplicate management or
     * admin requests observe the recorded refund instead of issuing a new
     * one.
     */
    async beginRefund(input: {
      bookingId: string
      reason: 'guest_cancellation' | 'owner_cancellation' | 'owner_exception'
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({ refundStatus: 'pending', refundReason: input.reason, updatedAt: input.now })
        .where(
          and(
            eq(amaBookings.id, input.bookingId),
            inArray(amaBookings.refundStatus, ['none', 'failed']),
          ),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async completeRefund(input: {
      bookingId: string
      stripeRefundId: string
      now: Date
    }): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          refundStatus: 'refunded',
          stripeRefundId: input.stripeRefundId,
          refundedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(amaBookings.id, input.bookingId),
            eq(amaBookings.refundStatus, 'pending'),
          ),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async failRefund(bookingId: string, now: Date): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({ refundStatus: 'failed', updatedAt: now })
        .where(
          and(eq(amaBookings.id, bookingId), eq(amaBookings.refundStatus, 'pending')),
        )
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    /**
     * Removes the private Booking Brief while keeping the financial and
     * scheduling record. Idempotent: an already purged Booking is left
     * untouched.
     */
    async purgeBrief(bookingId: string, now: Date): Promise<BookingRecord | null> {
      const [updated] = await database()
        .update(amaBookings)
        .set({
          briefText: null,
          briefUrls: null,
          briefPurgedAt: now,
          updatedAt: now,
        })
        .where(and(eq(amaBookings.id, bookingId), isNull(amaBookings.briefPurgedAt)))
        .returning()
      return (updated as BookingRecord | undefined) ?? null
    },

    async searchBookings(input: {
      view: AdminBookingView
      now: Date
      page: number
      pageSize: number
      filters: AdminBookingFilters
    }): Promise<{
      items: BookingRecord[]
      total: number
      page: number
      pageSize: number
    }> {
      const requestedPage = Math.max(1, Math.floor(input.page))
      const pageSize = Math.max(1, Math.min(100, Math.floor(input.pageSize)))
      const conditions: SQL[] = []

      if (input.view === 'attention') {
        conditions.push(
          sql`(${amaBookings.status} IN ('finalizing', 'needs_reschedule') OR ${amaBookings.refundStatus} = 'failed')`,
        )
      } else if (input.view === 'upcoming') {
        conditions.push(
          gte(amaBookings.endsAt, input.now),
          sql`${amaBookings.status} <> 'cancelled'`,
        )
      } else if (input.view === 'past') {
        conditions.push(
          lt(amaBookings.endsAt, input.now),
          sql`${amaBookings.status} <> 'cancelled'`,
        )
      } else {
        conditions.push(eq(amaBookings.status, 'cancelled'))
      }

      const guestName = input.filters.guestName?.trim()
      if (guestName) {
        conditions.push(ilike(amaBookings.guestName, containsPattern(guestName)))
      }
      const guestEmail = input.filters.guestEmail?.trim()
      if (guestEmail) {
        conditions.push(ilike(amaBookings.guestEmail, containsPattern(guestEmail)))
      }
      const bookingId = input.filters.bookingId?.trim()
      if (bookingId) {
        conditions.push(
          sql`${amaBookings.id}::text ILIKE ${containsPattern(bookingId)}`,
        )
      }
      if (input.filters.status) {
        conditions.push(eq(amaBookings.status, input.filters.status))
      }
      if (input.filters.startsFrom) {
        conditions.push(gte(amaBookings.startsAt, input.filters.startsFrom))
      }
      if (input.filters.startsBefore) {
        conditions.push(lt(amaBookings.startsAt, input.filters.startsBefore))
      }

      const where = and(...conditions)
      const ordering =
        input.view === 'upcoming' || input.view === 'attention' ? asc : desc
      const [totalRow] = await database()
        .select({ total: sql<number>`count(*)::int` })
        .from(amaBookings)
        .where(where)
      const total = Number(totalRow?.total ?? 0)
      const page = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(total / pageSize)),
      )
      const items = await database()
        .select()
        .from(amaBookings)
        .where(where)
        .orderBy(ordering(amaBookings.startsAt), asc(amaBookings.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize)

      return {
        items: items as BookingRecord[],
        total,
        page,
        pageSize,
      }
    },

    async listBookings(input: {
      view: 'upcoming' | 'past' | 'attention'
      now: Date
      limit?: number
    }): Promise<BookingRecord[]> {
      const limit = input.limit ?? 100
      if (input.view === 'attention') {
        return (await database()
          .select()
          .from(amaBookings)
          .where(
            sql`${amaBookings.status} IN ('finalizing', 'needs_reschedule') OR ${amaBookings.refundStatus} = 'failed'`,
          )
          .orderBy(asc(amaBookings.startsAt))
          .limit(limit)) as BookingRecord[]
      }
      if (input.view === 'upcoming') {
        return (await database()
          .select()
          .from(amaBookings)
          .where(
            and(
              gte(amaBookings.endsAt, input.now),
              sql`${amaBookings.status} <> 'cancelled'`,
            ),
          )
          .orderBy(asc(amaBookings.startsAt))
          .limit(limit)) as BookingRecord[]
      }
      return (await database()
        .select()
        .from(amaBookings)
        .where(
          and(
            lt(amaBookings.endsAt, input.now),
            sql`${amaBookings.status} <> 'cancelled'`,
          ),
        )
        .orderBy(desc(amaBookings.startsAt))
        .limit(limit)) as BookingRecord[]
    },

    async appendEvent(input: {
      bookingId: string
      event: string
      actor: BookingEventRecord['actor']
      occurredAt: Date
      detail?: Record<string, unknown>
    }): Promise<void> {
      await database().insert(amaBookingEvents).values({
        bookingId: input.bookingId,
        event: input.event,
        actor: input.actor,
        occurredAt: input.occurredAt,
        detail: input.detail ?? {},
      })
    },

    async listEvents(bookingId: string): Promise<BookingEventRecord[]> {
      return (await database()
        .select()
        .from(amaBookingEvents)
        .where(eq(amaBookingEvents.bookingId, bookingId))
        .orderBy(asc(amaBookingEvents.occurredAt), asc(amaBookingEvents.id))) as BookingEventRecord[]
    },

    /**
     * Persists a provider event before side effects run. Returns false when
     * the event was already recorded, letting duplicate deliveries short
     * circuit.
     */
    async recordProviderEvent(input: {
      provider: 'stripe'
      eventId: string
      eventType: string
      receivedAt: Date
    }): Promise<boolean> {
      const inserted = await database()
        .insert(amaProviderEvents)
        .values(input)
        .onConflictDoNothing({
          target: [amaProviderEvents.provider, amaProviderEvents.eventId],
        })
        .returning({ eventId: amaProviderEvents.eventId })
      return inserted.length > 0
    },

    async markProviderEventProcessed(input: {
      provider: 'stripe'
      eventId: string
      outcome: string
      processedAt: Date
    }): Promise<void> {
      await database()
        .update(amaProviderEvents)
        .set({ processedAt: input.processedAt, outcome: input.outcome })
        .where(
          and(
            eq(amaProviderEvents.provider, input.provider),
            eq(amaProviderEvents.eventId, input.eventId),
          ),
        )
    },

    async getProviderEvent(provider: 'stripe', eventId: string) {
      // Default the destructured row to null: without noUncheckedIndexedAccess
      // the plain `[event]` form is typed as always present, so the inferred
      // return type would omit the null this method genuinely returns on a
      // miss (which also breaks the in-memory fake in testing.ts).
      const [event = null] = await database()
        .select()
        .from(amaProviderEvents)
        .where(
          and(
            eq(amaProviderEvents.provider, provider),
            eq(amaProviderEvents.eventId, eventId),
          ),
        )
      return event
    },

    async createAlternateTimeRequest(input: {
      guestName: string
      guestEmail: string
      locale: BookingLocale
      guestTimeZone: string
      preferredWindows: string
      note: string | null
      now: Date
    }): Promise<AlternateTimeRequestRecord> {
      const [created] = await database()
        .insert(amaAlternateTimeRequests)
        .values({
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          locale: input.locale,
          guestTimeZone: input.guestTimeZone,
          preferredWindows: input.preferredWindows,
          note: input.note,
          createdAt: input.now,
        })
        .returning()
      return created as AlternateTimeRequestRecord
    },

    async listAlternateTimeRequests(
      status?: 'new' | 'resolved' | 'dismissed',
    ): Promise<AlternateTimeRequestRecord[]> {
      const query = database().select().from(amaAlternateTimeRequests)
      const rows = status
        ? await query.where(eq(amaAlternateTimeRequests.status, status)).orderBy(desc(amaAlternateTimeRequests.createdAt))
        : await query.orderBy(desc(amaAlternateTimeRequests.createdAt))
      return rows as AlternateTimeRequestRecord[]
    },

    async resolveAlternateTimeRequest(
      requestId: string,
      status: 'resolved' | 'dismissed',
      now: Date,
    ): Promise<AlternateTimeRequestRecord | null> {
      const [updated] = await database()
        .update(amaAlternateTimeRequests)
        .set({ status, resolvedAt: now })
        .where(
          and(
            eq(amaAlternateTimeRequests.id, requestId),
            eq(amaAlternateTimeRequests.status, 'new'),
          ),
        )
        .returning()
      return (updated as AlternateTimeRequestRecord | undefined) ?? null
    },
  }
}

export type BookingRepository = ReturnType<typeof createBookingRepository>

export const bookingRepository = createBookingRepository(getDatabase)

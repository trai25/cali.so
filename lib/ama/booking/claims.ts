import 'server-only'

import { and, eq, gt, lte, sql } from 'drizzle-orm'

import { getDatabase } from '~/db'
import { amaSlotClaims } from '~/db/schema'

import { AMA_BOOKING_POLICY } from '../availability/policy'

export type ClaimsDatabase = ReturnType<typeof getDatabase>

export type SlotClaimRecord = {
  id: string
  kind: 'hold' | 'booking'
  status: 'active' | 'released'
  startsAt: Date
  endsAt: Date
  expiresAt: Date | null
  releasedAt: Date | null
  releaseReason: string | null
}

export type ClaimReleaseReason =
  | 'expired'
  | 'abandoned'
  | 'cancelled'
  | 'rescheduled'
  | 'superseded'

function isPgErrorWithCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; cause?: unknown }
  if (candidate.code === code) return true
  return candidate.cause !== undefined && isPgErrorWithCode(candidate.cause, code)
}

export function isClaimConflictError(error: unknown) {
  return isPgErrorWithCode(error, '23P01')
}

function blockedDuring(startsAt: Date, endsAt: Date) {
  return sql`tstzrange(${startsAt}::timestamptz - make_interval(mins => ${AMA_BOOKING_POLICY.bufferBeforeMinutes}), ${endsAt}::timestamptz + make_interval(mins => ${AMA_BOOKING_POLICY.bufferAfterMinutes}), '[)')`
}

const claimColumns = {
  id: amaSlotClaims.id,
  kind: amaSlotClaims.kind,
  status: amaSlotClaims.status,
  startsAt: amaSlotClaims.startsAt,
  endsAt: amaSlotClaims.endsAt,
  expiresAt: amaSlotClaims.expiresAt,
  releasedAt: amaSlotClaims.releasedAt,
  releaseReason: amaSlotClaims.releaseReason,
}

export function createSlotClaimsRepository(database: () => ClaimsDatabase) {
  async function releaseExpiredHoldsOverlapping(
    startsAt: Date,
    endsAt: Date,
    now: Date,
  ) {
    await database()
      .update(amaSlotClaims)
      .set({
        status: 'released',
        releasedAt: now,
        releaseReason: 'expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(amaSlotClaims.kind, 'hold'),
          eq(amaSlotClaims.status, 'active'),
          lte(amaSlotClaims.expiresAt, now),
          sql`${amaSlotClaims.blockedDuring} && ${blockedDuring(startsAt, endsAt)}`,
        ),
      )
  }

  async function insertClaim(input: {
    kind: 'hold' | 'booking'
    startsAt: Date
    endsAt: Date
    expiresAt: Date | null
    now: Date
  }): Promise<SlotClaimRecord | null> {
    try {
      const [created] = await database()
        .insert(amaSlotClaims)
        .values({
          kind: input.kind,
          status: 'active',
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          blockedDuring: blockedDuring(input.startsAt, input.endsAt) as never,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning(claimColumns)
      return created ?? null
    } catch (error) {
      if (isClaimConflictError(error)) return null
      throw error
    }
  }

  return {
    /**
     * Claims a start time with a Slot Hold. Expired holds blocking the same
     * effective interval are released first; the database exclusion
     * constraint then guarantees at most one active claim can win a race.
     */
    async createHold(input: {
      startsAt: Date
      endsAt: Date
      expiresAt: Date
      now: Date
    }): Promise<SlotClaimRecord | null> {
      await releaseExpiredHoldsOverlapping(input.startsAt, input.endsAt, input.now)
      return insertClaim({
        kind: 'hold',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        expiresAt: input.expiresAt,
        now: input.now,
      })
    },

    /**
     * Claims a start time directly as a Booking claim. Used for late-payment
     * recovery and rescheduling, where no Slot Hold exists any longer.
     */
    async createBookingClaim(input: {
      startsAt: Date
      endsAt: Date
      now: Date
    }): Promise<SlotClaimRecord | null> {
      await releaseExpiredHoldsOverlapping(input.startsAt, input.endsAt, input.now)
      return insertClaim({
        kind: 'booking',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        expiresAt: null,
        now: input.now,
      })
    },

    /**
     * Converts an unexpired active Slot Hold into a Booking claim with one
     * compare-and-set statement, so a verified payment and a competing
     * expiry sweep cannot both win.
     */
    async convertHoldToBooking(
      holdClaimId: string,
      now: Date,
    ): Promise<SlotClaimRecord | null> {
      const [converted] = await database()
        .update(amaSlotClaims)
        .set({ kind: 'booking', expiresAt: null, updatedAt: now })
        .where(
          and(
            eq(amaSlotClaims.id, holdClaimId),
            eq(amaSlotClaims.kind, 'hold'),
            eq(amaSlotClaims.status, 'active'),
            gt(amaSlotClaims.expiresAt, now),
          ),
        )
        .returning(claimColumns)
      return converted ?? null
    },

    async release(
      claimId: string,
      reason: ClaimReleaseReason,
      now: Date,
    ): Promise<SlotClaimRecord | null> {
      const [released] = await database()
        .update(amaSlotClaims)
        .set({
          status: 'released',
          releasedAt: now,
          releaseReason: reason,
          updatedAt: now,
        })
        .where(and(eq(amaSlotClaims.id, claimId), eq(amaSlotClaims.status, 'active')))
        .returning(claimColumns)
      return released ?? null
    },

    async releaseExpiredHolds(now: Date): Promise<number> {
      const released = await database()
        .update(amaSlotClaims)
        .set({
          status: 'released',
          releasedAt: now,
          releaseReason: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(amaSlotClaims.kind, 'hold'),
            eq(amaSlotClaims.status, 'active'),
            lte(amaSlotClaims.expiresAt, now),
          ),
        )
        .returning({ id: amaSlotClaims.id })
      return released.length
    },

    async get(claimId: string): Promise<SlotClaimRecord | null> {
      const [claim] = await database()
        .select(claimColumns)
        .from(amaSlotClaims)
        .where(eq(amaSlotClaims.id, claimId))
      return claim ?? null
    },

    /**
     * Active claims that can still block future availability. Expired but
     * unreleased holds are included; the availability engine filters them by
     * their expiry so the answer does not depend on sweep timing.
     */
    async listBlocking(now: Date): Promise<SlotClaimRecord[]> {
      return database()
        .select(claimColumns)
        .from(amaSlotClaims)
        .where(
          and(eq(amaSlotClaims.status, 'active'), gt(amaSlotClaims.endsAt, now)),
        )
    },
  }
}

export type SlotClaimsRepository = ReturnType<typeof createSlotClaimsRepository>

export const slotClaimsRepository = createSlotClaimsRepository(getDatabase)

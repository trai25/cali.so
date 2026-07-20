import 'server-only'

import type { AvailabilityService } from '../availability/service'
import type { StripeClient } from '../stripe/client'
import { StripeError } from '../stripe/client'
import type { StripeWebhookEvent } from '../stripe/webhook'
import type {
  DurableOperationsRepository,
} from '../operations/repository'
import {
  AMA_CHECKOUT_LIFETIME_MINUTES,
  AMA_HOLD_LIFETIME_MINUTES,
  AMA_SESSION_PRICE,
  AMA_TOPICS,
  AMA_BRIEF_RETENTION_DAYS,
} from './policy'
import { AMA_BOOKING_POLICY } from '../availability/policy'
import type { SlotClaimsRepository } from './claims'
import type {
  BookingIntentRecord,
  BookingLocale,
  BookingRepository,
  MeetingProviderName,
} from './repository'

const MS_PER_MINUTE = 60_000

export type PublicSlot = { startsAt: Date; endsAt: Date }

export type PublicSlotsResult =
  | { status: 'available'; slots: PublicSlot[] }
  | { status: 'unavailable' }

export type HoldIntakeInput = {
  startsAt: Date
  guestName: string
  guestEmail: string
  locale: BookingLocale
  guestTimeZone: string
  topics: string[]
  briefText: string
  briefUrls: string[]
  meetingProvider: MeetingProviderName
}

export type CreateHoldResult =
  | { outcome: 'created'; holdId: string; expiresAt: Date; startsAt: Date; endsAt: Date }
  | { outcome: 'invalid'; field: string }
  | { outcome: 'stale_slot' }
  | { outcome: 'slot_taken' }
  | { outcome: 'unavailable' }

export type HoldStateResult =
  | {
      state: 'active'
      startsAt: Date
      endsAt: Date
      expiresAt: Date
      checkoutStarted: boolean
    }
  | { state: 'expired' }
  | { state: 'processing' }
  | {
      state: 'paid'
      bookingStatus: 'finalizing' | 'confirmed' | 'needs_reschedule'
      /** The confirmed session's facts — no guest identity, only what the
       *  confirmation page prints on its plate. The meeting link rides along
       *  once finalization has created it; possession of the hold id is the
       *  same capability the checkout return already granted. */
      startsAt: Date
      endsAt: Date
      meetingProvider: MeetingProviderName
      guestTimeZone: string
      meetingUrl: string | null
    }
  | { state: 'cancelled' }
  | { state: 'unknown' }

export type CheckoutResult =
  | { outcome: 'redirect'; url: string }
  | { outcome: 'hold_expired' }
  | { outcome: 'already_paid' }
  | { outcome: 'unknown' }
  | { outcome: 'unavailable' }

export type WebhookOutcome =
  | 'duplicate'
  | 'booking_created'
  | 'booking_exists'
  | 'hold_released'
  | 'ignored'
  | 'orphan'

type BookingServiceDependencies = {
  claims: SlotClaimsRepository
  repository: BookingRepository
  operations: DurableOperationsRepository
  availability: Pick<AvailabilityService, 'preview'>
  stripe: StripeClient
  baseUrl: URL
  clock?: { now(): Date }
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase()
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function validateIntake(input: HoldIntakeInput): { field: string } | null {
  const name = input.guestName.trim()
  if (!name || name.length > 120) return { field: 'name' }
  const email = normalizedEmail(input.guestEmail)
  if (!isValidEmail(email)) return { field: 'email' }
  if (input.locale !== 'zh' && input.locale !== 'en') return { field: 'locale' }
  if (!isValidTimeZone(input.guestTimeZone)) return { field: 'timeZone' }
  if (
    input.topics.length < 1 ||
    input.topics.length > AMA_TOPICS.length ||
    new Set(input.topics).size !== input.topics.length ||
    input.topics.some((topic) => !(AMA_TOPICS as readonly string[]).includes(topic))
  ) {
    return { field: 'topics' }
  }
  const brief = input.briefText.trim()
  if (!brief || brief.length > 2000) return { field: 'brief' }
  if (
    input.briefUrls.length > 5 ||
    input.briefUrls.some((url) => url.length > 500 || !isValidHttpUrl(url))
  ) {
    return { field: 'urls' }
  }
  if (
    input.meetingProvider !== 'google-meet' &&
    input.meetingProvider !== 'tencent-meeting'
  ) {
    return { field: 'provider' }
  }
  return null
}

function localePathPrefix(locale: BookingLocale) {
  return locale === 'en' ? '/en' : ''
}

export function createBookingService(dependencies: BookingServiceDependencies) {
  const {
    claims,
    repository,
    operations,
    availability,
    stripe,
    baseUrl,
    clock = { now: () => new Date() },
  } = dependencies

  async function computeSlots(): Promise<PublicSlotsResult> {
    const now = clock.now()
    const blocking = await claims.listBlocking(now)
    const preview = await availability.preview({
      slotHolds: blocking
        .filter((claim) => claim.kind === 'hold' && claim.expiresAt !== null)
        .map((claim) => ({
          startsAt: claim.startsAt,
          endsAt: claim.endsAt,
          expiresAt: claim.expiresAt!,
        })),
      bookings: blocking
        .filter((claim) => claim.kind === 'booking')
        .map((claim) => ({ startsAt: claim.startsAt, endsAt: claim.endsAt })),
    })
    if (preview.status !== 'connected') return { status: 'unavailable' }
    return { status: 'available', slots: preview.slots }
  }

  async function enqueueFinalization(input: {
    bookingId: string
    startsAt: Date
    endsAt: Date
    email: 'confirmation' | 'rescheduled'
    now: Date
  }) {
    await operations.enqueue({
      kind: 'finalize_booking',
      dedupeKey: `finalize:${input.bookingId}:${input.startsAt.toISOString()}`,
      bookingId: input.bookingId,
      payload: {
        startsAt: input.startsAt.toISOString(),
        email: input.email,
      },
      nextAttemptAt: input.now,
      now: input.now,
    })
    await operations.enqueue({
      kind: 'purge_booking_brief',
      dedupeKey: `purge:${input.bookingId}`,
      bookingId: input.bookingId,
      payload: {},
      nextAttemptAt: new Date(
        input.endsAt.getTime() + AMA_BRIEF_RETENTION_DAYS * 24 * 60 * MS_PER_MINUTE,
      ),
      maxAttempts: 32,
      now: input.now,
    })
  }

  return {
    computeSlots,

    async createHold(input: HoldIntakeInput): Promise<CreateHoldResult> {
      const invalid = validateIntake(input)
      if (invalid) return { outcome: 'invalid', field: invalid.field }

      const now = clock.now()
      const slots = await computeSlots()
      if (slots.status !== 'available') return { outcome: 'unavailable' }
      const slot = slots.slots.find(
        (candidate) => candidate.startsAt.getTime() === input.startsAt.getTime(),
      )
      if (!slot) return { outcome: 'stale_slot' }

      const hold = await claims.createHold({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        expiresAt: new Date(now.getTime() + AMA_HOLD_LIFETIME_MINUTES * MS_PER_MINUTE),
        now,
      })
      if (!hold) return { outcome: 'slot_taken' }

      await repository.createIntent({
        holdClaimId: hold.id,
        guestName: input.guestName.trim(),
        guestEmail: normalizedEmail(input.guestEmail),
        locale: input.locale,
        guestTimeZone: input.guestTimeZone,
        topics: input.topics,
        briefText: input.briefText.trim(),
        briefUrls: input.briefUrls,
        meetingProvider: input.meetingProvider,
        now,
      })

      return {
        outcome: 'created',
        holdId: hold.id,
        expiresAt: hold.expiresAt!,
        startsAt: hold.startsAt,
        endsAt: hold.endsAt,
      }
    },

    /**
     * The server-authoritative view a browser countdown reflects.
     */
    async getHoldState(holdId: string): Promise<HoldStateResult> {
      const claim = await claims.get(holdId)
      if (!claim) return { state: 'unknown' }
      const intent = await repository.getIntentByHoldClaim(holdId)
      if (!intent) return { state: 'unknown' }
      const now = clock.now()

      if (intent.stripeCheckoutSessionId) {
        const booking = await repository.getBookingByCheckoutSession(
          intent.stripeCheckoutSessionId,
        )
        if (booking) {
          if (booking.status === 'cancelled') return { state: 'cancelled' }
          return {
            state: 'paid',
            bookingStatus: booking.status,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            meetingProvider: booking.meetingProvider,
            guestTimeZone: booking.guestTimeZone,
            meetingUrl: booking.meetingUrl,
          }
        }
      }

      if (
        claim.kind === 'hold' &&
        claim.status === 'active' &&
        claim.expiresAt !== null &&
        claim.expiresAt.getTime() > now.getTime()
      ) {
        return {
          state: 'active',
          startsAt: claim.startsAt,
          endsAt: claim.endsAt,
          expiresAt: claim.expiresAt,
          checkoutStarted: intent.stripeCheckoutSessionId !== null,
        }
      }

      // The hold no longer protects the slot. An abandoned Checkout (the
      // provider told us the session expired) is a definitive miss, while an
      // expired hold with a live session may still be paid through the
      // late-payment path and reads as processing.
      if (claim.status === 'released' && claim.releaseReason === 'abandoned') {
        return { state: 'expired' }
      }
      if (intent.stripeCheckoutSessionId) return { state: 'processing' }
      return { state: 'expired' }
    },

    /**
     * Creates or reuses the hold's Stripe-hosted Checkout Session. The
     * Stripe idempotency key is derived from the Slot Hold, so retries and
     * double clicks land on one session charging exactly US$99.
     */
    async createCheckout(holdId: string): Promise<CheckoutResult> {
      const claim = await claims.get(holdId)
      const intent = claim && (await repository.getIntentByHoldClaim(holdId))
      if (!claim || !intent) return { outcome: 'unknown' }
      const now = clock.now()

      if (intent.stripeCheckoutSessionId) {
        const booking = await repository.getBookingByCheckoutSession(
          intent.stripeCheckoutSessionId,
        )
        if (booking) return { outcome: 'already_paid' }
      }

      if (
        claim.kind !== 'hold' ||
        claim.status !== 'active' ||
        claim.expiresAt === null ||
        claim.expiresAt.getTime() <= now.getTime()
      ) {
        return { outcome: 'hold_expired' }
      }

      const prefix = localePathPrefix(intent.locale)
      const confirmationUrl = new URL(
        `${prefix}/ama/book/confirmation?hold=${holdId}`,
        baseUrl,
      )
      const cancelUrl = new URL(`${prefix}/ama/book?checkout=cancelled`, baseUrl)

      try {
        const session = await stripe.createCheckoutSession({
          idempotencyKey: `ama-checkout:${holdId}`,
          amount: AMA_SESSION_PRICE.amount,
          currency: AMA_SESSION_PRICE.currency,
          productName:
            intent.locale === 'en'
              ? 'AMA Session with Cali (60 minutes)'
              : 'Cali AMA Session（60 分钟）',
          customerEmail: intent.guestEmail,
          successUrl: confirmationUrl.toString(),
          cancelUrl: cancelUrl.toString(),
          expiresAt: new Date(
            now.getTime() + AMA_CHECKOUT_LIFETIME_MINUTES * MS_PER_MINUTE,
          ),
          metadata: { holdId, intentId: intent.id },
          clientReferenceId: holdId,
        })
        await repository.attachCheckoutSession(intent.id, session.id, now)
        if (!session.url) return { outcome: 'unavailable' }
        return { outcome: 'redirect', url: session.url }
      } catch (error) {
        if (error instanceof StripeError) return { outcome: 'unavailable' }
        throw error
      }
    },

    /**
     * Applies one verified Stripe event. Duplicate and out-of-order
     * deliveries are safe: the event is persisted first, the hold conversion
     * is a compare-and-set, and Booking creation is exactly-once on the
     * Checkout Session.
     */
    async processWebhookEvent(event: StripeWebhookEvent): Promise<WebhookOutcome> {
      const now = clock.now()
      const firstDelivery = await repository.recordProviderEvent({
        provider: 'stripe',
        eventId: event.id,
        eventType: event.type,
        receivedAt: now,
      })
      if (!firstDelivery) {
        const stored = await repository.getProviderEvent('stripe', event.id)
        if (stored?.processedAt) return 'duplicate'
      }

      const finish = async (outcome: WebhookOutcome) => {
        await repository.markProviderEventProcessed({
          provider: 'stripe',
          eventId: event.id,
          outcome,
          processedAt: clock.now(),
        })
        return outcome
      }

      const sessionId =
        typeof event.object.id === 'string' ? (event.object.id as string) : null

      if (event.type === 'checkout.session.expired') {
        if (!sessionId) return finish('ignored')
        const intent = await repository.getIntentByCheckoutSession(sessionId)
        if (!intent) return finish('orphan')
        const booking = await repository.getBookingByCheckoutSession(sessionId)
        if (booking) return finish('booking_exists')
        await claims.release(intent.holdClaimId, 'abandoned', now)
        return finish('hold_released')
      }

      if (
        event.type !== 'checkout.session.completed' &&
        event.type !== 'checkout.session.async_payment_succeeded'
      ) {
        return finish('ignored')
      }

      if (!sessionId) return finish('ignored')
      const paymentStatus =
        typeof event.object.payment_status === 'string'
          ? event.object.payment_status
          : null
      if (paymentStatus !== 'paid') return finish('ignored')

      const metadata =
        typeof event.object.metadata === 'object' &&
        event.object.metadata !== null &&
        !Array.isArray(event.object.metadata)
          ? (event.object.metadata as Record<string, unknown>)
          : {}
      let intent: BookingIntentRecord | null =
        await repository.getIntentByCheckoutSession(sessionId)
      if (!intent && typeof metadata.intentId === 'string') {
        intent = await repository.getIntent(metadata.intentId)
        // Recover the attachment lost between session creation and persist.
        if (intent && intent.stripeCheckoutSessionId === null) {
          intent = await repository.attachCheckoutSession(intent.id, sessionId, now)
        }
        if (intent && intent.stripeCheckoutSessionId !== sessionId) intent = null
      }
      if (!intent) return finish('orphan')

      const existing = await repository.getBookingByCheckoutSession(sessionId)
      if (existing) return finish('booking_exists')

      const holdClaim = await claims.get(intent.holdClaimId)
      if (!holdClaim) return finish('orphan')

      let claimId: string | null = null
      let status: 'finalizing' | 'needs_reschedule' = 'finalizing'
      const converted = await claims.convertHoldToBooking(intent.holdClaimId, now)
      if (converted) {
        claimId = converted.id
      } else {
        const current = await claims.get(intent.holdClaimId)
        if (current && current.kind === 'booking' && current.status === 'active') {
          // A replayed event after the conversion already happened.
          claimId = current.id
        } else {
          // Late payment after hold expiry: try to claim the same interval
          // again, and fall back to the explicit conflict path when another
          // guest took it.
          if (current && current.status === 'active') {
            await claims.release(current.id, 'expired', now)
          }
          const reclaimed = await claims.createBookingClaim({
            startsAt: holdClaim.startsAt,
            endsAt: holdClaim.endsAt,
            now,
          })
          if (reclaimed) {
            claimId = reclaimed.id
          } else {
            status = 'needs_reschedule'
          }
        }
      }

      const paymentIntentId =
        typeof event.object.payment_intent === 'string'
          ? event.object.payment_intent
          : null
      const amountTotal =
        typeof event.object.amount_total === 'number' &&
        Number.isFinite(event.object.amount_total)
          ? event.object.amount_total
          : AMA_SESSION_PRICE.amount
      const currency =
        typeof event.object.currency === 'string'
          ? event.object.currency
          : AMA_SESSION_PRICE.currency

      const { booking, created } = await repository.createBooking({
        intent,
        claimId,
        status,
        startsAt: holdClaim.startsAt,
        endsAt: holdClaim.endsAt,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
        amountTotal,
        currency,
        now,
      })
      if (!created) {
        // Another delivery created the Booking first; release a claim this
        // delivery may have re-acquired for the same interval.
        if (claimId && booking.claimId !== claimId) {
          await claims.release(claimId, 'superseded', now)
        }
        return finish('booking_exists')
      }

      await repository.appendEvent({
        bookingId: booking.id,
        event: 'payment_verified',
        actor: 'provider',
        occurredAt: now,
      })
      if (status === 'needs_reschedule') {
        await repository.appendEvent({
          bookingId: booking.id,
          event: 'slot_conflict_detected',
          actor: 'system',
          occurredAt: now,
        })
      }
      await enqueueFinalization({
        bookingId: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        email: 'confirmation',
        now,
      })
      return finish('booking_created')
    },

    async createAlternateTimeRequest(input: {
      guestName: string
      guestEmail: string
      locale: BookingLocale
      guestTimeZone: string
      preferredWindows: string
      note: string | null
    }): Promise<{ outcome: 'created' } | { outcome: 'invalid'; field: string }> {
      const name = input.guestName.trim()
      if (!name || name.length > 120) return { outcome: 'invalid', field: 'name' }
      const email = normalizedEmail(input.guestEmail)
      if (!isValidEmail(email)) return { outcome: 'invalid', field: 'email' }
      if (input.locale !== 'zh' && input.locale !== 'en') {
        return { outcome: 'invalid', field: 'locale' }
      }
      if (!isValidTimeZone(input.guestTimeZone)) {
        return { outcome: 'invalid', field: 'timeZone' }
      }
      const windows = input.preferredWindows.trim()
      if (!windows || windows.length > 1000) {
        return { outcome: 'invalid', field: 'preferredWindows' }
      }
      const note = input.note?.trim() || null
      if (note && note.length > 1000) return { outcome: 'invalid', field: 'note' }

      await repository.createAlternateTimeRequest({
        guestName: name,
        guestEmail: email,
        locale: input.locale,
        guestTimeZone: input.guestTimeZone,
        preferredWindows: windows,
        note,
        now: clock.now(),
      })
      return { outcome: 'created' }
    },
  }
}

export type BookingService = ReturnType<typeof createBookingService>

export const AMA_SESSION_MINUTES = AMA_BOOKING_POLICY.sessionMinutes

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import type {
  BookingEventRecord,
  BookingRecord,
} from '~/lib/ama/booking/repository'
import type { DurableOperationRecord } from '~/lib/ama/operations/repository'

import type { OperationViewModel } from '../../shared'
import {
  BookingDetail,
  type BookingEventViewModel,
  type BookingViewModel,
} from './BookingDetail'

export const metadata: Metadata = {
  title: 'AMA Booking',
  robots: { index: false, follow: false },
}

// Booking detail intentionally renders per request.
export const instant = false

function bookingViewModel(booking: BookingRecord): BookingViewModel {
  return {
    id: booking.id,
    status: booking.status,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    locale: booking.locale,
    guestTimeZone: booking.guestTimeZone,
    topics: booking.topics,
    briefText: booking.briefText,
    briefUrls: booking.briefUrls,
    briefPurgedAt: booking.briefPurgedAt?.toISOString() ?? null,
    meetingProvider: booking.meetingProvider,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    stripeCheckoutSessionId: booking.stripeCheckoutSessionId,
    stripePaymentIntentId: booking.stripePaymentIntentId,
    amountTotal: booking.amountTotal,
    currency: booking.currency,
    refundStatus: booking.refundStatus,
    stripeRefundId: booking.stripeRefundId,
    refundedAt: booking.refundedAt?.toISOString() ?? null,
    refundReason: booking.refundReason,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    cancelledBy: booking.cancelledBy,
    meetingUrl: booking.meetingUrl,
    googleCalendarEventId: booking.googleCalendarEventId,
    tencentMeetingId: booking.tencentMeetingId,
    createdAt: booking.createdAt.toISOString(),
  }
}

function eventViewModel(event: BookingEventRecord): BookingEventViewModel {
  return {
    id: event.id,
    event: event.event,
    actor: event.actor,
    occurredAt: event.occurredAt.toISOString(),
    detail: event.detail,
  }
}

function operationViewModel(operation: DurableOperationRecord): OperationViewModel {
  return {
    id: operation.id,
    kind: operation.kind,
    bookingId: operation.bookingId,
    status: operation.status,
    attemptCount: operation.attemptCount,
    maxAttempts: operation.maxAttempts,
    nextAttemptAt: operation.nextAttemptAt.toISOString(),
    lastErrorCode: operation.lastErrorCode,
  }
}

export default async function AdminAmaBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  await requireOwnerPage(`/admin/ama/bookings/${bookingId}`)
  const { bookingAdmin } = getAmaAdminServices()
  const detail = await bookingAdmin.getBookingDetail(bookingId)
  if (!detail) notFound()

  return (
    <BookingDetail
      booking={bookingViewModel(detail.booking)}
      events={detail.events.map(eventViewModel)}
      operations={detail.operations.map(operationViewModel)}
    />
  )
}

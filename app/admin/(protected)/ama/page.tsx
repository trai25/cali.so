import type { Metadata } from 'next'

import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import type {
  AlternateTimeRequestRecord,
  BookingRecord,
} from '~/lib/ama/booking/repository'
import type { DurableOperationRecord } from '~/lib/ama/operations/repository'

import { AmaOperations } from './AmaOperations'
import type {
  AlternateTimeRequestViewModel,
  BookingRowViewModel,
  OperationViewModel,
} from './shared'

export const metadata: Metadata = {
  title: 'AMA Operations',
  robots: { index: false, follow: false },
}

// Booking operations data intentionally renders per request.
export const instant = false

function bookingRow(booking: BookingRecord): BookingRowViewModel {
  return {
    id: booking.id,
    status: booking.status,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestTimeZone: booking.guestTimeZone,
    meetingProvider: booking.meetingProvider,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    refundStatus: booking.refundStatus,
  }
}

function operationRow(operation: DurableOperationRecord): OperationViewModel {
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

function timeRequestRow(
  request: AlternateTimeRequestRecord,
): AlternateTimeRequestViewModel {
  return {
    id: request.id,
    guestName: request.guestName,
    guestEmail: request.guestEmail,
    guestTimeZone: request.guestTimeZone,
    preferredWindows: request.preferredWindows,
    note: request.note,
    createdAt: request.createdAt.toISOString(),
  }
}

export default async function AdminAmaPage() {
  await requireOwnerPage('/admin/ama')
  const { bookingAdmin } = getAmaAdminServices()
  const [upcoming, past, attention, timeRequests, operations, counts] =
    await Promise.all([
      bookingAdmin.listBookings('upcoming'),
      bookingAdmin.listBookings('past'),
      bookingAdmin.listBookings('attention'),
      bookingAdmin.listAlternateTimeRequests('new'),
      bookingAdmin.listUnresolvedOperations(),
      bookingAdmin.countOperationsByStatus(),
    ])

  return (
    <AmaOperations
      counts={counts}
      upcoming={upcoming.map(bookingRow)}
      past={past.map(bookingRow)}
      attention={attention.map(bookingRow)}
      timeRequests={timeRequests.map(timeRequestRow)}
      operations={operations.map(operationRow)}
    />
  )
}

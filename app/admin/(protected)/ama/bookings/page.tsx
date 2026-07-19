import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AdminBackLink } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import { T } from '~/lib/i18n'
import type {
  AlternateTimeRequestRecord,
  BookingRecord,
} from '~/lib/ama/booking/repository'
import type { DurableOperationRecord } from '~/lib/ama/operations/repository'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { AmaOperations } from '../AmaOperations'
import type {
  AlternateTimeRequestViewModel,
  BookingRowViewModel,
  OperationViewModel,
} from '../shared'

export const metadata: Metadata = {
  title: 'AMA Bookings',
  robots: nonPublicRobots,
}

export const instant = true

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
    hasMeetingLink: booking.meetingUrl !== null,
    hasBrief:
      booking.briefPurgedAt === null &&
      (booking.briefText !== null || (booking.briefUrls?.length ?? 0) > 0),
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

function BookingsHeader() {
  return (
    <>
      <AdminBackLink href="/admin/ama">
        <T zh="咨询" en="AMA" />
      </AdminBackLink>
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="预约" en="Bookings" />
        </h1>
        <PixelCluster variant={7} className="shrink-0" />
      </div>
    </>
  )
}

function BookingsFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <BookingsHeader />
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">…</p>
      <ul className="mt-6 hairline-top pt-4">
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index} className="flex min-h-11 items-center py-1.5" aria-hidden>
            <span className="h-4 w-full max-w-72 rounded-sm bg-surface-1" />
          </li>
        ))}
      </ul>
    </div>
  )
}

async function BookingsLoader() {
  await requireOwnerPage('/admin/ama/bookings')
  const { bookingAdmin } = getAmaAdminServices()
  const [upcoming, past, attention, timeRequests, operations] =
    await Promise.all([
      bookingAdmin.listBookings('upcoming'),
      bookingAdmin.listBookings('past'),
      bookingAdmin.listBookings('attention'),
      bookingAdmin.listAlternateTimeRequests('new'),
      bookingAdmin.listUnresolvedOperations(),
    ])

  return (
    <>
      <BookingsHeader />
      <AmaOperations
        upcoming={upcoming.map(bookingRow)}
        past={past.map(bookingRow)}
        attention={attention.map(bookingRow)}
        timeRequests={timeRequests.map(timeRequestRow)}
        failedOperations={operations
          .filter((operation) => operation.status === 'failed')
          .map(operationRow)}
      />
    </>
  )
}

export default function AdminAmaBookingsPage() {
  return (
    <Suspense fallback={<BookingsFallback />}>
      <BookingsLoader />
    </Suspense>
  )
}

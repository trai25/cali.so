import type { Metadata } from 'next'
import { Temporal } from '@js-temporal/polyfill'
import { Suspense } from 'react'

import { AdminBackLink } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import { T } from '~/lib/i18n'
import type {
  AlternateTimeRequestRecord,
  BookingRecord,
  BookingStatus,
} from '~/lib/ama/booking/repository'
import type { DurableOperationRecord } from '~/lib/ama/operations/repository'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import {
  AmaOperations,
  type BookingFiltersViewModel,
  type BookingView,
} from '../AmaOperations'
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
    meetingUrl: booking.meetingUrl,
    calendarUrl: booking.googleCalendarEventId
      ? `https://calendar.google.com/calendar/u/0/r/eventedit/${encodeURIComponent(booking.googleCalendarEventId)}`
      : null,
    topics: booking.topics,
    briefPreview:
      booking.briefPurgedAt === null && booking.briefText
        ? booking.briefText.replace(/\s+/g, ' ').trim()
        : null,
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

const bookingViews = new Set<BookingView>([
  'attention',
  'upcoming',
  'past',
  'cancelled',
])
const bookingStatuses = new Set<BookingStatus>([
  'finalizing',
  'confirmed',
  'needs_reschedule',
  'cancelled',
])
const pageSize = 20

type BookingsSearchParams = Promise<{
  view?: string | string[]
  page?: string | string[]
  guestName?: string | string[]
  guestEmail?: string | string[]
  bookingId?: string | string[]
  status?: string | string[]
  from?: string | string[]
  to?: string | string[]
}>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function shortValue(value: string | string[] | undefined, limit: number) {
  return (first(value) ?? '').trim().slice(0, limit)
}

function localDateBoundary(
  value: string,
  timeZone: string,
  addDays = 0,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  try {
    const date = Temporal.PlainDate.from(value)
    if (date.toString() !== value) return undefined
    return new Date(
      date
        .add({ days: addDays })
        .toZonedDateTime(timeZone)
        .toInstant().epochMilliseconds,
    )
  } catch {
    return undefined
  }
}

async function BookingsLoader({
  searchParams,
}: {
  searchParams: BookingsSearchParams
}) {
  await requireOwnerPage('/admin/ama/bookings')
  const { availability, bookingAdmin } = getAmaAdminServices()
  const [params, schedule] = await Promise.all([
    searchParams,
    availability.getSchedule(),
  ])
  const requestedView = first(params.view)
  const view = bookingViews.has(requestedView as BookingView)
    ? (requestedView as BookingView)
    : 'attention'
  const requestedPage = Number(first(params.page))
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1
  const statusValue = first(params.status)
  const status = bookingStatuses.has(statusValue as BookingStatus)
    ? (statusValue as BookingStatus)
    : ''
  const filters: BookingFiltersViewModel = {
    guestName: shortValue(params.guestName, 120),
    guestEmail: shortValue(params.guestEmail, 320),
    bookingId: shortValue(params.bookingId, 64),
    status,
    from: shortValue(params.from, 10),
    to: shortValue(params.to, 10),
  }

  const [result, attentionSummary, timeRequests, operations] = await Promise.all([
    bookingAdmin.searchBookings({
      view,
      page,
      pageSize,
      filters: {
        guestName: filters.guestName || undefined,
        guestEmail: filters.guestEmail || undefined,
        bookingId: filters.bookingId || undefined,
        status: filters.status || undefined,
        startsFrom: filters.from
          ? localDateBoundary(filters.from, schedule.timeZone)
          : undefined,
        startsBefore: filters.to
          ? localDateBoundary(filters.to, schedule.timeZone, 1)
          : undefined,
      },
    }),
    bookingAdmin.searchBookings({
      view: 'attention',
      page: 1,
      pageSize: 1,
      filters: {},
    }),
    bookingAdmin.listAlternateTimeRequests('new'),
    bookingAdmin.listUnresolvedOperations(),
  ])
  const failedOperations = operations.filter(
    (operation) => operation.status === 'failed',
  )

  return (
    <>
      <BookingsHeader />
      <AmaOperations
        view={view}
        bookings={result.items.map(bookingRow)}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        ownerTimeZone={schedule.timeZone}
        filters={filters}
        attentionTotal={
          attentionSummary.total + timeRequests.length + failedOperations.length
        }
        timeRequests={timeRequests.map(timeRequestRow)}
        failedOperations={failedOperations.map(operationRow)}
      />
    </>
  )
}

export default function AdminAmaBookingsPage({
  searchParams,
}: {
  searchParams: BookingsSearchParams
}) {
  return (
    <Suspense fallback={<BookingsFallback />}>
      <BookingsLoader searchParams={searchParams} />
    </Suspense>
  )
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AdminBackLink } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'
import { firstSearchParam } from '~/lib/search-params'

import {
  AmaOperations,
  type BookingFiltersViewModel,
  type BookingView,
} from '../../AmaOperations'
import { AmaBookingsSkeleton } from '../../AmaSkeletons'
import type {
  AlternateTimeRequestViewModel,
  BookingRowViewModel,
  OperationViewModel,
} from '../../shared'

export const metadata: Metadata = {
  title: 'AMA Booking Fixtures',
  robots: nonPublicRobots,
}

export const instant = true

const views = new Set<BookingView>([
  'attention',
  'upcoming',
  'past',
  'cancelled',
])
const pageSize = 20

type FixtureSearchParams = Promise<{
  view?: string | string[]
  page?: string | string[]
  guestName?: string | string[]
  guestEmail?: string | string[]
  bookingId?: string | string[]
  status?: string | string[]
  from?: string | string[]
  to?: string | string[]
}>

function fixtureHeader() {
  return (
    <>
      <AdminBackLink href="/admin/ama/fixtures">
        <T zh="演示数据" en="Fixtures" />
      </AdminBackLink>
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="预约演示" en="Booking fixtures" />
        </h1>
        <PixelCluster variant={7} className="shrink-0" />
      </div>
    </>
  )
}

function BookingFixturesFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      {fixtureHeader()}
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        <T
          zh="本页使用确定性的本地数据，可安全测试筛选、分页和长文本。"
          en="Deterministic local data for safely testing filters, pagination, and long content."
        />
      </p>
      <AmaBookingsSkeleton />
    </div>
  )
}

function booking(
  index: number,
  input: Partial<BookingRowViewModel> = {},
): BookingRowViewModel {
  const suffix = String(index).padStart(12, '0')
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    status: 'confirmed',
    guestName: index % 3 === 0 ? `林晓明 ${index}` : `Fixture Guest ${index}`,
    guestEmail: `guest.${index}@example.com`,
    guestTimeZone: index % 2 === 0 ? 'America/Los_Angeles' : 'Asia/Tokyo',
    meetingProvider: index % 4 === 0 ? 'tencent-meeting' : 'google-meet',
    startsAt: `2026-08-${String((index % 20) + 1).padStart(2, '0')}T02:00:00.000Z`,
    endsAt: `2026-08-${String((index % 20) + 1).padStart(2, '0')}T03:00:00.000Z`,
    refundStatus: 'none',
    meetingUrl:
      index % 4 === 0
        ? `https://meeting.tencent.com/dm/fixture-${index}`
        : `https://meet.google.com/fixture-${index}`,
    calendarUrl:
      index % 4 === 0
        ? null
        : `https://calendar.google.com/calendar/u/0/r/eventedit/fixture-${index}`,
    topics:
      index % 2 === 0
        ? ['AI products', 'independent work']
        : ['career transition', 'design engineering'],
    briefPreview:
      index === 1
        ? '我正在做一个面向独立开发者的 AI 产品，希望讨论从用户访谈到定价的完整判断过程。I also want a direct critique of the launch plan, including what not to build.'
        : `Fixture Booking Brief ${index}: a concise but realistic preparation note for visual review.`,
    ...input,
  }
}

const attentionBookings = [
  booking(1, { status: 'needs_reschedule', meetingUrl: null, calendarUrl: null }),
  booking(2, { status: 'finalizing', meetingUrl: null, calendarUrl: null }),
  booking(3, { refundStatus: 'failed' }),
]
const upcomingBookings = Array.from({ length: 45 }, (_, index) =>
  booking(index + 10),
)
const pastBookings = Array.from({ length: 12 }, (_, index) =>
  booking(index + 70, {
    startsAt: `2026-06-${String((index % 20) + 1).padStart(2, '0')}T02:00:00.000Z`,
    endsAt: `2026-06-${String((index % 20) + 1).padStart(2, '0')}T03:00:00.000Z`,
    meetingUrl: null,
  }),
)
const cancelledBookings = Array.from({ length: 6 }, (_, index) =>
  booking(index + 90, { status: 'cancelled', meetingUrl: null }),
)

const timeRequests: AlternateTimeRequestViewModel[] = [
  {
    id: '00000000-0000-4000-8000-000000000201',
    guestName: 'Katherine Johnson',
    guestEmail: 'katherine.fixture@example.com',
    guestTimeZone: 'America/Chicago',
    preferredWindows: 'Weekday evenings after 19:00, or Saturday mornings.',
    note: 'I am flexible during launch week and can meet in either English or Chinese.',
    createdAt: '2026-07-20T09:00:00.000Z',
  },
]

const failedOperations: OperationViewModel[] = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    kind: 'finalize_booking',
    bookingId: attentionBookings[1].id,
    status: 'failed',
    attemptCount: 8,
    maxAttempts: 8,
    nextAttemptAt: '2026-07-21T01:00:00.000Z',
    lastErrorCode: 'google_calendar_unavailable',
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    kind: 'issue_refund',
    bookingId: attentionBookings[2].id,
    status: 'failed',
    attemptCount: 8,
    maxAttempts: 8,
    nextAttemptAt: '2026-07-21T01:30:00.000Z',
    lastErrorCode: 'stripe_unavailable',
  },
]

function matchesFilters(
  item: BookingRowViewModel,
  filters: BookingFiltersViewModel,
) {
  return (
    (!filters.guestName ||
      item.guestName.toLowerCase().includes(filters.guestName.toLowerCase())) &&
    (!filters.guestEmail ||
      item.guestEmail.toLowerCase().includes(filters.guestEmail.toLowerCase())) &&
    (!filters.bookingId ||
      item.id.toLowerCase().includes(filters.bookingId.toLowerCase())) &&
    (!filters.status || item.status === filters.status) &&
    (!filters.from || item.startsAt.slice(0, 10) >= filters.from) &&
    (!filters.to || item.startsAt.slice(0, 10) <= filters.to)
  )
}

async function BookingFixtures({
  searchParams,
}: {
  searchParams: FixtureSearchParams
}) {
  await requireOwnerPage('/admin/ama/fixtures/bookings')
  const params = await searchParams
  const requestedView = firstSearchParam(params.view)
  const view = views.has(requestedView as BookingView)
    ? (requestedView as BookingView)
    : 'attention'
  const filters: BookingFiltersViewModel = {
    guestName: firstSearchParam(params.guestName) ?? '',
    guestEmail: firstSearchParam(params.guestEmail) ?? '',
    bookingId: firstSearchParam(params.bookingId) ?? '',
    status:
      (firstSearchParam(params.status) as BookingFiltersViewModel['status']) ?? '',
    from: firstSearchParam(params.from) ?? '',
    to: firstSearchParam(params.to) ?? '',
  }
  const source =
    view === 'attention'
      ? attentionBookings
      : view === 'upcoming'
        ? upcomingBookings
        : view === 'past'
          ? pastBookings
          : cancelledBookings
  const filtered = source.filter((item) => matchesFilters(item, filters))
  const requestedPage = Number(firstSearchParam(params.page))
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(
    pageCount,
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  )

  return (
    <div className="pb-10">
      {fixtureHeader()}
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        <T
          zh="本页使用确定性的本地数据，可安全测试筛选、分页和长文本。"
          en="Deterministic local data for safely testing filters, pagination, and long content."
        />
      </p>
      <AmaOperations
        view={view}
        bookings={filtered.slice((page - 1) * pageSize, page * pageSize)}
        total={filtered.length}
        page={page}
        pageSize={pageSize}
        ownerTimeZone="Asia/Taipei"
        filters={filters}
        attentionTotal={
          attentionBookings.length + timeRequests.length + failedOperations.length
        }
        timeRequests={timeRequests}
        failedOperations={failedOperations}
        basePath="/admin/ama/fixtures/bookings"
        fixtureMode
      />
    </div>
  )
}

export default function AdminAmaBookingFixturesPage({
  searchParams,
}: {
  searchParams: FixtureSearchParams
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <Suspense fallback={<BookingFixturesFallback />}>
      <BookingFixtures searchParams={searchParams} />
    </Suspense>
  )
}

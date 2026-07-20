import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import type { OperationViewModel } from '../../../shared'
import {
  BookingDetail,
  type BookingEventViewModel,
  type BookingViewModel,
} from '../../../bookings/[bookingId]/BookingDetail'

export const metadata: Metadata = {
  title: 'AMA Booking Detail Fixture',
  robots: nonPublicRobots,
}

export const instant = true

const fixtureIdPattern = /^00000000-0000-4000-8000-(\d{12})$/

function fixtureBooking(bookingId: string): BookingViewModel | null {
  const match = fixtureIdPattern.exec(bookingId)
  if (!match) return null
  const index = Number(match[1])
  const isPast = index >= 70 && index < 90
  const isCancelled = index >= 90
  const startsAt = isPast
    ? '2026-06-12T02:00:00.000Z'
    : '2026-08-12T02:00:00.000Z'
  const status =
    index === 1
      ? 'needs_reschedule'
      : index === 2
        ? 'finalizing'
        : isCancelled
          ? 'cancelled'
          : 'confirmed'

  return {
    id: bookingId,
    status,
    guestName: index % 3 === 0 ? `林晓明 ${index}` : `Fixture Guest ${index}`,
    guestEmail: `guest.${index}@example.com`,
    locale: index % 3 === 0 ? 'zh' : 'en',
    guestTimeZone: index % 2 === 0 ? 'America/Los_Angeles' : 'Asia/Tokyo',
    topics: ['AI products', 'design engineering'],
    briefText:
      'This fixture keeps the complete Booking Brief visible so long-form wrapping, links, and the 90-day retention state can be reviewed locally. 我也希望讨论产品判断与独立工作的取舍。',
    briefUrls: ['https://example.com/fixture-context'],
    briefPurgedAt: null,
    meetingProvider: index % 4 === 0 ? 'tencent-meeting' : 'google-meet',
    startsAt,
    endsAt: isPast
      ? '2026-06-12T03:00:00.000Z'
      : '2026-08-12T03:00:00.000Z',
    stripeCheckoutSessionId: `cs_fixture_${index}`,
    stripePaymentIntentId: `pi_fixture_${index}`,
    amountTotal: 25_000,
    currency: 'usd',
    refundStatus: index === 3 ? 'failed' : 'none',
    stripeRefundId: null,
    refundedAt: null,
    refundReason: null,
    cancelledAt: isCancelled ? '2026-07-18T04:00:00.000Z' : null,
    cancelledBy: isCancelled ? 'guest' : null,
    meetingUrl:
      status === 'confirmed'
        ? index % 4 === 0
          ? `https://meeting.tencent.com/dm/fixture-${index}`
          : `https://meet.google.com/fixture-${index}`
        : null,
    googleCalendarEventId:
      status === 'confirmed' && index % 4 !== 0 ? `fixture-event-${index}` : null,
    tencentMeetingId:
      status === 'confirmed' && index % 4 === 0 ? `fixture-tencent-${index}` : null,
    createdAt: '2026-07-01T02:00:00.000Z',
  }
}

function fixtureEvents(bookingId: string): BookingEventViewModel[] {
  return [
    {
      id: `${bookingId}:created`,
      event: 'checkout_completed',
      actor: 'provider',
      occurredAt: '2026-07-01T02:00:00.000Z',
      detail: { amountTotal: 25_000, currency: 'usd' },
    },
    {
      id: `${bookingId}:confirmed`,
      event: 'booking_confirmed',
      actor: 'system',
      occurredAt: '2026-07-01T02:00:04.000Z',
      detail: { artifacts: { calendar: true, meeting: true } },
    },
  ]
}

function fixtureOperations(bookingId: string): OperationViewModel[] {
  return [
    {
      id: `${bookingId}:operation`,
      kind: 'send_reminder',
      bookingId,
      status: 'failed',
      attemptCount: 8,
      maxAttempts: 8,
      nextAttemptAt: '2026-08-11T02:00:00.000Z',
      lastErrorCode: 'fixture_provider_unavailable',
    },
  ]
}

const fixtureSlots = [
  {
    startsAt: '2026-08-14T02:00:00.000Z',
    endsAt: '2026-08-14T03:00:00.000Z',
  },
  {
    startsAt: '2026-08-17T05:00:00.000Z',
    endsAt: '2026-08-17T06:00:00.000Z',
  },
]

function BookingFixtureFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <div className="h-4 w-32 rounded-sm bg-surface-1" aria-hidden />
      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="page-eyebrow">
          <T zh="咨询预约" en="AMA Booking" />
        </p>
        <PixelCluster variant={10} className="shrink-0" />
      </div>
      <div className="mt-2 h-5 w-48 rounded-sm bg-surface-1" aria-hidden />
      <div className="mt-6 grid gap-4 hairline-top pt-5" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-4 rounded-sm bg-surface-1"
            style={{ width: `${72 + (index % 3) * 8}%` }}
          />
        ))}
      </div>
    </div>
  )
}

async function BookingFixtureLoader({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  await requireOwnerPage(`/admin/ama/fixtures/bookings/${bookingId}`)
  const booking = fixtureBooking(bookingId)
  if (!booking) notFound()

  return (
    <BookingDetail
      booking={booking}
      events={fixtureEvents(bookingId)}
      operations={fixtureOperations(bookingId)}
      backHref="/admin/ama/fixtures/bookings"
      fixtureMode
      fixtureSlots={fixtureSlots}
    />
  )
}

export default function AdminAmaBookingFixtureDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <Suspense fallback={<BookingFixtureFallback />}>
      <BookingFixtureLoader params={params} />
    </Suspense>
  )
}

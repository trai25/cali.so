import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AdminMenu, AdminMenuRow } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'

export const metadata: Metadata = {
  title: 'AMA',
  robots: nonPublicRobots,
}

export const instant = true

function AmaHeader() {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="page-eyebrow">
        <T zh="咨询" en="AMA" />
      </h1>
      <PixelCluster variant={7} className="shrink-0" />
    </div>
  )
}

function AmaFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <AmaHeader />
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">…</p>
      <ul className="mt-6 hairline-top pt-4">
        {Array.from(
          { length: process.env.NODE_ENV === 'development' ? 3 : 2 },
          (_, index) => (
            <li
              key={index}
              className="flex min-h-11 items-center py-1.5"
              aria-hidden
            >
              <span className="h-4 w-full max-w-72 rounded-sm bg-surface-1" />
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function CalendarSummary({
  status,
}: {
  status:
    | 'connected'
    | 'disconnected'
    | 'denied-scope'
    | 'expired'
    | 'revoked'
    | 'unavailable'
}) {
  const copy = {
    connected: { zh: '日历已连接', en: 'calendar connected' },
    disconnected: { zh: '日历未连接', en: 'calendar disconnected' },
    'denied-scope': { zh: '日历权限不足', en: 'calendar permissions denied' },
    expired: { zh: '日历连接已过期', en: 'calendar connection expired' },
    revoked: { zh: '日历授权已撤销', en: 'calendar access revoked' },
    unavailable: { zh: '日历暂时不可用', en: 'calendar unavailable' },
  } as const
  return <T zh={copy[status].zh} en={copy[status].en} />
}

async function AmaMenuLoader() {
  await requireOwnerPage('/admin/ama')
  const { availability, bookingAdmin, google } = getAmaAdminServices()
  const [
    upcoming,
    attention,
    timeRequests,
    operations,
    schedule,
    connection,
    preview,
  ] = await Promise.all([
      bookingAdmin.searchBookings({
        view: 'upcoming',
        page: 1,
        pageSize: 1,
        filters: {},
      }),
      bookingAdmin.searchBookings({
        view: 'attention',
        page: 1,
        pageSize: 1,
        filters: {},
      }),
      bookingAdmin.listAlternateTimeRequests('new'),
      bookingAdmin.listUnresolvedOperations(),
      availability.getSchedule(),
      google.getConnection(),
      availability.preview(),
  ])

  const needsAttention =
    attention.total +
    timeRequests.length +
    operations.filter((operation) => operation.status === 'failed').length
  const persistedCalendarStatus =
    connection?.status === 'denied_scope'
      ? 'denied-scope'
      : connection?.status === 'error'
        ? 'unavailable'
        : connection?.status ?? 'disconnected'
  const calendarStatus =
    persistedCalendarStatus === 'connected' && preview.status !== 'connected'
      ? preview.status
      : persistedCalendarStatus
  const enabledWeekdays = new Set(
    schedule.weekdays
      .filter((weekday) => weekday.enabled)
      .map((weekday) => weekday.isoWeekday),
  )
  const enabledWindowCount = schedule.windows.filter((window) =>
    enabledWeekdays.has(window.isoWeekday),
  ).length

  return (
    <div className="pb-10">
      <AmaHeader />
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {upcoming.total} <T zh="场即将进行" en="upcoming" />
        {needsAttention > 0 && (
          <>
            {' · '}
            {needsAttention} <T zh="项待处理" en="need attention" />
          </>
        )}
      </p>

      <AdminMenu>
        <AdminMenuRow
          href="/admin/ama/bookings"
          label={<T zh="预约" en="Bookings" />}
          destructive={needsAttention > 0}
          value={
            needsAttention > 0 ? (
              <>
                {needsAttention} <T zh="项待处理" en="need attention" />
              </>
            ) : (
              <>
                {upcoming.total} <T zh="场即将进行" en="upcoming" />
              </>
            )
          }
        />
        <AdminMenuRow
          href="/admin/ama/settings"
          label={<T zh="设置" en="Settings" />}
          value={
            <>
              {enabledWindowCount} <T zh="个时段" en="windows" />
              {' · '}
              <CalendarSummary status={calendarStatus} />
            </>
          }
        />
        {process.env.NODE_ENV === 'development' && (
          <AdminMenuRow
            href="/admin/ama/fixtures"
            label={<T zh="演示数据" en="Fixture pages" />}
            value={<T zh="仅限本地" en="local only" />}
          />
        )}
      </AdminMenu>
    </div>
  )
}

// The AMA surface is a menu: Bookings and Settings each own their page.
export default function AdminAmaPage() {
  return (
    <Suspense fallback={<AmaFallback />}>
      <AmaMenuLoader />
    </Suspense>
  )
}

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
        {Array.from({ length: 2 }, (_, index) => (
          <li key={index} className="flex min-h-11 items-center py-1.5" aria-hidden>
            <span className="h-4 w-full max-w-72 rounded-sm bg-surface-1" />
          </li>
        ))}
      </ul>
    </div>
  )
}

async function AmaMenuLoader() {
  await requireOwnerPage('/admin/ama')
  const { availability, bookingAdmin, google } = getAmaAdminServices()
  const [upcoming, attention, timeRequests, operations, windows, connection] =
    await Promise.all([
      bookingAdmin.listBookings('upcoming'),
      bookingAdmin.listBookings('attention'),
      bookingAdmin.listAlternateTimeRequests('new'),
      bookingAdmin.listUnresolvedOperations(),
      availability.list(),
      google.getConnection(),
    ])

  const needsAttention =
    attention.length +
    timeRequests.length +
    operations.filter((operation) => operation.status === 'failed').length
  const calendarConnected =
    connection !== null && connection.status === 'connected'

  return (
    <div className="pb-10">
      <AmaHeader />
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {upcoming.length} <T zh="场即将进行" en="upcoming" />
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
                {upcoming.length} <T zh="场即将进行" en="upcoming" />
              </>
            )
          }
        />
        <AdminMenuRow
          href="/admin/ama/settings"
          label={<T zh="设置" en="Settings" />}
          value={
            <>
              {windows.length} <T zh="个时段" en="windows" />
              {' · '}
              {calendarConnected ? (
                <T zh="日历已连接" en="calendar connected" />
              ) : (
                <T zh="日历未连接" en="calendar off" />
              )}
            </>
          }
        />
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

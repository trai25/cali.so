import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AdminBackLink, AdminMenu, AdminMenuRow } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'

export const metadata: Metadata = {
  title: 'AMA Fixtures',
  robots: nonPublicRobots,
}

export const instant = true

function FixtureHeader() {
  return (
    <>
      <AdminBackLink href="/admin/ama">
        <T zh="咨询" en="AMA" />
      </AdminBackLink>
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="演示数据" en="Fixture pages" />
        </h1>
        <PixelCluster variant={7} className="shrink-0" />
      </div>
    </>
  )
}

function FixtureContent({ busy = false }: { busy?: boolean }) {
  return (
    <div className="pb-10" aria-busy={busy || undefined}>
      <FixtureHeader />
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        <T
          zh="仅在本地开发环境使用。这里的数据不会读取或写入数据库。"
          en="Local development only. These scenarios do not read or write the database."
        />
      </p>
      <AdminMenu>
        <AdminMenuRow
          href="/admin/ama/fixtures/availability"
          label={<T zh="可预约时间" en="Availability" />}
          value={<T zh="安排、覆盖、日历、上线检查" en="schedule, overrides, Calendar, readiness" />}
        />
        <AdminMenuRow
          href="/admin/ama/fixtures/bookings"
          label={<T zh="预约" en="Bookings" />}
          value={<T zh="状态、筛选、分页、异常" en="states, filters, pagination, exceptions" />}
        />
      </AdminMenu>
    </div>
  )
}

async function FixtureIndex() {
  await requireOwnerPage('/admin/ama/fixtures')
  return <FixtureContent />
}

export default function AdminAmaFixturesPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <Suspense fallback={<FixtureContent busy />}>
      <FixtureIndex />
    </Suspense>
  )
}

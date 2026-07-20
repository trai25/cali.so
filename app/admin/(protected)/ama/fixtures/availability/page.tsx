import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { AdminBackLink } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'
import { firstSearchParam } from '~/lib/search-params'

import {
  AmaSettings,
  type AmaSettingsProps,
  type GoogleConnectionStatus,
} from '../../AmaSettings'
import { AmaSettingsSkeleton } from '../../AmaSkeletons'

export const metadata: Metadata = {
  title: 'AMA Availability Fixture',
  robots: nonPublicRobots,
}

export const instant = true

const scenarios = [
  'connected',
  'no-hours',
  'policy',
  'conflicts',
  'booked',
  'denied',
  'unavailable',
] as const
type Scenario = (typeof scenarios)[number]

const scenarioLabels: Record<Scenario, { zh: string; en: string }> = {
  connected: { zh: '正常', en: 'Connected' },
  'no-hours': { zh: '无时段', en: 'No hours' },
  policy: { zh: '规则限制', en: 'Policy' },
  conflicts: { zh: '日历冲突', en: 'Conflicts' },
  booked: { zh: '已占用', en: 'Booked' },
  denied: { zh: '权限不足', en: 'Denied' },
  unavailable: { zh: '不可用', en: 'Unavailable' },
}

type FixtureSearchParams = Promise<{ scenario?: string | string[] }>

function FixtureHeader() {
  return (
    <>
      <AdminBackLink href="/admin/ama/fixtures">
        <T zh="演示数据" en="Fixtures" />
      </AdminBackLink>
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="可预约时间演示" en="Availability fixture" />
        </h1>
        <PixelCluster variant={7} className="shrink-0" />
      </div>
    </>
  )
}

function AvailabilityFixtureFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <FixtureHeader />
      <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-4" aria-hidden>
        {Array.from({ length: scenarios.length }, (_, index) => (
          <span key={index} className="h-11 rounded-sm bg-surface-1" />
        ))}
      </div>
      <AmaSettingsSkeleton />
    </div>
  )
}

function fixtureProps(scenario: Scenario): AmaSettingsProps {
  const status: GoogleConnectionStatus =
    scenario === 'denied'
      ? 'denied-scope'
      : scenario === 'unavailable'
        ? 'unavailable'
        : 'connected'
  const populated = scenario !== 'no-hours'
  const windows =
    scenario === 'policy'
      ? [{ id: 1, isoWeekday: 1, startMinute: 540, endMinute: 570 }]
      : populated
        ? [
            { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
            { id: 2, isoWeekday: 1, startMinute: 780, endMinute: 1020 },
            { id: 3, isoWeekday: 3, startMinute: 600, endMinute: 960 },
            { id: 4, isoWeekday: 5, startMinute: 540, endMinute: 660 },
          ]
        : []
  return {
    timeZone: 'Asia/Taipei',
    weekdays: [
      { isoWeekday: 1, enabled: populated },
      { isoWeekday: 2, enabled: false },
      { isoWeekday: 3, enabled: populated },
      { isoWeekday: 4, enabled: false },
      { isoWeekday: 5, enabled: populated },
      { isoWeekday: 6, enabled: false },
      { isoWeekday: 7, enabled: false },
    ],
    windows,
    overrides: populated && scenario !== 'policy'
      ? [
          { id: 1, localDate: '2026-08-10', intervals: [] },
          {
            id: 2,
            localDate: '2026-08-15',
            intervals: [
              { startMinute: 600, endMinute: 720 },
              { startMinute: 840, endMinute: 1020 },
            ],
          },
        ]
      : [],
    googleConnection: {
      status,
      identity: {
        calendarId: 'fixture-owner@example.com',
        summary: 'Cali Castle Fixture Calendar',
        email: 'fixture-owner@example.com',
      },
    },
    previewSlots:
      scenario === 'connected'
        ? [
            {
              startsAt: '2026-08-03T01:00:00.000Z',
              endsAt: '2026-08-03T02:00:00.000Z',
            },
            {
              startsAt: '2026-08-03T01:30:00.000Z',
              endsAt: '2026-08-03T02:30:00.000Z',
            },
            {
              startsAt: '2026-08-03T05:00:00.000Z',
              endsAt: '2026-08-03T06:00:00.000Z',
            },
            {
              startsAt: '2026-08-05T02:00:00.000Z',
              endsAt: '2026-08-05T03:00:00.000Z',
            },
            {
              startsAt: '2026-08-05T02:30:00.000Z',
              endsAt: '2026-08-05T03:30:00.000Z',
            },
            {
              startsAt: '2026-08-07T01:00:00.000Z',
              endsAt: '2026-08-07T02:00:00.000Z',
            },
          ]
        : [],
    previewDiagnosis:
      scenario === 'connected'
        ? 'open'
        : scenario === 'no-hours'
          ? 'no-configured-hours'
          : scenario === 'policy'
            ? 'no-policy-eligible-hours'
            : scenario === 'conflicts'
              ? 'calendar-conflicts'
              : scenario === 'booked'
                ? 'holds-or-bookings'
                : 'calendar-unavailable',
    publicBookingUrl: 'http://localhost:3000/ama/book',
    notices:
      scenario === 'denied' || scenario === 'unavailable'
        ? { calendar: status }
        : undefined,
    fixtureMode: true,
  }
}

async function AvailabilityFixture({
  searchParams,
}: {
  searchParams: FixtureSearchParams
}) {
  await requireOwnerPage('/admin/ama/fixtures/availability')
  const requested = firstSearchParam((await searchParams).scenario)
  const scenario = scenarios.includes(requested as Scenario)
    ? (requested as Scenario)
    : 'connected'

  return (
    <div className="pb-10">
      <FixtureHeader />
      <nav
        aria-label="Availability fixture scenario"
        className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-4"
      >
        {scenarios.map((option) => (
          <Link
            key={option}
            href={`/admin/ama/fixtures/availability?scenario=${option}`}
            aria-current={option === scenario ? 'page' : undefined}
            className={`flex min-h-11 items-center justify-center rounded-[2px] px-3 text-sm capitalize outline-none focus-visible:ring-1 focus-visible:ring-foreground ${
              option === scenario
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground'
            }`}
          >
            <T
              zh={scenarioLabels[option].zh}
              en={scenarioLabels[option].en}
            />
          </Link>
        ))}
      </nav>
      <AmaSettings {...fixtureProps(scenario)} />
    </div>
  )
}

export default function AdminAmaAvailabilityFixturePage({
  searchParams,
}: {
  searchParams: FixtureSearchParams
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <Suspense fallback={<AvailabilityFixtureFallback />}>
      <AvailabilityFixture searchParams={searchParams} />
    </Suspense>
  )
}

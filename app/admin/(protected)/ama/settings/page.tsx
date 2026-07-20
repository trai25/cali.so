import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AdminBackLink } from '~/components/admin-nav'
import { PixelCluster } from '~/components/pixel-cluster'
import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'
import { T } from '~/lib/i18n'
import { nonPublicRobots } from '~/lib/non-public-metadata'

import { AmaSettings } from '../AmaSettings'
import type { AmaSettingsNotices, GoogleConnectionStatus } from '../AmaSettings'

export const metadata: Metadata = {
  title: 'AMA Settings',
  robots: nonPublicRobots,
}

export const instant = true

const availabilityNotices = new Set(['saved', 'invalid', 'failed'] as const)
const calendarNotices = new Set([
  'disconnected',
  'connected',
  'expired',
  'revoked',
  'denied-scope',
  'unavailable',
] as const)

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function queryNotices(input: {
  availability?: string | string[]
  calendar?: string | string[]
}): AmaSettingsNotices {
  const availability = first(input.availability)
  const calendar = first(input.calendar)
  return {
    availability: availabilityNotices.has(
      availability as AmaSettingsNotices['availability'] & string,
    )
      ? (availability as AmaSettingsNotices['availability'])
      : undefined,
    calendar: calendarNotices.has(calendar as GoogleConnectionStatus)
      ? (calendar as GoogleConnectionStatus)
      : undefined,
  }
}

function connectionStatus(status: string | undefined): GoogleConnectionStatus {
  if (status === 'connected' || status === 'expired' || status === 'revoked') {
    return status
  }
  if (status === 'denied_scope') return 'denied-scope'
  if (status === 'error') return 'unavailable'
  return 'disconnected'
}

type SettingsSearchParams = Promise<{
  availability?: string | string[]
  calendar?: string | string[]
}>

function SettingsHeader() {
  return (
    <>
      <AdminBackLink href="/admin/ama">
        <T zh="咨询" en="AMA" />
      </AdminBackLink>
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-eyebrow">
          <T zh="设置" en="Settings" />
        </h1>
        <PixelCluster variant={7} className="shrink-0" />
      </div>
    </>
  )
}

function SettingsFallback() {
  return (
    <div className="pb-10" aria-busy="true">
      <SettingsHeader />
      <p className="mt-1 text-sm leading-6 text-muted-foreground">…</p>
      <div className="mt-6 hairline-top pt-5" aria-hidden>
        <span className="block h-4 w-full max-w-72 rounded-sm bg-surface-1" />
      </div>
    </div>
  )
}

async function SettingsLoader({
  searchParams,
}: {
  searchParams: SettingsSearchParams
}) {
  await requireOwnerPage('/admin/ama/settings')
  const { availability, google } = getAmaAdminServices()
  const [windows, connection, preview, params] = await Promise.all([
    availability.list(),
    google.getConnection(),
    availability.preview(),
    searchParams,
  ])

  const persistedStatus = connectionStatus(connection?.status)
  const status =
    persistedStatus === 'connected' && preview.status !== 'connected'
      ? preview.status
      : persistedStatus

  return (
    <>
      <SettingsHeader />
      <AmaSettings
        windows={windows.map(({ id, isoWeekday, startMinute, endMinute }) => ({
          id,
          isoWeekday,
          startMinute,
          endMinute,
        }))}
        googleConnection={{
          status,
          identity:
            connection?.calendarId && connection.status !== 'disconnected'
              ? {
                  calendarId: connection.calendarId,
                  summary: connection.calendarSummary,
                  email: connection.calendarEmail,
                }
              : null,
        }}
        previewSlots={preview.slots.map((slot) => ({
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        }))}
        notices={queryNotices(params)}
      />
    </>
  )
}

export default function AdminAmaSettingsPage({
  searchParams,
}: {
  searchParams: SettingsSearchParams
}) {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsLoader searchParams={searchParams} />
    </Suspense>
  )
}

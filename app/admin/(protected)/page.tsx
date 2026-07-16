import type { Metadata } from 'next'

import { requireOwnerPage } from '~/lib/admin/server'
import { getAmaAdminServices } from '~/lib/ama/admin/server'

import {
  AdminDashboard,
  type AdminQueryNotices,
  type GoogleConnectionStatus,
} from './AdminDashboard'

export const metadata: Metadata = {
  title: 'AMA Admin',
  robots: { index: false, follow: false },
}

// Admin account data intentionally renders per request.
export const instant = false

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
}): AdminQueryNotices {
  const availability = first(input.availability)
  const calendar = first(input.calendar)
  return {
    availability: availabilityNotices.has(
      availability as AdminQueryNotices['availability'] & string,
    )
      ? (availability as AdminQueryNotices['availability'])
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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    availability?: string | string[]
    calendar?: string | string[]
  }>
}) {
  await requireOwnerPage('/admin')
  const { availability, google } = getAmaAdminServices()
  const windowsPromise = availability.list()
  const connectionPromise = google.getConnection()
  const previewPromise = availability.preview()
  const [windows, connection, preview, params] = await Promise.all([
    windowsPromise,
    connectionPromise,
    previewPromise,
    searchParams,
  ])

  const persistedStatus = connectionStatus(connection?.status)
  const status =
    persistedStatus === 'connected' && preview.status !== 'connected'
      ? preview.status
      : persistedStatus

  return (
    <AdminDashboard
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
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import type { DurableOperationStatus } from '~/lib/ama/operations/repository'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'

import {
  BookingStatusBadge,
  OperationsList,
  OWNER_TIME_ZONE,
  providerLabels,
  refundStatusLabels,
  responseJson,
  zonedDateTime,
  type AlternateTimeRequestViewModel,
  type BookingRowViewModel,
  type OperationViewModel,
} from './shared'

export type AmaOperationsProps = {
  counts: Record<string, number>
  upcoming: BookingRowViewModel[]
  past: BookingRowViewModel[]
  attention: BookingRowViewModel[]
  timeRequests: AlternateTimeRequestViewModel[]
  operations: OperationViewModel[]
}

type BookingsTab = 'upcoming' | 'past' | 'attention'

const operationStatusOrder = [
  'pending',
  'running',
  'failed',
  'succeeded',
  'cancelled',
  'resolved',
] as const satisfies readonly DurableOperationStatus[]

const operationStatusStripLabels: Record<
  (typeof operationStatusOrder)[number],
  { zh: string; en: string }
> = {
  pending: { zh: '等待中', en: 'Pending' },
  running: { zh: '运行中', en: 'Running' },
  failed: { zh: '已失败', en: 'Failed' },
  succeeded: { zh: '已成功', en: 'Succeeded' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
  resolved: { zh: '已手动解决', en: 'Resolved' },
}

function StatusStrip({ counts }: { counts: Record<string, number> }) {
  return (
    <section aria-labelledby="operation-counts-heading" className="mt-8">
      <h2 id="operation-counts-heading" className="sr-only">
        <T zh="后台操作状态" en="Operation status counts" />
      </h2>
      <dl className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-surface-1 px-4 py-3 text-sm">
        {operationStatusOrder.map((status) => {
          const count = counts[status] ?? 0
          const label = operationStatusStripLabels[status]
          return (
            <div
              key={status}
              className={`flex items-baseline gap-1.5 ${
                status === 'failed' && count > 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}
            >
              <dt>
                <T zh={label.zh} en={label.en} />
              </dt>
              <dd className="tabular-nums">{count}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

function BookingRow({ booking }: { booking: BookingRowViewModel }) {
  const provider = providerLabels[booking.meetingProvider]
  return (
    <li>
      <Link
        href={`/admin/ama/bookings/${booking.id}`}
        className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-md px-2 py-3 text-sm outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-foreground"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{booking.guestName}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            <span className="tabular-nums">
              <T
                zh={zonedDateTime(booking.startsAt, OWNER_TIME_ZONE, 'zh')}
                en={zonedDateTime(booking.startsAt, OWNER_TIME_ZONE, 'en')}
              />
              {' '}(Asia/Taipei)
            </span>
            <span aria-hidden="true"> · </span>
            <span className="tabular-nums">
              <T
                zh={zonedDateTime(booking.startsAt, booking.guestTimeZone, 'zh')}
                en={zonedDateTime(booking.startsAt, booking.guestTimeZone, 'en')}
              />
              {' '}({booking.guestTimeZone})
            </span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted-foreground">
            <T zh={provider.zh} en={provider.en} />
          </span>
          <BookingStatusBadge status={booking.status} />
          {booking.refundStatus === 'failed' && (
            <span className="text-destructive">
              <T
                zh={refundStatusLabels.failed.zh}
                en={refundStatusLabels.failed.en}
              />
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

function BookingsSection({
  upcoming,
  past,
  attention,
}: {
  upcoming: BookingRowViewModel[]
  past: BookingRowViewModel[]
  attention: BookingRowViewModel[]
}) {
  const [tab, setTab] = useState<BookingsTab>('upcoming')
  const tabs = [
    { id: 'upcoming', zh: '即将进行', en: 'Upcoming', rows: upcoming },
    { id: 'past', zh: '已结束', en: 'Past', rows: past },
    { id: 'attention', zh: '需要关注', en: 'Needs attention', rows: attention },
  ] as const
  const rows = tabs.find((item) => item.id === tab)!.rows

  const emptyCopy = {
    upcoming: {
      zh: '没有即将进行的预约。',
      en: 'There are no upcoming Bookings.',
    },
    past: { zh: '还没有已结束的预约。', en: 'There are no past Bookings yet.' },
    attention: {
      zh: '没有需要关注的预约。',
      en: 'No Bookings need attention right now.',
    },
  } as const

  return (
    <section
      aria-labelledby="bookings-heading"
      className="mt-8 border-t border-dashed border-border pt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="bookings-heading" className="text-sm font-medium">
          <T zh="预约" en="Bookings" />
        </h2>
        <div className="flex items-center gap-1" role="tablist" aria-label="Booking view">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`min-h-11 rounded-md px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-foreground ${
                tab === item.id
                  ? 'bg-foreground text-background'
                  : item.id === 'attention' && item.rows.length > 0
                    ? 'text-destructive hover:bg-hover'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground'
              }`}
            >
              <T zh={`${item.zh} ${item.rows.length}`} en={`${item.en} ${item.rows.length}`} />
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-sm leading-6 text-muted-foreground">
          <T zh={emptyCopy[tab].zh} en={emptyCopy[tab].en} />
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {rows.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AlternateTimeRequestsSection({
  requests: initialRequests,
}: {
  requests: AlternateTimeRequestViewModel[]
}) {
  const locale = useLocale()
  const [requests, setRequests] = useState(initialRequests)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  async function act(
    request: AlternateTimeRequestViewModel,
    action: 'resolve' | 'dismiss',
  ) {
    setPending(`${request.id}:${action}`)
    setNotice(null)
    try {
      const response = await fetch(`/api/admin/ama/time-requests/${request.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await responseJson(response)
      setRequests((current) => current.filter((item) => item.id !== request.id))
      setNotice(
        action === 'resolve'
          ? localize(locale, '已标记为已处理。', 'Marked as resolved.')
          : localize(locale, '已忽略这条请求。', 'The request was dismissed.'),
      )
    } catch (error) {
      const code = error instanceof Error ? error.message : 'request_failed'
      setNotice(
        code === 'not_applicable'
          ? localize(
              locale,
              '这条请求已经处理过了。请刷新页面查看最新状态。',
              'This request was already handled. Refresh the page for the latest status.',
            )
          : localize(
              locale,
              '暂时无法更新这条请求，请再试一次。',
              'The request could not be updated. Try again.',
            ),
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <section
      aria-labelledby="time-requests-heading"
      className="mt-8 border-t border-dashed border-border pt-6"
    >
      <h2 id="time-requests-heading" className="text-sm font-medium">
        <T zh="其他时间请求" en="Alternate Time Requests" />
      </h2>
      {requests.length === 0 ? (
        <p className="py-6 text-sm leading-6 text-muted-foreground">
          <T zh="没有新的其他时间请求。" en="There are no new Alternate Time Requests." />
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4 text-sm"
            >
              <div className="min-w-0 max-w-xl">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="font-medium">{request.guestName}</span>
                  <span className="break-all text-muted-foreground">
                    {request.guestEmail}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span>{request.guestTimeZone}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="tabular-nums">
                    <T
                      zh={`${zonedDateTime(request.createdAt, OWNER_TIME_ZONE, 'zh')} 提交`}
                      en={`Sent ${zonedDateTime(request.createdAt, OWNER_TIME_ZONE, 'en')}`}
                    />
                    {' '}(Asia/Taipei)
                  </span>
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-6">
                  {request.preferredWindows}
                </p>
                {request.note && (
                  <p className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">
                    {request.note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void act(request, 'resolve')}
                  className="min-h-11 rounded-md border border-border px-3 text-sm font-medium outline-none disabled:opacity-50 focus-visible:border-foreground"
                >
                  {pending === `${request.id}:resolve` ? (
                    <T zh="正在标记…" en="Resolving…" />
                  ) : (
                    <T zh="标记已处理" en="Resolve" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void act(request, 'dismiss')}
                  className="min-h-11 px-3 text-sm text-muted-foreground outline-none disabled:opacity-50 focus-visible:rounded-sm focus-visible:ring-1 focus-visible:ring-foreground"
                >
                  {pending === `${request.id}:dismiss` ? (
                    <T zh="正在忽略…" en="Dismissing…" />
                  ) : (
                    <T zh="忽略" en="Dismiss" />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p
          ref={noticeRef}
          role="status"
          tabIndex={-1}
          className="mt-2 text-sm leading-5 text-muted-foreground outline-none"
        >
          {notice}
        </p>
      )}
    </section>
  )
}

export function AmaOperations({
  counts: initialCounts,
  upcoming,
  past,
  attention,
  timeRequests,
  operations,
}: AmaOperationsProps) {
  const [counts, setCounts] = useState(initialCounts)

  function reconcileCounts(from: DurableOperationStatus, to: DurableOperationStatus) {
    setCounts((current) => ({
      ...current,
      [from]: Math.max(0, (current[from] ?? 0) - 1),
      [to]: (current[to] ?? 0) + 1,
    }))
  }

  return (
    <div>
      <div>
        <h1 className="text-sm font-semibold">
          <T zh="AMA 运营" en="AMA Operations" />
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          <T
            zh="跟进预约、其他时间请求和需要人工恢复的后台操作。"
            en="Follow Bookings, Alternate Time Requests, and operations that need manual recovery."
          />
        </p>
      </div>

      <StatusStrip counts={counts} />

      <BookingsSection upcoming={upcoming} past={past} attention={attention} />

      <AlternateTimeRequestsSection requests={timeRequests} />

      <section
        aria-labelledby="operations-heading"
        className="mt-8 border-t border-dashed border-border pt-6"
      >
        <h2 id="operations-heading" className="text-sm font-medium">
          <T zh="未完成的后台操作" en="Unresolved operations" />
        </h2>
        <div className="mt-3">
          <OperationsList
            operations={operations}
            removeOnResolve
            onStatusChange={reconcileCounts}
          />
        </div>
      </section>
    </div>
  )
}

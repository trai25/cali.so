'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { SectionTag } from '~/components/section-tag'
import { Button } from '~/components/ui/button'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'

import {
  BookingStatusBadge,
  OperationsList,
  OWNER_TIME_ZONE,
  providerLabels,
  refundStatusLabels,
  responseJson,
  zonedDayKey,
  zonedDateTime,
  zonedTime,
  type AlternateTimeRequestViewModel,
  type BookingRowViewModel,
  type OperationViewModel,
} from './shared'

export type AmaOperationsProps = {
  view: BookingView
  bookings: BookingRowViewModel[]
  total: number
  page: number
  pageSize: number
  ownerTimeZone: string
  filters: BookingFiltersViewModel
  attentionTotal: number
  timeRequests: AlternateTimeRequestViewModel[]
  failedOperations: OperationViewModel[]
  basePath?: string
  fixtureMode?: boolean
}

export type BookingView = 'attention' | 'upcoming' | 'past' | 'cancelled'

export type BookingFiltersViewModel = {
  guestName: string
  guestEmail: string
  bookingId: string
  status: '' | BookingRowViewModel['status']
  from: string
  to: string
}

function BookingRow({
  booking,
  position,
  ownerTimeZone,
  detailBasePath,
  showPrep = false,
}: {
  booking: BookingRowViewModel
  position: number
  ownerTimeZone: string
  detailBasePath: string
  showPrep?: boolean
}) {
  const provider = providerLabels[booking.meetingProvider]
  const sameLocalDate =
    zonedDayKey(booking.startsAt, ownerTimeZone) ===
    zonedDayKey(booking.startsAt, booking.guestTimeZone)
  return (
    <li className="px-2 py-5 text-sm">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="section-tag shrink-0" aria-hidden>
          <span className="section-tag-index">
            {String(position).padStart(2, '0')}
          </span>
          <span className="section-tag-hatch" />
        </span>
        <Link
          href={`${detailBasePath}/${booking.id}`}
          className="rounded-[2px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-foreground"
        >
          {booking.guestName}
        </Link>
        <span className="break-all font-mono text-xs text-muted-foreground">
          {booking.guestEmail}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {booking.id.slice(0, 8)}
        </span>
      </div>

      <dl className="spec-nameplate spec-nameplate-compact">
        <div>
          <dt>
            <T zh="时间" en="Time" />
          </dt>
          <dd className="min-w-0 text-muted-foreground">
            <span data-booking-time="owner" className="block tabular-nums">
              <T
                zh={zonedDateTime(booking.startsAt, ownerTimeZone, 'zh')}
                en={zonedDateTime(booking.startsAt, ownerTimeZone, 'en')}
              />
              {' '}({ownerTimeZone})
            </span>
            <span data-booking-time="guest" className="mt-1 block tabular-nums">
              <T
                zh={
                  sameLocalDate
                    ? zonedTime(booking.startsAt, booking.guestTimeZone, 'zh')
                    : zonedDateTime(booking.startsAt, booking.guestTimeZone, 'zh')
                }
                en={
                  sameLocalDate
                    ? zonedTime(booking.startsAt, booking.guestTimeZone, 'en')
                    : zonedDateTime(booking.startsAt, booking.guestTimeZone, 'en')
                }
              />
              {' '}({booking.guestTimeZone})
            </span>
          </dd>
        </div>

        {booking.topics.length > 0 && (
          <div>
            <dt>
              <T zh="话题" en="Topics" />
            </dt>
            <dd className="min-w-0 text-muted-foreground">
              {booking.topics.join(', ')}
            </dd>
          </div>
        )}

        <div>
          <dt>
            <T zh="预约简述" en="Brief" />
          </dt>
          <dd
            data-booking-brief
            className="min-w-0 whitespace-pre-wrap leading-5 text-muted-foreground"
          >
            {booking.briefPreview ? (
              booking.briefPreview
            ) : (
              <T zh="没有预约简述" en="No Booking Brief" />
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
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
        <span aria-hidden="true" className="blog-row-leader hidden sm:block" />
        <Button asChild variant="ghost" size="lg" expandHitArea>
          <Link href={`${detailBasePath}/${booking.id}`}>
            <T zh="查看预约" en="View Booking" />
          </Link>
        </Button>
        {showPrep && booking.meetingUrl && (
          <Button asChild variant="primary" size="lg" expandHitArea>
            <a href={booking.meetingUrl} target="_blank" rel="noreferrer">
              <T zh="加入会议" en="Join meeting" />
            </a>
          </Button>
        )}
        {booking.calendarUrl && (
          <Button asChild variant="ghost" size="lg" expandHitArea>
            <a href={booking.calendarUrl} target="_blank" rel="noreferrer">
              <T zh="在日历中打开" en="Open in Google Calendar" />
            </a>
          </Button>
        )}
      </div>
    </li>
  )
}

function AlternateTimeRequests({
  requests: initialRequests,
  onHandled,
  fixtureMode = false,
}: {
  requests: AlternateTimeRequestViewModel[]
  onHandled?: () => void
  fixtureMode?: boolean
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
      if (!fixtureMode) {
        const response = await fetch(`/api/admin/ama/time-requests/${request.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        await responseJson(response)
      }
      setRequests((current) => current.filter((item) => item.id !== request.id))
      onHandled?.()
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

  if (requests.length === 0 && !notice) return null

  return (
    <div>
      {requests.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">
            <T zh="其他时间请求" en="Alternate Time Requests" />
          </h3>
          <ul className="mt-1 divide-y divide-border/70">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4 text-sm"
              >
                <div className="min-w-0 max-w-xl">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-medium">{request.guestName}</span>
                    <span className="break-all font-mono text-xs text-muted-foreground">
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
                {/* Dense stacked rows: the row itself is the tap target — no
                    hit-area extension on these compact pills. */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending !== null}
                    loading={pending === `${request.id}:resolve`}
                    onClick={() => void act(request, 'resolve')}
                  >
                    <T zh="标记已处理" en="Resolve" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null}
                    loading={pending === `${request.id}:dismiss`}
                    onClick={() => void act(request, 'dismiss')}
                  >
                    <T zh="忽略" en="Dismiss" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
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
    </div>
  )
}

const viewLabels: Record<BookingView, { zh: string; en: string }> = {
  attention: { zh: '需要处理', en: 'Needs attention' },
  upcoming: { zh: '即将进行', en: 'Upcoming' },
  past: { zh: '已结束', en: 'Past' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
}

function BookingFilters({
  view,
  filters,
  ownerTimeZone,
  basePath,
}: {
  view: BookingView
  filters: BookingFiltersViewModel
  ownerTimeZone: string
  basePath: string
}) {
  const locale = useLocale()
  const hasFilters = Object.values(filters).some(Boolean)
  const inputClassName =
    'min-h-11 rounded-[2px] border border-border bg-transparent px-3 text-base outline-none focus-visible:ring-1 focus-visible:ring-foreground'

  return (
    <form
      action={basePath}
      method="get"
      className="mt-5 rounded-[2px] bg-surface-1 px-4 py-4"
    >
      <input type="hidden" name="view" value={view} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="访客姓名" en="Guest name" />
          </span>
          <input
            type="search"
            name="guestName"
            defaultValue={filters.guestName}
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore
            className={inputClassName}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="访客邮箱" en="Guest email" />
          </span>
          <input
            type="email"
            name="guestEmail"
            defaultValue={filters.guestEmail}
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore
            className={`${inputClassName} font-mono`}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="预约 ID" en="Booking id" />
          </span>
          <input
            type="search"
            name="bookingId"
            defaultValue={filters.bookingId}
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore
            className={`${inputClassName} font-mono`}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="状态" en="Status" />
          </span>
          <select
            name="status"
            defaultValue={filters.status}
            className={inputClassName}
          >
            <option value="">{localize(locale, '全部状态', 'All statuses')}</option>
            <option value="finalizing">
              {localize(locale, '正在敲定', 'Finalizing')}
            </option>
            <option value="confirmed">
              {localize(locale, '已确认', 'Confirmed')}
            </option>
            <option value="needs_reschedule">
              {localize(locale, '需要改期', 'Needs reschedule')}
            </option>
            <option value="cancelled">
              {localize(locale, '已取消', 'Cancelled')}
            </option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="开始日期" en="From date" />
          </span>
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className={`${inputClassName} font-mono tabular-nums`}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">
            <T zh="结束日期" en="To date" />
          </span>
          <input
            type="date"
            name="to"
            defaultValue={filters.to}
            className={`${inputClassName} font-mono tabular-nums`}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <T
          zh={`日期按 ${ownerTimeZone} 解释。`}
          en={`Dates use ${ownerTimeZone}.`}
        />
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {hasFilters && (
          <Button asChild variant="ghost" size="lg" expandHitArea>
            <Link href={`${basePath}?view=${view}`}>
              <T zh="清除筛选" en="Clear filters" />
            </Link>
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" expandHitArea>
          <T zh="筛选预约" en="Filter Bookings" />
        </Button>
      </div>
    </form>
  )
}

export function AmaOperations({
  view,
  bookings,
  total,
  page,
  pageSize,
  ownerTimeZone,
  filters,
  attentionTotal,
  timeRequests,
  failedOperations,
  basePath = '/admin/ama/bookings',
  fixtureMode = false,
}: AmaOperationsProps) {
  const locale = useLocale()
  const [handledCount, setHandledCount] = useState(0)
  const remainingAttention = Math.max(0, attentionTotal - handledCount)
  const hasFilters = Object.values(filters).some(Boolean)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1
  const lastResult = Math.min(total, page * pageSize)
  const allClear =
    bookings.length === 0 &&
    failedOperations.length === 0 &&
    timeRequests.length === 0

  function hrefFor(nextView: BookingView, nextPage = 1) {
    const params = new URLSearchParams({ view: nextView })
    if (filters.guestName) params.set('guestName', filters.guestName)
    if (filters.guestEmail) params.set('guestEmail', filters.guestEmail)
    if (filters.bookingId) params.set('bookingId', filters.bookingId)
    if (filters.status) params.set('status', filters.status)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (nextPage > 1) params.set('page', String(nextPage))
    return `${basePath}?${params.toString()}`
  }

  const emptyCopy: Record<BookingView, { zh: string; en: string }> = {
    attention: hasFilters
      ? {
          zh: '没有符合筛选条件的待处理预约。',
          en: 'No attention Bookings match these filters.',
        }
      : { zh: '一切正常。', en: 'All clear.' },
    upcoming: hasFilters
      ? {
          zh: '没有符合筛选条件的即将进行预约。',
          en: 'No upcoming Bookings match these filters.',
        }
      : {
          zh: '没有即将进行的预约。',
          en: 'There are no upcoming Bookings.',
        },
    past: hasFilters
      ? {
          zh: '没有符合筛选条件的已结束预约。',
          en: 'No past Bookings match these filters.',
        }
      : { zh: '还没有已结束的预约。', en: 'There are no past Bookings yet.' },
    cancelled: hasFilters
      ? {
          zh: '没有符合筛选条件的已取消预约。',
          en: 'No cancelled Bookings match these filters.',
        }
      : { zh: '没有已取消的预约。', en: 'There are no cancelled Bookings.' },
  }

  return (
    <div className="pb-10">
      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
        {total} <T zh="条结果" en={total === 1 ? 'result' : 'results'} />
        {' · '}
        {remainingAttention} <T zh="项待处理" en="to handle" />
      </p>

      <nav
        aria-label={localize(locale, '预约视图', 'Booking views')}
        className="mt-5 grid grid-cols-2 gap-1 hairline-top pt-4 sm:grid-cols-4"
      >
        {(Object.keys(viewLabels) as BookingView[]).map((option) => {
          const selected = option === view
          const label = viewLabels[option]
          return (
            <Link
              key={option}
              href={hrefFor(option)}
              aria-current={selected ? 'page' : undefined}
              className={`flex min-h-11 items-center justify-center rounded-[2px] px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-foreground ${
                selected
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-hover hover:text-foreground'
              }`}
            >
              <T zh={label.zh} en={label.en} />
            </Link>
          )
        })}
      </nav>

      <BookingFilters
        view={view}
        filters={filters}
        ownerTimeZone={ownerTimeZone}
        basePath={basePath}
      />

      <section
        aria-labelledby="booking-view-heading"
        className="mt-8 hairline-top pt-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <SectionTag index={1} id="booking-view-heading">
            <T zh={viewLabels[view].zh} en={viewLabels[view].en} />
          </SectionTag>
          <span className="text-sm text-muted-foreground tabular-nums">
            <T
              zh={`${firstResult}–${lastResult}，共 ${total} 条`}
              en={`${firstResult}–${lastResult} of ${total}`}
            />
          </span>
        </div>

        {bookings.length === 0 && (view !== 'attention' || allClear) ? (
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            <p>
              <T zh={emptyCopy[view].zh} en={emptyCopy[view].en} />
            </p>
            {view === 'upcoming' && !hasFilters && (
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="mt-2"
                expandHitArea
              >
                <Link
                  href={
                    fixtureMode
                      ? '/admin/ama/fixtures/availability'
                      : '/admin/ama/settings'
                  }
                >
                  <T zh="检查可预约时间" en="Check Availability settings" />
                </Link>
              </Button>
            )}
          </div>
        ) : (
          bookings.length > 0 && (
            <ul className="mt-3 divide-y divide-border/70">
              {bookings.map((booking, index) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  position={firstResult + index}
                  ownerTimeZone={ownerTimeZone}
                  detailBasePath={basePath}
                  showPrep={view === 'upcoming'}
                />
              ))}
            </ul>
          )
        )}

        {view === 'attention' && (
          <>
            {failedOperations.length > 0 && (
              <div className="mt-4 hairline-top pt-3">
                <h3 className="text-sm font-medium">
                  <T zh="失败的后台操作" en="Failed operations" />
                </h3>
                <OperationsList
                  operations={failedOperations}
                  removeOnResolve
                  fixtureMode={fixtureMode}
                  bookingBasePath={basePath}
                  onStatusChange={(from) => {
                    if (from === 'failed') {
                      setHandledCount((count) => count + 1)
                    }
                  }}
                />
              </div>
            )}
            <AlternateTimeRequests
              requests={timeRequests}
              fixtureMode={fixtureMode}
              onHandled={() => setHandledCount((count) => count + 1)}
            />
          </>
        )}

        {pageCount > 1 && (
          <nav
            aria-label={localize(locale, '预约分页', 'Booking pagination')}
            className="mt-5 flex min-h-11 items-center justify-between gap-3 hairline-top pt-4"
          >
            {page > 1 ? (
              <Button asChild variant="ghost" size="lg" expandHitArea>
                <Link href={hrefFor(view, page - 1)}>
                  <T zh="上一页" en="Previous" />
                </Link>
              </Button>
            ) : (
              <span />
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              <T
                zh={`第 ${page}/${pageCount} 页`}
                en={`Page ${page} of ${pageCount}`}
              />
            </span>
            {page < pageCount ? (
              <Button asChild variant="ghost" size="lg" expandHitArea>
                <Link href={hrefFor(view, page + 1)}>
                  <T zh="下一页" en="Next" />
                </Link>
              </Button>
            ) : (
              <span />
            )}
          </nav>
        )}
      </section>
    </div>
  )
}

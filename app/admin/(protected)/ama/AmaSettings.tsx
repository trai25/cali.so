'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { SectionTag } from '~/components/section-tag'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select'
import { T } from '~/lib/i18n'

import {
  AvailabilityWeekdayForm,
  type AvailabilityWindowViewModel,
} from './AvailabilityWeekdayForm'
import {
  DateOverrideForm,
  type DateOverrideViewModel,
} from './DateOverrideForm'
import { AMA_WEEKDAYS, formatScheduleMinute } from './scheduling-fields'

export type { AvailabilityWindowViewModel } from './AvailabilityWeekdayForm'

export type GoogleCalendarIdentityViewModel = {
  calendarId: string
  summary: string | null
  email: string | null
}

export type GoogleConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'denied-scope'
  | 'unavailable'

export type GoogleConnectionViewModel = {
  status: GoogleConnectionStatus
  identity: GoogleCalendarIdentityViewModel | null
}

export type PreviewSlotViewModel = {
  startsAt: string
  endsAt: string
}

export type AvailabilityWeekdayViewModel = {
  isoWeekday: number
  enabled: boolean
}

export type PreviewDiagnosis =
  | 'open'
  | 'calendar-unavailable'
  | 'no-configured-hours'
  | 'no-policy-eligible-hours'
  | 'calendar-conflicts'
  | 'holds-or-bookings'

export type AmaSettingsNotices = {
  availability?:
    | 'saved'
    | 'invalid'
    | 'invalid-time-zone'
    | 'invalid-override'
    | 'invalid-copy'
    | 'failed'
  calendar?: GoogleConnectionStatus
}

export type AmaSettingsProps = {
  timeZone: string
  weekdays?: readonly AvailabilityWeekdayViewModel[]
  windows: readonly AvailabilityWindowViewModel[]
  overrides: readonly DateOverrideViewModel[]
  googleConnection: GoogleConnectionViewModel
  previewSlots: readonly PreviewSlotViewModel[]
  previewDiagnosis?: PreviewDiagnosis
  publicBookingUrl: string
  notices?: AmaSettingsNotices
  fixtureMode?: boolean
}

const previewLimit = 12

function listTimeZones(selected: string) {
  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : []
  return zones.includes(selected) ? zones : [selected, ...zones]
}

function QueryNotices({
  notices,
  restoreFocus = false,
}: {
  notices: AmaSettingsNotices | undefined
  restoreFocus?: boolean
}) {
  const noticeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (restoreFocus) noticeRef.current?.focus()
  }, [restoreFocus])

  if (!notices?.availability && !notices?.calendar) return null

  const availabilityCopy = {
    saved: { zh: '可预约时段已保存。', en: 'Availability Windows saved.' },
    invalid: {
      zh: '这个时段无效。请确认星期和起止时间。',
      en: 'That window is invalid. Check its day and start and end times.',
    },
    'invalid-time-zone': {
      zh: '请选择有效的 IANA 时区。',
      en: 'Choose a valid IANA time zone.',
    },
    'invalid-override': {
      zh: '日期覆盖无效。请检查日期和每个时段。',
      en: 'That date override is invalid. Check the date and every interval.',
    },
    'invalid-copy': {
      zh: '请选择至少一个要复制到的星期。',
      en: 'Choose at least one weekday to copy these hours to.',
    },
    failed: {
      zh: '暂时无法保存时段，请重试。',
      en: 'The Availability Window could not be saved. Try again.',
    },
  } as const
  const calendarCopy = {
    disconnected: { zh: 'Google 日历已断开。', en: 'Google Calendar disconnected.' },
    connected: { zh: 'Google 日历已连接。', en: 'Google Calendar connected.' },
    expired: {
      zh: 'Google 连接流程已过期，请重新连接。',
      en: 'The Google connection attempt expired. Connect again.',
    },
    revoked: {
      zh: 'Google 授权已撤销，请重新连接。',
      en: 'Google access was revoked. Connect again.',
    },
    'denied-scope': {
      zh: '没有授予所需的日历权限，请重新连接并允许两项权限。',
      en: 'The required Calendar permissions were not granted. Connect again and allow both.',
    },
    unavailable: {
      zh: '暂时无法联系 Google，请稍后重试。',
      en: 'Google is unavailable right now. Try again shortly.',
    },
  } as const

  const availability = notices.availability
    ? availabilityCopy[notices.availability]
    : null
  const calendar = notices.calendar ? calendarCopy[notices.calendar] : null
  const isAlert =
    (notices.availability !== undefined &&
      notices.availability !== 'saved') ||
    (notices.calendar !== undefined &&
      notices.calendar !== 'connected' &&
      notices.calendar !== 'disconnected')

  return (
    <div
      ref={noticeRef}
      id={availability ? 'availability-notice' : 'calendar-notice'}
      role={isAlert ? 'alert' : 'status'}
      tabIndex={restoreFocus ? -1 : undefined}
      className="mt-4 rounded-md bg-surface-1 px-4 py-3 text-sm leading-6 outline-none"
    >
      {availability && <T zh={availability.zh} en={availability.en} />}
      {availability && calendar && ' '}
      {calendar && <T zh={calendar.zh} en={calendar.en} />}
    </div>
  )
}

function ScheduleTimeZoneForm({
  timeZone,
  describedBy,
  fixtureMode,
}: {
  timeZone: string
  describedBy?: string
  fixtureMode: boolean
}) {
  const [selected, setSelected] = useState(timeZone)
  const [pending, setPending] = useState(false)
  const timeZones = useMemo(() => listTimeZones(timeZone), [timeZone])

  function submit(event: FormEvent<HTMLFormElement>) {
    if (fixtureMode) {
      event.preventDefault()
      return
    }
    setPending(true)
  }

  return (
    <form
      action="/api/admin/ama/availability"
      method="post"
      aria-describedby={describedBy}
      className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      onSubmit={submit}
    >
      <input type="hidden" name="intent" value="set-time-zone" />
      <div className="grid gap-1.5 text-sm">
        <span id="schedule-time-zone-label" className="text-muted-foreground">
          <T zh="时区" en="Time zone" />
        </span>
        <Select
          name="timeZone"
          value={selected}
          onValueChange={setSelected}
          readOnly={pending}
        >
          <SelectTrigger
            aria-labelledby="schedule-time-zone-label"
            className="w-full rounded-[2px] font-mono text-[13px]"
            disabled={pending}
          />
          <SelectContent>
            {timeZones.map((zone, index) => (
              <SelectItem
                key={zone}
                value={zone}
                index={index}
                className="font-mono text-[13px]"
              >
                {zone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending || selected === timeZone}
        loading={pending}
        expandHitArea
      >
        <T zh="保存时区" en="Save time zone" />
      </Button>
    </form>
  )
}

function WeekdaySchedule({
  weekday,
  enabled,
  windows,
  describedBy,
  fixtureMode,
}: {
  weekday: (typeof AMA_WEEKDAYS)[number]
  enabled: boolean
  windows: readonly AvailabilityWindowViewModel[]
  describedBy?: string
  fixtureMode: boolean
}) {
  const [copying, setCopying] = useState(false)
  const [pending, setPending] = useState(false)
  const [fixtureEnabled, setFixtureEnabled] = useState(enabled)
  const [toggleArmed, setToggleArmed] = useState(false)
  const currentEnabled = fixtureMode ? fixtureEnabled : enabled

  function mutation(event: FormEvent<HTMLFormElement>) {
    if (fixtureMode) {
      event.preventDefault()
      return
    }
    setPending(true)
  }

  function toggle(event: FormEvent<HTMLFormElement>) {
    if (!toggleArmed) {
      event.preventDefault()
      setToggleArmed(true)
      setCopying(false)
      return
    }
    if (fixtureMode) {
      event.preventDefault()
      setFixtureEnabled((value) => !value)
      setToggleArmed(false)
      return
    }
    setPending(true)
  }

  return (
    <section
      className="hairline-top py-4"
      aria-labelledby={`weekday-${weekday.value}`}
    >
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 id={`weekday-${weekday.value}`} className="text-sm font-medium">
            <T zh={weekday.zh} en={weekday.en} />
          </h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentEnabled ? (
              <T
                zh={`已保存 ${windows.length} 个时段`}
                en={`${windows.length} saved ${windows.length === 1 ? 'interval' : 'intervals'}`}
              />
            ) : (
              <T
                zh={windows.length > 0 ? `关闭 · 保留 ${windows.length} 个时段` : '关闭'}
                en={
                  windows.length > 0
                    ? `Off · ${windows.length} saved ${windows.length === 1 ? 'interval' : 'intervals'}`
                    : 'Off'
                }
              />
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {currentEnabled && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              active={copying}
              disabled={pending}
              aria-expanded={copying}
              onClick={() => setCopying((value) => !value)}
              expandHitArea
            >
              <T zh="复制" en="Copy" />
            </Button>
          )}
          <form
            action="/api/admin/ama/availability"
            method="post"
            onSubmit={toggle}
          >
            <input type="hidden" name="intent" value="set-weekday" />
            <input type="hidden" name="weekday" value={weekday.value} />
            <input
              type="hidden"
              name="enabled"
              value={String(!currentEnabled)}
            />
            <Button
              type="submit"
              variant={currentEnabled ? 'tertiary' : 'primary'}
              size="lg"
              aria-pressed={currentEnabled}
              disabled={pending}
              loading={pending}
              destructive={toggleArmed && currentEnabled}
              expandHitArea
            >
              {toggleArmed ? (
                currentEnabled ? (
                  <T zh="确认关闭？" en="Turn off?" />
                ) : (
                  <T zh="确认开启？" en="Turn on?" />
                )
              ) : currentEnabled ? (
                <T zh="开启" en="On" />
              ) : (
                <T zh="关闭" en="Off" />
              )}
            </Button>
          </form>
          {toggleArmed && !pending && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => setToggleArmed(false)}
              expandHitArea
            >
              <T zh="取消" en="Cancel" />
            </Button>
          )}
        </div>
      </div>

      {currentEnabled && (
        <div className="mt-2">
          <AvailabilityWeekdayForm
            isoWeekday={weekday.value}
            windows={windows}
            describedBy={describedBy}
            fixtureMode={fixtureMode}
          />
        </div>
      )}

      {copying && (
        <form
          action="/api/admin/ama/availability"
          method="post"
          aria-describedby={describedBy}
          className="mt-4 rounded-[2px] bg-surface-1 px-4 py-4"
          onSubmit={mutation}
        >
          <input type="hidden" name="intent" value="copy-weekday" />
          <input type="hidden" name="weekday" value={weekday.value} />
          <fieldset disabled={pending}>
            <legend className="text-sm text-muted-foreground">
              <T zh="复制到" en="Copy to" />
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {AMA_WEEKDAYS
                .filter((target) => target.value !== weekday.value)
                .map((target) => (
                  <label
                    key={target.value}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[2px] px-2 text-sm hover:bg-hover"
                  >
                    <input
                      type="checkbox"
                      name="targetWeekday"
                      value={target.value}
                      className="size-4 accent-current"
                    />
                    <T zh={target.zh} en={target.en} />
                  </label>
                ))}
            </div>
          </fieldset>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={pending}
              onClick={() => setCopying(false)}
              expandHitArea
            >
              <T zh="取消" en="Cancel" />
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={pending}
              loading={pending}
              expandHitArea
            >
              <T zh="复制时段" en="Copy intervals" />
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

function DateOverrideItem({
  override,
  describedBy,
  fixtureMode,
}: {
  override: DateOverrideViewModel
  describedBy?: string
  fixtureMode: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [pending, setPending] = useState(false)

  function remove(event: FormEvent<HTMLFormElement>) {
    if (!deleteArmed) {
      event.preventDefault()
      setDeleteArmed(true)
      return
    }
    if (fixtureMode) {
      event.preventDefault()
      setDeleteArmed(false)
      return
    }
    setPending(true)
  }

  return (
    <li className="py-4">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <div>
          <time
            dateTime={override.localDate}
            className="font-mono text-sm tabular-nums"
          >
            {override.localDate}
          </time>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {override.intervals.length === 0 ? (
              <T zh="关闭预约" en="Closed" />
            ) : (
              override.intervals.map((interval, index) => (
                <span key={`${interval.startMinute}-${interval.endMinute}`}>
                  {index > 0 && ', '}
                  {formatScheduleMinute(interval.startMinute)}–
                  {formatScheduleMinute(interval.endMinute)}
                </span>
              ))
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            active={editing}
            disabled={pending}
            aria-expanded={editing}
            onClick={() => setEditing((value) => !value)}
            expandHitArea
          >
            <T zh="编辑" en="Edit" />
          </Button>
          <form
            action="/api/admin/ama/availability"
            method="post"
            aria-describedby={describedBy}
            onSubmit={remove}
          >
            <input type="hidden" name="intent" value="delete-override" />
            <input type="hidden" name="localDate" value={override.localDate} />
            <Button
              type="submit"
              variant="ghost"
              size="lg"
              destructive={deleteArmed}
              disabled={pending}
              loading={pending}
              expandHitArea
            >
              {deleteArmed ? (
                <T zh="确认删除？" en="Confirm delete?" />
              ) : (
                <T zh="删除" en="Delete" />
              )}
            </Button>
          </form>
          {deleteArmed && !pending && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => setDeleteArmed(false)}
              expandHitArea
            >
              <T zh="取消" en="Cancel" />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3">
          <DateOverrideForm
            override={override}
            describedBy={describedBy}
            fixtureMode={fixtureMode}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  )
}

function DateOverridesSection({
  overrides,
  describedBy,
  fixtureMode,
}: {
  overrides: readonly DateOverrideViewModel[]
  describedBy?: string
  fixtureMode: boolean
}) {
  const [adding, setAdding] = useState(false)

  return (
    <section
      className="mt-8 hairline-top pt-6"
      aria-labelledby="overrides-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <SectionTag index={2} id="overrides-heading">
            <T zh="日期覆盖" en="Date overrides" />
          </SectionTag>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <T
              zh="某一天可以完全关闭，也可以用自定义时段替代每周安排。"
              en="Close a date or replace its weekly hours with custom intervals."
            />
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          active={adding}
          aria-expanded={adding}
          onClick={() => setAdding((value) => !value)}
          expandHitArea
        >
          <T zh="添加覆盖" en="Add override" />
        </Button>
      </div>

      {adding && (
        <div className="mt-4">
          <DateOverrideForm
            describedBy={describedBy}
            fixtureMode={fixtureMode}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {overrides.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          <T
            zh="没有日期覆盖。每一天都会使用每周安排。"
            en="No date overrides. Every date follows the weekly schedule."
          />
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border/70">
          {overrides.map((override) => (
            <DateOverrideItem
              key={override.id}
              override={override}
              describedBy={describedBy}
              fixtureMode={fixtureMode}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReadinessSection({
  weekdays,
  windows,
  overrides,
  connection,
  slots,
  diagnosis,
  publicBookingUrl,
}: {
  weekdays: readonly AvailabilityWeekdayViewModel[]
  windows: readonly AvailabilityWindowViewModel[]
  overrides: readonly DateOverrideViewModel[]
  connection: GoogleConnectionViewModel
  slots: readonly PreviewSlotViewModel[]
  diagnosis: PreviewDiagnosis
  publicBookingUrl: string
}) {
  const [copied, setCopied] = useState(false)
  const copiedTimerRef = useRef<number | null>(null)
  const hasHours =
    windows.some(
      (window) =>
        weekdays.find(
          (weekday) => weekday.isoWeekday === window.isoWeekday,
        )?.enabled !== false,
    ) ||
    overrides.some((override) => override.intervals.length > 0)

  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current)
      }
    },
    [],
  )

  const calendarFailures: Record<Exclude<GoogleConnectionStatus, 'connected'>, {
    zh: string
    en: string
  }> = {
    disconnected: {
      zh: '连接 Google 日历后，才能在发布开放时间前检查冲突。',
      en: 'Connect Google Calendar to check conflicts before publishing open times.',
    },
    expired: {
      zh: 'Google 连接已过期。请重新连接后再开放预约。',
      en: 'The Google connection expired. Reconnect before opening bookings.',
    },
    revoked: {
      zh: 'Google 已撤销访问权限。请重新连接后再开放预约。',
      en: 'Google access was revoked. Reconnect before opening bookings.',
    },
    'denied-scope': {
      zh: '缺少事件和忙闲权限。重新连接并允许两项权限。',
      en: 'Event and free/busy permissions are missing. Reconnect and allow both.',
    },
    unavailable: {
      zh: '目前无法检查 Google 日历。恢复连接前不会发布开放时间。',
      en: 'Google Calendar cannot be checked. Open times stay unpublished until it recovers.',
    },
  }

  const previewFailures: Record<
    Exclude<PreviewDiagnosis, 'open'>,
    { zh: string; en: string }
  > = {
    'calendar-unavailable': {
      zh: '日历恢复后才能生成开放时间预览。',
      en: 'Open-time preview is blocked until Calendar is healthy.',
    },
    'no-configured-hours': {
      zh: '没有已启用的每周时段或自定义日期时段。',
      en: 'No enabled weekly or custom date hours are configured.',
    },
    'no-policy-eligible-hours': {
      zh: '已保存的时段无法满足 60 分钟、提前 24 小时和未来 30 天的规则。',
      en: 'Saved hours produce no 60-minute times inside the 24-hour notice and 30-day policy.',
    },
    'calendar-conflicts': {
      zh: '符合规则的时间都被 Google 日历中的忙碌安排占用。',
      en: 'Google Calendar conflicts block every policy-eligible time.',
    },
    'holds-or-bookings': {
      zh: '符合规则且日历空闲的时间都被暂存或现有预约占用。',
      en: 'Active holds or existing Bookings block every remaining time.',
    },
  }

  const calendarBroken = [
    'expired',
    'revoked',
    'denied-scope',
    'unavailable',
  ].includes(connection.status)

  const checks = [
    hasHours
      ? {
          ready: true,
          broken: false,
          zh: '至少有一个可预约时段。',
          en: 'At least one availability interval is configured.',
        }
      : {
          ready: false,
          broken: false,
          zh: '开启至少一天，或添加带自定义时段的日期覆盖。',
          en: 'Turn on at least one weekday or add a date override with custom hours.',
        },
    connection.status === 'connected'
      ? {
          ready: true,
          broken: false,
          zh: 'Google 日历已连接，可以检查冲突。',
          en: 'Google Calendar is connected and conflict checks are available.',
        }
      : {
          ready: false,
          broken: calendarBroken,
          ...calendarFailures[connection.status],
        },
    diagnosis === 'open' && slots.length > 0
      ? {
          ready: true,
          broken: false,
          zh: `未来 30 天有 ${slots.length} 个开放时间。`,
          en: `${slots.length} open ${slots.length === 1 ? 'time' : 'times'} in the next 30 days.`,
        }
      : {
          ready: false,
          broken: diagnosis === 'calendar-unavailable' && calendarBroken,
          ...previewFailures[
            diagnosis === 'open' ? 'no-policy-eligible-hours' : diagnosis
          ],
        },
  ]

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicBookingUrl)
      setCopied(true)
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current)
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section
      className="mt-8 hairline-top pt-6"
      aria-labelledby="readiness-heading"
    >
      <SectionTag index={4} id="readiness-heading">
        <T zh="上线检查" en="Readiness checklist" />
      </SectionTag>
      <ul className="mt-3 divide-y divide-border/70">
        {checks.map((check, index) => (
          <li key={index} className="flex min-h-11 items-start gap-3 py-3 text-sm">
            <span
              aria-hidden="true"
              className={`mt-2 size-1.5 shrink-0 rounded-full ${
                check.ready
                  ? 'bg-foreground'
                  : check.broken
                    ? 'bg-destructive'
                    : 'bg-muted-foreground'
              }`}
            />
            <span className="tabular-nums">
              <T zh={check.zh} en={check.en} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="primary" size="lg" expandHitArea>
          <a href={publicBookingUrl} target="_blank" rel="noreferrer">
            <T zh="查看公开预约页" en="View public booking page" />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="min-w-[7rem]"
          onClick={() => void copyLink()}
          expandHitArea
        >
          {copied ? (
            <T zh="已复制" en="Copied" />
          ) : (
            <T zh="复制预约链接" en="Copy booking link" />
          )}
        </Button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? <T zh="预约链接已复制" en="Booking link copied" /> : null}
        </span>
      </div>
    </section>
  )
}

function GoogleCalendarSection({
  connection,
  notice,
  restoreNoticeFocus,
  fixtureMode,
}: {
  connection: GoogleConnectionViewModel
  notice?: GoogleConnectionStatus
  restoreNoticeFocus: boolean
  fixtureMode: boolean
}) {
  const [pending, setPending] = useState<'connect' | 'disconnect' | null>(null)
  const [disconnectArmed, setDisconnectArmed] = useState(false)

  function connect(event: FormEvent<HTMLFormElement>) {
    if (pending !== null) {
      event.preventDefault()
      return
    }
    if (fixtureMode) {
      event.preventDefault()
      return
    }
    setPending('connect')
  }

  function disconnect(event: FormEvent<HTMLFormElement>) {
    if (pending !== null) {
      event.preventDefault()
      return
    }
    if (!disconnectArmed) {
      event.preventDefault()
      setDisconnectArmed(true)
      return
    }
    if (fixtureMode) {
      event.preventDefault()
      setDisconnectArmed(false)
      return
    }
    setPending('disconnect')
  }

  const stateCopy = {
    disconnected: {
      zh: '尚未连接。连接后会用 Google 日历排除已有安排。',
      en: 'Not connected. Connect to exclude existing events from availability.',
    },
    connected: {
      zh: '连接正常。日历中的忙碌时间会从预览中排除。',
      en: 'Connected and healthy. Busy Calendar time is excluded from the preview.',
    },
    expired: {
      zh: '连接流程已经过期，没有保存任何新凭据。请重新连接。',
      en: 'The connection attempt expired and no new credential was saved. Connect again.',
    },
    revoked: {
      zh: 'Google 已撤销访问权限。重新连接即可恢复忙碌时间检查。',
      en: 'Google revoked access. Reconnect to restore busy-time checks.',
    },
    'denied-scope': {
      zh: 'Google 没有授予事件与忙闲查询权限。请重新连接并允许两项权限。',
      en: 'Google did not grant event and free/busy access. Reconnect and allow both permissions.',
    },
    unavailable: {
      zh: '暂时无法检查 Google 日历。已保存的可预约时段不会丢失。',
      en: 'Google Calendar cannot be checked right now. Saved Availability Windows are safe.',
    },
  } as const
  const copy = stateCopy[connection.status]
  const connectLabel =
    connection.status === 'disconnected'
      ? { zh: '连接 Google 日历', en: 'Connect Google Calendar' }
      : { zh: '重新连接', en: 'Reconnect' }

  return (
    <section
      className="mt-8 hairline-top pt-6"
      aria-labelledby="google-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <SectionTag index={3} id="google-heading">
            <T zh="Google 日历" en="Google Calendar" />
          </SectionTag>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <T zh={copy.zh} en={copy.en} />
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connection.status !== 'connected' && (
            <form
              action="/api/admin/ama/google/connect"
              method="post"
              onSubmit={connect}
            >
              <Button
                variant="primary"
                size="md"
                type="submit"
                disabled={pending !== null}
                loading={pending === 'connect'}
                expandHitArea
              >
                <T zh={connectLabel.zh} en={connectLabel.en} />
              </Button>
            </form>
          )}
          {connection.status !== 'disconnected' && (
            <form
              action="/api/admin/ama/google/disconnect"
              method="post"
              onSubmit={disconnect}
            >
              <Button
                variant="ghost"
                size="md"
                type="submit"
                disabled={pending !== null}
                loading={pending === 'disconnect'}
                destructive={disconnectArmed}
                expandHitArea
              >
                {disconnectArmed ? (
                  <T zh="确认断开？" en="Confirm disconnect?" />
                ) : (
                  <T zh="断开" en="Disconnect" />
                )}
              </Button>
            </form>
          )}
          {disconnectArmed && pending === null && (
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => setDisconnectArmed(false)}
              expandHitArea
            >
              <T zh="取消" en="Cancel" />
            </Button>
          )}
        </div>
      </div>

      {disconnectArmed && pending === null && (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          <T
            zh="可预约时段会保留，但在重新连接前无法检查日历冲突。"
            en="Availability Windows stay saved, but calendar conflicts cannot be checked until you reconnect."
          />
        </p>
      )}

      <QueryNotices
        notices={notice ? { calendar: notice } : undefined}
        restoreFocus={restoreNoticeFocus}
      />

      {connection.identity && (
        <dl className="spec-nameplate mt-4 mb-6">
          <div>
            <dt>
              <T zh="日历" en="Calendar" />
            </dt>
            <dd className="min-w-0 break-words">
              {connection.identity.summary ||
                connection.identity.email ||
                connection.identity.calendarId}
            </dd>
          </div>
          {connection.identity.email && (
            <div>
              <dt>
                <T zh="账号" en="Account" />
              </dt>
              <dd className="min-w-0 break-words">
                {connection.identity.email}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  )
}

function SlotPreview({
  slots,
  timeZone,
  diagnosis,
}: {
  slots: readonly PreviewSlotViewModel[]
  timeZone: string
  diagnosis: PreviewDiagnosis
}) {
  const visibleSlots = slots.slice(0, previewLimit)
  const formatters = useMemo(() => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    return {
      date: {
        zh: new Intl.DateTimeFormat('zh-CN', dateOptions),
        en: new Intl.DateTimeFormat('en-US', dateOptions),
      },
      time: {
        zh: new Intl.DateTimeFormat('zh-CN', timeOptions),
        en: new Intl.DateTimeFormat('en-US', timeOptions),
      },
    }
  }, [timeZone])
  const emptyCopy: Record<Exclude<PreviewDiagnosis, 'open'>, {
    zh: string
    en: string
  }> = {
    'calendar-unavailable': {
      zh: 'Google 日历恢复后才能生成预览。',
      en: 'The preview will return after Google Calendar is healthy.',
    },
    'no-configured-hours': {
      zh: '没有已启用的每周时段或自定义日期时段。',
      en: 'No enabled weekly or custom date hours are configured.',
    },
    'no-policy-eligible-hours': {
      zh: '已保存的时段都在预约规则之外，或不足 60 分钟。',
      en: 'Saved hours fall outside the booking policy or are shorter than 60 minutes.',
    },
    'calendar-conflicts': {
      zh: 'Google 日历冲突占用了所有符合规则的时间。',
      en: 'Google Calendar conflicts occupy every policy-eligible time.',
    },
    'holds-or-bookings': {
      zh: '暂存或现有预约占用了所有剩余时间。',
      en: 'Active holds or existing Bookings occupy every remaining time.',
    },
  }

  return (
    <section className="mt-8 hairline-top pt-6" aria-labelledby="preview-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTag index={5} id="preview-heading">
          <T zh="开放时间预览" en="Open-time preview" />
        </SectionTag>
        <span className="text-sm text-muted-foreground tabular-nums">
          {timeZone}
        </span>
      </div>

      {visibleSlots.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          <T
            zh={emptyCopy[diagnosis === 'open' ? 'no-policy-eligible-hours' : diagnosis].zh}
            en={emptyCopy[diagnosis === 'open' ? 'no-policy-eligible-hours' : diagnosis].en}
          />
        </p>
      ) : (
        <>
          <ol className="mt-3 divide-y divide-border/70">
            {visibleSlots.map((slot) => {
              const startsAt = new Date(slot.startsAt)
              const endsAt = new Date(slot.endsAt)
              return (
                <li
                  key={slot.startsAt}
                  className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"
                >
                  <time dateTime={slot.startsAt}>
                    <T
                      zh={formatters.date.zh.format(startsAt)}
                      en={formatters.date.en.format(startsAt)}
                    />
                  </time>
                  <span className="text-muted-foreground tabular-nums">
                    <T
                      zh={`${formatters.time.zh.format(startsAt)}–${formatters.time.zh.format(endsAt)}`}
                      en={`${formatters.time.en.format(startsAt)}–${formatters.time.en.format(endsAt)}`}
                    />
                  </span>
                </li>
              )
            })}
          </ol>
          {slots.length > visibleSlots.length && (
            <p className="mt-3 text-sm text-muted-foreground tabular-nums">
              <T
                zh={`显示接下来的 ${visibleSlots.length} 个，共 ${slots.length} 个。`}
                en={`Showing the next ${visibleSlots.length} of ${slots.length}.`}
              />
            </p>
          )}
        </>
      )}
    </section>
  )
}

export function AmaSettings({
  timeZone = 'Asia/Taipei',
  weekdays: persistedWeekdays,
  windows,
  overrides = [],
  googleConnection,
  previewSlots,
  previewDiagnosis,
  publicBookingUrl = '/ama/book',
  notices,
  fixtureMode = false,
}: AmaSettingsProps) {
  const availabilityError =
    notices?.availability && notices.availability !== 'saved'
      ? 'availability-notice'
      : undefined
  const weekdayStates =
    persistedWeekdays ??
    AMA_WEEKDAYS.map((weekday) => ({
      isoWeekday: weekday.value,
      enabled: windows.some(
        (window) => window.isoWeekday === weekday.value,
      ),
    }))
  const diagnosis =
    previewDiagnosis ??
    (previewSlots.length > 0
      ? 'open'
      : googleConnection.status === 'connected'
        ? 'no-configured-hours'
        : 'calendar-unavailable')

  return (
    <div className="pb-10">
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        <T
          zh="每次 60 分钟 · 至少提前 24 小时 · 开放未来 30 天 · 前后各留 15 分钟"
          en="60 minutes · 24-hour notice · 30-day horizon · 15-minute buffers"
        />
      </p>

      <section className="mt-6 hairline-top pt-6" aria-labelledby="availability-heading">
        <div className="max-w-md">
          <SectionTag index={1} id="availability-heading">
            <T zh="每周安排" en="Weekly schedule" />
          </SectionTag>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            <T
              zh={`所有每周时段和日期覆盖都按 ${timeZone} 解释。更改会立即保存。`}
              en={`Weekly hours and date overrides use ${timeZone}. Each change saves immediately.`}
            />
          </p>
        </div>

        <QueryNotices
          notices={
            notices?.availability
              ? { availability: notices.availability }
              : undefined
          }
          restoreFocus={notices?.availability !== undefined}
        />

        <ScheduleTimeZoneForm
          timeZone={timeZone}
          describedBy={availabilityError}
          fixtureMode={fixtureMode}
        />

        <div className="mt-6">
          {AMA_WEEKDAYS.map((weekday) => (
            <WeekdaySchedule
              key={weekday.value}
              weekday={weekday}
              enabled={
                weekdayStates.find(
                  (state) => state.isoWeekday === weekday.value,
                )?.enabled ?? false
              }
              windows={windows.filter(
                (window) => window.isoWeekday === weekday.value,
              )}
              describedBy={availabilityError}
              fixtureMode={fixtureMode}
            />
          ))}
        </div>
      </section>

      <DateOverridesSection
        overrides={overrides}
        describedBy={availabilityError}
        fixtureMode={fixtureMode}
      />
      <GoogleCalendarSection
        connection={googleConnection}
        notice={notices?.calendar}
        restoreNoticeFocus={
          notices?.calendar !== undefined && notices.availability === undefined
        }
        fixtureMode={fixtureMode}
      />
      <ReadinessSection
        weekdays={weekdayStates}
        windows={windows}
        overrides={overrides}
        connection={googleConnection}
        slots={previewSlots}
        diagnosis={diagnosis}
        publicBookingUrl={publicBookingUrl}
      />
      <SlotPreview
        slots={previewSlots}
        timeZone={timeZone}
        diagnosis={diagnosis}
      />
    </div>
  )
}

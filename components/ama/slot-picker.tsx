'use client'

import { useMemo, useState } from 'react'
import { enUS, zhCN } from 'date-fns/locale'

import { Button } from '~/components/ui/button'
import { Calendar, calendarDayKey } from '~/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'

export type PublicSlot = {
  startsAt: string
  endsAt: string
}

type SlotPickerProps = {
  slots: PublicSlot[]
  timeZone: string
  onTimeZoneChange: (timeZone: string) => void
  selected: string | null
  onSelect: (startsAt: string) => void
  onDateChange?: () => void
  disabled?: boolean
}

function listTimeZones(detected: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : []
  if (zones.includes(detected)) return zones
  return [detected, ...zones]
}

function safeFormatter(options: Intl.DateTimeFormatOptions, locale: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone })
  } catch {
    return new Intl.DateTimeFormat(locale, options)
  }
}

function formatterDayKey(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : ''
}

function calendarDate(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year!, month! - 1, day!, 12)
}

/**
 * The shared start-time picker: choose an available date in the shadcn
 * calendar, then one time from that date. Booking and reschedule share it.
 */
export function SlotPicker({
  slots,
  timeZone,
  onTimeZoneChange,
  selected,
  onSelect,
  onDateChange,
  disabled = false,
}: SlotPickerProps) {
  const locale = useLocale()
  const [preferredDayKey, setPreferredDayKey] = useState<string | null>(null)

  const timeZones = useMemo(() => listTimeZones(timeZone), [timeZone])

  const groups = useMemo(() => {
    const dayKey = safeFormatter(
      { year: 'numeric', month: '2-digit', day: '2-digit' },
      'en-CA',
      timeZone,
    )
    const zhDay = safeFormatter(
      { month: 'long', day: 'numeric', weekday: 'long' },
      'zh-CN',
      timeZone,
    )
    const enDay = safeFormatter(
      { weekday: 'short', month: 'short', day: 'numeric' },
      'en-US',
      timeZone,
    )
    const zhTime = safeFormatter(
      { hour: '2-digit', minute: '2-digit', hour12: false },
      'zh-CN',
      timeZone,
    )
    const enTime = safeFormatter(
      { hour: 'numeric', minute: '2-digit', hour12: true },
      'en-US',
      timeZone,
    )
    const zhFull = safeFormatter(
      {
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
      'zh-CN',
      timeZone,
    )
    const enFull = safeFormatter(
      {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      },
      'en-US',
      timeZone,
    )

    const byDay = new Map<
      string,
      {
        date: Date
        zhHeading: string
        enHeading: string
        slots: {
          startsAt: string
          zhTime: string
          enTime: string
          zhLabel: string
          enLabel: string
        }[]
      }
    >()

    for (const slot of slots) {
      const start = new Date(slot.startsAt)
      if (!Number.isFinite(start.getTime())) continue
      const key = formatterDayKey(dayKey, start)
      if (!key) continue
      let group = byDay.get(key)
      if (!group) {
        group = {
          date: calendarDate(key),
          zhHeading: zhDay.format(start),
          enHeading: enDay.format(start),
          slots: [],
        }
        byDay.set(key, group)
      }
      group.slots.push({
        startsAt: slot.startsAt,
        zhTime: zhTime.format(start),
        enTime: enTime.format(start),
        zhLabel: zhFull.format(start),
        enLabel: enFull.format(start),
      })
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, group]) => ({ key, ...group }))
  }, [slots, timeZone])

  const selectedDayKey = groups.find((group) =>
    group.slots.some((slot) => slot.startsAt === selected),
  )?.key
  const activeDayKey =
    selectedDayKey ??
    (groups.some((group) => group.key === preferredDayKey)
      ? preferredDayKey
      : groups[0]?.key ?? null)
  const activeGroup = groups.find((group) => group.key === activeDayKey)
  const availableDayKeys = useMemo(
    () => new Set(groups.map((group) => group.key)),
    [groups],
  )
  const availableDates = useMemo(() => groups.map((group) => group.date), [groups])

  function chooseDate(date: Date | undefined) {
    if (!date) return
    const nextDayKey = calendarDayKey(date)
    if (!availableDayKeys.has(nextDayKey)) return
    setPreferredDayKey(nextDayKey)
    if (selectedDayKey && selectedDayKey !== nextDayKey) onDateChange?.()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">
          <T zh="时区" en="Time zone" />
        </span>
        <Select
          value={timeZone}
          onValueChange={onTimeZoneChange}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label={localize(locale, '时区', 'Time zone')}
            className="w-full font-mono text-[13px]"
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
        <p className="text-[13px] text-muted-foreground">
          <T zh="日期和时间均按你选择的时区显示。" en="Dates and times use your selected time zone." />
        </p>
      </div>

      {activeGroup && (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
          <Calendar
            mode="single"
            required
            selected={activeGroup.date}
            onSelect={chooseDate}
            defaultMonth={groups[0]?.date}
            startMonth={groups[0]?.date}
            endMonth={groups.at(-1)?.date}
            disabled={(date) => disabled || !availableDayKeys.has(calendarDayKey(date))}
            modifiers={{ available: availableDates }}
            locale={locale === 'zh' ? zhCN : enUS}
            weekStartsOn={0}
            fixedWeeks
            className="mx-auto max-w-[22rem]"
          />

          <section
            aria-label={localize(locale, activeGroup.zhHeading, activeGroup.enHeading)}
            className="min-w-0 sm:border-l sm:border-border sm:pl-4"
          >
            <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              <T zh={activeGroup.zhHeading} en={activeGroup.enHeading} />
            </h3>
            <ul className="mt-2 flex max-h-[19rem] flex-col gap-2 overflow-y-auto pr-1">
              {activeGroup.slots.map((slot) => {
                const isSelected = selected === slot.startsAt
                return (
                  <li key={slot.startsAt}>
                    <Button
                      type="button"
                      variant={isSelected ? 'primary' : 'tertiary'}
                      size="lg"
                      active={isSelected}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={localize(locale, slot.zhLabel, slot.enLabel)}
                      onClick={() => onSelect(slot.startsAt)}
                      className="min-h-11 w-full font-mono text-[13px] tabular-nums"
                    >
                      <T zh={slot.zhTime} en={slot.enTime} />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

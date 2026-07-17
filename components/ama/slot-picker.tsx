'use client'

import { useId, useMemo } from 'react'

import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import { cn } from '~/lib/utils'

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

/**
 * The shared start-time picker: slots grouped by day in the guest's zone,
 * every slot a 44px button. Selection is shown with color and a ring, never
 * with size, so nothing shifts. Both booking and reschedule reuse it.
 */
export function SlotPicker({
  slots,
  timeZone,
  onTimeZoneChange,
  selected,
  onSelect,
  disabled = false,
}: SlotPickerProps) {
  const locale = useLocale()
  const timeZoneSelectId = useId()

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
      { month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false },
      'zh-CN',
      timeZone,
    )
    const enFull = safeFormatter(
      { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
      'en-US',
      timeZone,
    )

    const byDay = new Map<
      string,
      {
        zhHeading: string
        enHeading: string
        slots: { startsAt: string; zhTime: string; enTime: string; zhLabel: string; enLabel: string }[]
      }
    >()

    for (const slot of slots) {
      const start = new Date(slot.startsAt)
      if (!Number.isFinite(start.getTime())) continue
      const key = dayKey.format(start)
      let group = byDay.get(key)
      if (!group) {
        group = {
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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={timeZoneSelectId} className="text-muted-foreground">
          <T zh="时区" en="Time zone" />
        </label>
        <select
          id={timeZoneSelectId}
          value={timeZone}
          disabled={disabled}
          onChange={(event) => onTimeZoneChange(event.target.value)}
          className="min-h-11 w-full touch-manipulation rounded-md bg-background px-3 text-base shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:shadow-[0_0_0_1px_var(--foreground)]"
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="text-[13px] text-muted-foreground">
          <T zh="以下时间均按你选择的时区显示。" en="All times are shown in your selected time zone." />
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.key} aria-label={localize(locale, group.zhHeading, group.enHeading)}>
            <h3 className="text-sm font-medium text-muted-foreground">
              <T zh={group.zhHeading} en={group.enHeading} />
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.slots.map((slot) => {
                const isSelected = selected === slot.startsAt
                return (
                  <li key={slot.startsAt}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-label={localize(locale, slot.zhLabel, slot.enLabel)}
                      onClick={() => onSelect(slot.startsAt)}
                      className={cn(
                        'min-h-11 w-full touch-manipulation rounded-md text-sm tabular-nums outline-none transition-colors duration-150',
                        'focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        isSelected
                          ? 'bg-foreground text-background shadow-[0_0_0_1px_var(--foreground)]'
                          : 'text-foreground shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--foreground)]',
                      )}
                    >
                      <T zh={slot.zhTime} en={slot.enTime} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useId, useState, type FormEvent } from 'react'

import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select'
import { T } from '~/lib/i18n'

import {
  AMA_END_OPTIONS,
  AMA_START_OPTIONS,
  formatScheduleMinute,
  parseScheduleMinute,
} from './scheduling-fields'

export type AvailabilityWindowViewModel = {
  id: number
  isoWeekday: number
  startMinute: number
  endMinute: number
}

type AvailabilityWeekdayFormProps = {
  isoWeekday: number
  windows: readonly AvailabilityWindowViewModel[]
  describedBy?: string
  fixtureMode?: boolean
}

type EditableInterval = {
  key: number
  start: string
  end: string
}

function initialIntervals(
  windows: readonly AvailabilityWindowViewModel[],
): EditableInterval[] {
  if (windows.length === 0) {
    return [{ key: 1, start: '09:00', end: '12:00' }]
  }
  return windows.map((window, index) => ({
    key: index + 1,
    start: formatScheduleMinute(window.startMinute),
    end: formatScheduleMinute(window.endMinute),
  }))
}

function invalidIntervalKeys(intervals: readonly EditableInterval[]) {
  const invalid = new Set<number>()
  const parsed = intervals.map((interval) => ({
    key: interval.key,
    start: parseScheduleMinute(interval.start),
    end: parseScheduleMinute(interval.end),
  }))

  for (const interval of parsed) {
    if (interval.start >= interval.end) invalid.add(interval.key)
  }

  const ordered = parsed
    .filter((interval) => interval.start < interval.end)
    .sort((left, right) => left.start - right.start || left.end - right.end)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const current = ordered[index]!
    if (current.start < previous.end) {
      invalid.add(previous.key)
      invalid.add(current.key)
    }
  }

  return invalid
}

export function AvailabilityWeekdayForm({
  isoWeekday,
  windows,
  describedBy,
  fixtureMode = false,
}: AvailabilityWeekdayFormProps) {
  const fieldId = useId()
  const [intervals, setIntervals] = useState(() => initialIntervals(windows))
  const [pending, setPending] = useState(false)
  const [invalidIntervals, setInvalidIntervals] = useState<Set<number>>(
    () => new Set(),
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    const invalid = invalidIntervalKeys(intervals)
    if (invalid.size > 0) {
      event.preventDefault()
      setInvalidIntervals(invalid)
      return
    }
    setInvalidIntervals(new Set())
    if (fixtureMode) {
      event.preventDefault()
      return
    }
    setPending(true)
  }

  function updateInterval(
    key: number,
    edge: 'start' | 'end',
    value: string,
  ) {
    setIntervals((current) =>
      current.map((interval) =>
        interval.key === key ? { ...interval, [edge]: value } : interval,
      ),
    )
    setInvalidIntervals(new Set())
  }

  function addInterval() {
    setIntervals((current) => [
      ...current,
      {
        key: Math.max(0, ...current.map((interval) => interval.key)) + 1,
        start: '13:00',
        end: '17:00',
      },
    ])
    setInvalidIntervals(new Set())
  }

  function removeInterval(key: number) {
    setIntervals((current) => current.filter((interval) => interval.key !== key))
    setInvalidIntervals(new Set())
  }

  return (
    <form
      action="/api/admin/ama/availability"
      method="post"
      aria-describedby={describedBy}
      className="grid gap-3"
      onSubmit={submit}
    >
      <input type="hidden" name="intent" value="save-weekday" />
      <input type="hidden" name="weekday" value={isoWeekday} />

      {intervals.map((interval, index) => {
        const invalid = invalidIntervals.has(interval.key)
        return (
          <div
            key={interval.key}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          >
            <div className="grid gap-1.5 text-sm">
              <span
                id={`${fieldId}-${interval.key}-start-label`}
                className="text-muted-foreground"
              >
                <T zh="开始" en="Start" />
                <span className="sr-only">
                  <T zh={`，时段 ${index + 1}`} en={`, interval ${index + 1}`} />
                </span>
              </span>
              <Select
                name="start"
                value={interval.start}
                onValueChange={(value) =>
                  updateInterval(interval.key, 'start', value)
                }
                readOnly={pending}
              >
                <SelectTrigger
                  aria-labelledby={`${fieldId}-${interval.key}-start-label`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={
                    invalid ? `${fieldId}-${interval.key}-error` : describedBy
                  }
                  className="w-full tabular-nums"
                  disabled={pending}
                />
                <SelectContent>
                  {AMA_START_OPTIONS.map((minute, optionIndex) => (
                    <SelectItem
                      key={minute}
                      value={formatScheduleMinute(minute)}
                      index={optionIndex}
                      className="tabular-nums"
                    >
                      {formatScheduleMinute(minute)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5 text-sm">
              <span
                id={`${fieldId}-${interval.key}-end-label`}
                className="text-muted-foreground"
              >
                <T zh="结束" en="End" />
                <span className="sr-only">
                  <T zh={`，时段 ${index + 1}`} en={`, interval ${index + 1}`} />
                </span>
              </span>
              <Select
                name="end"
                value={interval.end}
                onValueChange={(value) =>
                  updateInterval(interval.key, 'end', value)
                }
                readOnly={pending}
              >
                <SelectTrigger
                  aria-labelledby={`${fieldId}-${interval.key}-end-label`}
                  aria-invalid={invalid || undefined}
                  aria-describedby={
                    invalid ? `${fieldId}-${interval.key}-error` : describedBy
                  }
                  className="w-full tabular-nums"
                  disabled={pending}
                />
                <SelectContent>
                  {AMA_END_OPTIONS.map((minute, optionIndex) => (
                    <SelectItem
                      key={minute}
                      value={formatScheduleMinute(minute)}
                      index={optionIndex}
                      className="tabular-nums"
                    >
                      {formatScheduleMinute(minute)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={pending || intervals.length === 1}
              onClick={() => removeInterval(interval.key)}
              expandHitArea
            >
              <T zh="移除" en="Remove" />
            </Button>

            {invalid && (
              <p
                id={`${fieldId}-${interval.key}-error`}
                role="alert"
                className="text-sm leading-5 text-destructive sm:col-span-full"
              >
                <T
                  zh={`第 ${index + 1} 个时段无效，结束时间必须晚于开始时间，且不能与其他时段重叠。`}
                  en={`Interval ${index + 1} is invalid. It must end after it starts and cannot overlap another interval.`}
                />
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          disabled={pending}
          onClick={addInterval}
          expandHitArea
        >
          <T zh="添加时段" en="Add interval" />
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          loading={pending}
          expandHitArea
        >
          <T zh="保存星期安排" en="Save day" />
        </Button>
      </div>
    </form>
  )
}

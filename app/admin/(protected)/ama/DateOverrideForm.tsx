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

export type DateOverrideViewModel = {
  id: number
  localDate: string
  intervals: readonly {
    startMinute: number
    endMinute: number
  }[]
}

type DateOverrideFormProps = {
  override?: DateOverrideViewModel
  describedBy?: string
  fixtureMode?: boolean
  onCancel?: () => void
}

type EditableInterval = {
  key: number
  start: string
  end: string
}

function initialIntervals(override?: DateOverrideViewModel): EditableInterval[] {
  if (!override || override.intervals.length === 0) {
    return [{ key: 1, start: '09:00', end: '12:00' }]
  }
  return override.intervals.map((interval, index) => ({
    key: index + 1,
    start: formatScheduleMinute(interval.startMinute),
    end: formatScheduleMinute(interval.endMinute),
  }))
}

export function DateOverrideForm({
  override,
  describedBy,
  fixtureMode = false,
  onCancel,
}: DateOverrideFormProps) {
  const fieldId = useId()
  const [mode, setMode] = useState<'closed' | 'custom'>(
    override && override.intervals.length === 0 ? 'closed' : 'custom',
  )
  const [intervals, setIntervals] = useState(() => initialIntervals(override))
  const [pending, setPending] = useState(false)
  const [invalidIntervals, setInvalidIntervals] = useState<Set<number>>(
    () => new Set(),
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    const invalid =
      mode === 'custom'
        ? intervals.filter(
            (interval) =>
              parseScheduleMinute(interval.start) >=
              parseScheduleMinute(interval.end),
          )
        : []
    if (invalid.length > 0) {
      event.preventDefault()
      setInvalidIntervals(new Set(invalid.map((interval) => interval.key)))
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
  }

  return (
    <form
      action="/api/admin/ama/availability"
      method="post"
      aria-describedby={describedBy}
      className="grid gap-4 rounded-[2px] bg-surface-1 px-4 py-4"
      onSubmit={submit}
    >
      <input type="hidden" name="intent" value="save-override" />

      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">
          <T zh="日期" en="Date" />
        </span>
        <input
          type="date"
          name="localDate"
          required
          readOnly={override !== undefined || pending}
          defaultValue={override?.localDate}
          className="min-h-11 w-full rounded-[2px] border border-border bg-transparent px-3 font-mono text-base tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-foreground"
        />
      </label>

      <fieldset disabled={pending}>
        <legend className="text-sm text-muted-foreground">
          <T zh="这一天" en="On this date" />
        </legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(
            [
              { value: 'closed', zh: '关闭预约', en: 'Closed' },
              { value: 'custom', zh: '自定义时段', en: 'Custom hours' },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[2px] px-3 text-sm shadow-[0_0_0_1px_var(--border)] has-[:checked]:shadow-[0_0_0_1px_var(--foreground)]"
            >
              <input
                type="radio"
                name="overrideMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="size-4 accent-current"
              />
              <T zh={option.zh} en={option.en} />
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'custom' && (
        <div className="grid gap-3">
          {intervals.map((interval, index) => (
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
                </span>
                <Select
                  name="overrideStart"
                  value={interval.start}
                  onValueChange={(value) =>
                    updateInterval(interval.key, 'start', value)
                  }
                  readOnly={pending}
                >
                  <SelectTrigger
                    aria-labelledby={`${fieldId}-${interval.key}-start-label`}
                    aria-invalid={invalidIntervals.has(interval.key) || undefined}
                    aria-describedby={
                      invalidIntervals.has(interval.key)
                        ? `${fieldId}-${interval.key}-error`
                        : describedBy
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
                </span>
                <Select
                  name="overrideEnd"
                  value={interval.end}
                  onValueChange={(value) =>
                    updateInterval(interval.key, 'end', value)
                  }
                  readOnly={pending}
                >
                  <SelectTrigger
                    aria-labelledby={`${fieldId}-${interval.key}-end-label`}
                    aria-invalid={invalidIntervals.has(interval.key) || undefined}
                    aria-describedby={
                      invalidIntervals.has(interval.key)
                        ? `${fieldId}-${interval.key}-error`
                        : describedBy
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
                onClick={() =>
                  setIntervals((current) =>
                    current.filter((item) => item.key !== interval.key),
                  )
                }
                expandHitArea
              >
                <T zh="移除" en="Remove" />
              </Button>
              {invalidIntervals.has(interval.key) && (
                <p
                  id={`${fieldId}-${interval.key}-error`}
                  role="alert"
                  className="text-sm leading-5 text-destructive sm:col-span-full"
                >
                  <T
                    zh={`第 ${index + 1} 个时段的结束时间必须晚于开始时间。`}
                    en={`Interval ${index + 1} must end after it starts.`}
                  />
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={addInterval}
            className="justify-self-start"
            expandHitArea
          >
            <T zh="添加时段" en="Add interval" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={pending}
            onClick={onCancel}
            expandHitArea
          >
            <T zh="取消" en="Cancel" />
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          loading={pending}
          expandHitArea
        >
          {override ? (
            <T zh="保存覆盖" en="Save override" />
          ) : (
            <T zh="添加覆盖" en="Add override" />
          )}
        </Button>
      </div>
    </form>
  )
}

'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'

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

function formatMinute(minute: number) {
  if (minute === 24 * 60) return '24:00'
  const hour = Math.floor(minute / 60)
  return `${hour.toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`
}

function timeOptions(firstMinute: number, lastMinute: number) {
  const options: number[] = []
  for (let minute = firstMinute; minute <= lastMinute; minute += 30) {
    options.push(minute)
  }
  return options
}

const startOptions = timeOptions(0, 23 * 60 + 30)
const endOptions = timeOptions(30, 24 * 60)

function initialIntervals(override?: DateOverrideViewModel): EditableInterval[] {
  if (!override || override.intervals.length === 0) {
    return [{ key: 1, start: '09:00', end: '12:00' }]
  }
  return override.intervals.map((interval, index) => ({
    key: index + 1,
    start: formatMinute(interval.startMinute),
    end: formatMinute(interval.endMinute),
  }))
}

export function DateOverrideForm({
  override,
  describedBy,
  fixtureMode = false,
  onCancel,
}: DateOverrideFormProps) {
  const locale = useLocale()
  const [mode, setMode] = useState<'closed' | 'custom'>(
    override && override.intervals.length === 0 ? 'closed' : 'custom',
  )
  const [intervals, setIntervals] = useState(() => initialIntervals(override))
  const [pending, setPending] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
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
                <span className="text-muted-foreground">
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
                    aria-label={localize(
                      locale,
                      `第 ${index + 1} 个时段的开始时间`,
                      `Interval ${index + 1} start time`,
                    )}
                    className="w-full tabular-nums"
                    disabled={pending}
                  />
                  <SelectContent>
                    {startOptions.map((minute, optionIndex) => (
                      <SelectItem
                        key={minute}
                        value={formatMinute(minute)}
                        index={optionIndex}
                        className="tabular-nums"
                      >
                        {formatMinute(minute)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5 text-sm">
                <span className="text-muted-foreground">
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
                    aria-label={localize(
                      locale,
                      `第 ${index + 1} 个时段的结束时间`,
                      `Interval ${index + 1} end time`,
                    )}
                    className="w-full tabular-nums"
                    disabled={pending}
                  />
                  <SelectContent>
                    {endOptions.map((minute, optionIndex) => (
                      <SelectItem
                        key={minute}
                        value={formatMinute(minute)}
                        index={optionIndex}
                        className="tabular-nums"
                      >
                        {formatMinute(minute)}
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

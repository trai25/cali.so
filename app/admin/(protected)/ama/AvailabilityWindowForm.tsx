'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select'
import { T } from '~/lib/i18n'
import { localize, useLocale } from '~/lib/locale-client'
import { cn } from '~/lib/utils'

export type AvailabilityWindowViewModel = {
  id: number
  isoWeekday: number
  startMinute: number
  endMinute: number
}

type AvailabilityWindowFormProps = {
  window?: AvailabilityWindowViewModel
  fixedWeekday?: number
  describedBy?: string
  fixtureMode?: boolean
}

const weekdays = [
  { value: 1, zh: '星期一', en: 'Monday' },
  { value: 2, zh: '星期二', en: 'Tuesday' },
  { value: 3, zh: '星期三', en: 'Wednesday' },
  { value: 4, zh: '星期四', en: 'Thursday' },
  { value: 5, zh: '星期五', en: 'Friday' },
  { value: 6, zh: '星期六', en: 'Saturday' },
  { value: 7, zh: '星期日', en: 'Sunday' },
] as const

function formatMinute(minute: number) {
  if (minute === 24 * 60) return '24:00'
  const hour = Math.floor(minute / 60)
  return `${hour.toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`
}

function timeOptions(firstMinute: number, lastMinute: number) {
  const options: number[] = []
  for (let minute = firstMinute; minute <= lastMinute; minute += 30) options.push(minute)
  return options
}

const startOptions = timeOptions(0, 23 * 60 + 30)
const endOptions = timeOptions(30, 24 * 60)

export function AvailabilityWindowForm({
  window: availabilityWindow,
  fixedWeekday,
  describedBy,
  fixtureMode = false,
}: AvailabilityWindowFormProps) {
  const locale = useLocale()
  const [weekday, setWeekday] = useState(
    fixedWeekday ?? availabilityWindow?.isoWeekday ?? 1,
  )
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const deleteTimerRef = useRef<number | null>(null)
  const isExisting = availabilityWindow !== undefined

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current)
      }
    },
    [],
  )

  // Deleting a window is a two-step armed action: the first press asks for
  // confirmation on the button itself and disarms after 4 seconds.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null
    if (submitter?.value === 'delete') {
      if (!deleteArmed) {
        event.preventDefault()
        setDeleteArmed(true)
        if (deleteTimerRef.current !== null) {
          window.clearTimeout(deleteTimerRef.current)
        }
        deleteTimerRef.current = window.setTimeout(
          () => setDeleteArmed(false),
          4000,
        )
        return
      }
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current)
      }
      if (fixtureMode) {
        event.preventDefault()
        setDeleteArmed(false)
        return
      }
      setPending('delete')
      return
    }
    if (fixtureMode) {
      event.preventDefault()
      return
    }
    setPending('save')
  }

  return (
    <form
      action="/api/admin/ama/availability"
      method="post"
      aria-describedby={describedBy}
      className={cn(
        'grid gap-3 sm:items-end',
        fixedWeekday === undefined
          ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
          : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]',
      )}
      onSubmit={handleSubmit}
    >
      {availabilityWindow && (
        <input type="hidden" name="id" value={availabilityWindow.id} />
      )}

      {fixedWeekday !== undefined && (
        <input type="hidden" name="weekday" value={fixedWeekday} />
      )}

      {/* One localized Select replaces the CSS-swapped zh/en native pair. Its
          hidden input posts the direct `weekday` field, which the server
          parser reads ahead of the legacy weekdayZh/weekdayEn/weekdayOriginal
          trio. */}
      {fixedWeekday === undefined && <div className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">
          <T zh="星期" en="Day" />
        </span>
        <Select
          name="weekday"
          value={String(weekday)}
          onValueChange={(value) => setWeekday(Number(value))}
          readOnly={pending !== null}
        >
          <SelectTrigger
            aria-label={localize(locale, '星期', 'Day')}
            className="w-full"
            disabled={pending !== null}
          />
          <SelectContent>
            {weekdays.map((option, index) => (
              <SelectItem
                key={option.value}
                value={String(option.value)}
                index={index}
              >
                {localize(locale, option.zh, option.en)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>}

      <div className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">
          <T zh="开始" en="Start" />
        </span>
        <Select
          name="start"
          defaultValue={formatMinute(availabilityWindow?.startMinute ?? 9 * 60)}
          readOnly={pending !== null}
        >
          <SelectTrigger
            aria-label={localize(locale, '开始时间', 'Start time')}
            className="w-full tabular-nums"
            disabled={pending !== null}
          />
          <SelectContent>
            {startOptions.map((minute, index) => (
              <SelectItem
                key={minute}
                value={formatMinute(minute)}
                index={index}
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
          name="end"
          defaultValue={formatMinute(availabilityWindow?.endMinute ?? 12 * 60)}
          readOnly={pending !== null}
        >
          <SelectTrigger
            aria-label={localize(locale, '结束时间', 'End time')}
            className="w-full tabular-nums"
            disabled={pending !== null}
          />
          <SelectContent>
            {endOptions.map((minute, index) => (
              <SelectItem
                key={minute}
                value={formatMinute(minute)}
                index={index}
                className="tabular-nums"
              >
                {formatMinute(minute)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No min-height wrapper: the buttons are 32px like the selects, so the
          grid's items-end lines every control on one baseline; hit targets
          come from expandHitArea. */}
      <div className="flex items-center gap-2 sm:justify-end">
        <Button
          variant="primary"
          size="lg"
          type="submit"
          name="intent"
          value={isExisting ? 'update' : 'create'}
          disabled={pending !== null}
          loading={pending === 'save'}
          expandHitArea
        >
          {isExisting ? (
            <T zh="保存" en="Save" />
          ) : (
            <T zh="添加时段" en="Add interval" />
          )}
        </Button>
        {isExisting && (
          <Button
            variant="ghost"
            size="lg"
            type="submit"
            name="intent"
            value="delete"
            formNoValidate
            disabled={pending !== null}
            loading={pending === 'delete'}
            destructive={deleteArmed}
            expandHitArea
          >
            {deleteArmed ? (
              <T zh="确认删除？" en="Confirm delete?" />
            ) : (
              <T zh="删除" en="Delete" />
            )}
          </Button>
        )}
      </div>
    </form>
  )
}

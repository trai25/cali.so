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
import { localize, useLocale } from '~/lib/locale-client'
import { cn } from '~/lib/utils'

import {
  AMA_END_OPTIONS,
  AMA_START_OPTIONS,
  AMA_WEEKDAYS,
  formatScheduleMinute,
  parseScheduleMinute,
} from './scheduling-fields'

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

export function AvailabilityWindowForm({
  window: availabilityWindow,
  fixedWeekday,
  describedBy,
  fixtureMode = false,
}: AvailabilityWindowFormProps) {
  const locale = useLocale()
  const fieldId = useId()
  const [weekday, setWeekday] = useState(
    fixedWeekday ?? availabilityWindow?.isoWeekday ?? 1,
  )
  const [start, setStart] = useState(
    formatScheduleMinute(availabilityWindow?.startMinute ?? 9 * 60),
  )
  const [end, setEnd] = useState(
    formatScheduleMinute(availabilityWindow?.endMinute ?? 12 * 60),
  )
  const [pending, setPending] = useState<'save' | 'delete' | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [fieldError, setFieldError] = useState(false)
  const isExisting = availabilityWindow !== undefined

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | null
    if (submitter?.value === 'delete') {
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
      setPending('delete')
      return
    }
    setDeleteArmed(false)
    if (parseScheduleMinute(start) >= parseScheduleMinute(end)) {
      event.preventDefault()
      setFieldError(true)
      return
    }
    setFieldError(false)
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
      {fixedWeekday === undefined && (
        <div className="grid gap-1.5 text-sm">
          <span id={`${fieldId}-day-label`} className="text-muted-foreground">
            <T zh="星期" en="Day" />
          </span>
          <Select
            name="weekday"
            value={String(weekday)}
            onValueChange={(value) => setWeekday(Number(value))}
            readOnly={pending !== null}
          >
            <SelectTrigger
              aria-labelledby={`${fieldId}-day-label`}
              className="w-full"
              disabled={pending !== null}
            />
            <SelectContent>
              {AMA_WEEKDAYS.map((option, index) => (
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
        </div>
      )}

      <div className="grid gap-1.5 text-sm">
        <span id={`${fieldId}-start-label`} className="text-muted-foreground">
          <T zh="开始" en="Start" />
        </span>
        <Select
          name="start"
          value={start}
          onValueChange={setStart}
          readOnly={pending !== null}
        >
          <SelectTrigger
            aria-labelledby={`${fieldId}-start-label`}
            aria-invalid={fieldError || undefined}
            aria-describedby={
              fieldError ? `${fieldId}-time-error` : describedBy
            }
            className="w-full tabular-nums"
            disabled={pending !== null}
          />
          <SelectContent>
            {AMA_START_OPTIONS.map((minute, index) => (
              <SelectItem
                key={minute}
                value={formatScheduleMinute(minute)}
                index={index}
                className="tabular-nums"
              >
                {formatScheduleMinute(minute)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5 text-sm">
        <span id={`${fieldId}-end-label`} className="text-muted-foreground">
          <T zh="结束" en="End" />
        </span>
        <Select
          name="end"
          value={end}
          onValueChange={setEnd}
          readOnly={pending !== null}
        >
          <SelectTrigger
            aria-labelledby={`${fieldId}-end-label`}
            aria-invalid={fieldError || undefined}
            aria-describedby={
              fieldError ? `${fieldId}-time-error` : describedBy
            }
            className="w-full tabular-nums"
            disabled={pending !== null}
          />
          <SelectContent>
            {AMA_END_OPTIONS.map((minute, index) => (
              <SelectItem
                key={minute}
                value={formatScheduleMinute(minute)}
                index={index}
                className="tabular-nums"
              >
                {formatScheduleMinute(minute)}
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
          <>
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
            {deleteArmed && pending === null && (
              <Button
                variant="ghost"
                size="lg"
                type="button"
                onClick={() => setDeleteArmed(false)}
                expandHitArea
              >
                <T zh="取消" en="Cancel" />
              </Button>
            )}
          </>
        )}
      </div>
      {fieldError && (
        <p
          id={`${fieldId}-time-error`}
          role="alert"
          className="text-sm leading-5 text-destructive sm:col-span-full"
        >
          <T
            zh="结束时间必须晚于开始时间。"
            en="End time must be later than start time."
          />
        </p>
      )}
    </form>
  )
}

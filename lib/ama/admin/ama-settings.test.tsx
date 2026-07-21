// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AmaSettings,
  type AmaSettingsProps,
} from '../../../app/admin/(protected)/ama/AmaSettings'
import { AvailabilityWeekdayForm } from '../../../app/admin/(protected)/ama/AvailabilityWeekdayForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete document.documentElement.dataset.locale
})

function settingsProps(
  status: AmaSettingsProps['googleConnection']['status'],
): AmaSettingsProps {
  return {
    timeZone: 'Asia/Taipei',
    windows: [{ id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 }],
    overrides: [
      {
        id: 1,
        localDate: '2026-07-18',
        intervals: [],
      },
    ],
    publicBookingUrl: 'https://cali.so/ama/book',
    googleConnection: {
      status,
      identity:
        status === 'disconnected'
          ? null
          : {
              calendarId: 'owner@example.com',
              summary: 'Cali Castle',
              email: 'owner@example.com',
            },
    },
    previewSlots: [
      {
        startsAt: '2026-07-15T01:00:00.000Z',
        endsAt: '2026-07-15T02:00:00.000Z',
      },
    ],
    notices: { availability: 'invalid', calendar: status },
  }
}

function renderSettingsMarkup(
  status: AmaSettingsProps['googleConnection']['status'],
) {
  return renderToStaticMarkup(<AmaSettings {...settingsProps(status)} />)
}

function chooseSelectOption(trigger: HTMLButtonElement, value: string) {
  fireEvent.click(trigger)
  const popupId = trigger.getAttribute('aria-controls')
  const popup = popupId ? document.getElementById(popupId) : null
  const option = [...popup!.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (item) => item.textContent === value,
  )!
  fireEvent.pointerDown(option, { pointerType: 'mouse' })
  fireEvent.click(option)
}

describe('AMA settings UI contract', () => {
  it('groups the weekly schedule, exposes overrides, and reports exact readiness blockers', () => {
    const html = renderSettingsMarkup('disconnected')

    expect(html).toContain('Monday')
    expect(html).toContain('Sunday')
    expect(html).toContain('value="set-time-zone"')
    expect(html).toContain('value="set-weekday"')
    expect(html).toContain('data-en="true">Copy</span>')
    expect(html).toContain('data-en="true">Add override</span>')
    expect(html).toContain('2026-07-18')
    expect(html).toContain('Readiness checklist')
    expect(html).toContain('Connect Google Calendar to check conflicts before publishing open times.')
    expect(html).toContain('href="https://cali.so/ama/book"')
  })

  it.each([
    ['no-configured-hours', 'No enabled weekly or custom date hours are configured.'],
    [
      'no-policy-eligible-hours',
      'Saved hours produce no 60-minute times inside the 24-hour notice and 30-day policy.',
    ],
    ['calendar-conflicts', 'Google Calendar conflicts block every policy-eligible time.'],
    [
      'holds-or-bookings',
      'Active holds or existing Bookings block every remaining time.',
    ],
  ] as const)(
    'renders the exact %s preview diagnosis without destructive body copy',
    (previewDiagnosis, expected) => {
      const props = settingsProps('connected')
      const { container } = render(
        <AmaSettings
          {...props}
          windows={previewDiagnosis === 'no-configured-hours' ? [] : props.windows}
          overrides={[]}
          previewSlots={[]}
          previewDiagnosis={previewDiagnosis}
          notices={undefined}
        />,
      )
      const readiness = container.querySelector('#readiness-heading')!.closest('section')!

      expect(readiness.textContent).toContain(expected)
      expect(
        [...readiness.querySelectorAll('span')].find((span) =>
          span.textContent?.includes(expected),
        )?.className,
      ).toContain('tabular-nums')
      expect(readiness.querySelector('.text-destructive')).toBeNull()
    },
  )

  it('reveals copy and date-override forms in place', () => {
    const { container } = render(<AmaSettings {...settingsProps('connected')} />)
    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]

    fireEvent.click(buttons.find((button) => button.textContent?.includes('Copy'))!)
    expect(
      container.querySelector('input[name="intent"][value="copy-weekday"]'),
    ).not.toBeNull()

    fireEvent.click(
      buttons.find((button) => button.textContent?.includes('Add override'))!,
    )
    expect(
      container.querySelector('input[name="intent"][value="save-override"]'),
    ).not.toBeNull()
  })

  it('adds a second interval to one weekday and submits both atomically', () => {
    const { container } = render(<AmaSettings {...settingsProps('connected')} />)
    const monday = container.querySelector('#weekday-1')!.closest('section')!

    fireEvent.click(
      [...monday.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Add interval'),
      )!,
    )

    const form = monday
      .querySelector<HTMLInputElement>('input[name="intent"][value="save-weekday"]')
      ?.closest('form')

    expect(form).toBeTruthy()
    expect(new FormData(form!).getAll('start')).toEqual(['09:00', '13:00'])
    expect(new FormData(form!).getAll('end')).toEqual(['12:00', '17:00'])
  })

  it('keeps saved intervals while a fixture weekday is switched off and on', () => {
    const props = settingsProps('connected')
    const { container } = render(
      <AmaSettings
        {...props}
        weekdays={[
          { isoWeekday: 1, enabled: true },
          ...Array.from({ length: 6 }, (_, index) => ({
            isoWeekday: index + 2,
            enabled: false,
          })),
        ]}
        fixtureMode
      />,
    )
    const toggle = container
      .querySelector<HTMLInputElement>('input[name="weekday"][value="1"]')!
      .closest('form')!

    expect(fireEvent.submit(toggle)).toBe(false)
    expect(toggle.textContent).toContain('Turn off?')
    expect(fireEvent.submit(toggle)).toBe(false)
    expect(container.textContent).toContain('Off · 1 saved interval')
    expect(
      container.querySelector('input[name="intent"][value="save-weekday"]'),
    ).toBeNull()

    expect(fireEvent.submit(toggle)).toBe(false)
    expect(toggle.textContent).toContain('Turn on?')
    expect(fireEvent.submit(toggle)).toBe(false)
    expect(
      container.querySelector('input[name="intent"][value="save-weekday"]'),
    ).not.toBeNull()
    expect(container.querySelector('input[name="start"]')?.getAttribute('value'))
      .toBe('09:00')
  })

  it('keeps localized scheduling content and accessible form recovery in static HTML', () => {
    const html = renderSettingsMarkup('expired')

    // The fluid Select posts through a hidden input; server locale is zh.
    expect(html).toMatch(/<input[^>]+name="weekday"[^>]+value="1"/)
    expect(html).toMatch(/<input[^>]+name="start"[^>]+value="09:00"/)
    expect(html).toMatch(/<input[^>]+name="end"[^>]+value="12:00"/)
    expect(html).toContain('星期一')
    expect(html).toContain('data-zh="true"')
    expect(html).toContain('data-en="true"')
    expect(html).toContain('Wed, Jul 15')
    expect(html).toContain('aria-describedby="availability-notice"')
    expect(html).toContain('id="availability-notice"')
    expect(html).toContain('min-h-11')
  })

  it('offers recovery and local disconnect for an unhealthy Calendar connection', () => {
    const html = renderSettingsMarkup('revoked')

    expect(html).toContain('action="/api/admin/ama/google/connect"')
    expect(html).toContain('action="/api/admin/ama/google/disconnect"')
    expect(html).toContain('owner@example.com')
  })

  it('does not offer disconnect before a Calendar has connected', () => {
    const html = renderSettingsMarkup('disconnected')

    expect(html).toContain('action="/api/admin/ama/google/connect"')
    expect(html).not.toContain('action="/api/admin/ama/google/disconnect"')
  })

  it('submits Google connect directly and locks in a pending state', () => {
    const { container } = render(
      <AmaSettings
        timeZone="Asia/Taipei"
        windows={[]}
        overrides={[]}
        googleConnection={{ status: 'disconnected', identity: null }}
        previewSlots={[]}
        publicBookingUrl="https://cali.so/ama/book"
      />,
    )
    const form = container.querySelector<HTMLFormElement>(
      'form[action="/api/admin/ama/google/connect"]',
    )!

    const firstSubmit = fireEvent.submit(form)
    expect(firstSubmit).toBe(true)
    // The pending state shows the Button spinner and locks the control.
    const button = form.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.querySelector('svg')).not.toBeNull()

    const repeatSubmit = fireEvent.submit(form)
    expect(repeatSubmit).toBe(false)
  })

  it('keeps disconnect armed until confirmation or explicit dismissal', () => {
    const { container } = render(
      <AmaSettings
        timeZone="Asia/Taipei"
        windows={[]}
        overrides={[]}
        googleConnection={{
          status: 'connected',
          identity: {
            calendarId: 'owner@example.com',
            summary: 'Cali Castle',
            email: 'owner@example.com',
          },
        }}
        previewSlots={[]}
        publicBookingUrl="https://cali.so/ama/book"
      />,
    )
    const form = container.querySelector<HTMLFormElement>(
      'form[action="/api/admin/ama/google/disconnect"]',
    )!
    const button = form.querySelector('button')!

    // The first submit arms the button instead of posting.
    const armed = fireEvent.submit(form)
    expect(armed).toBe(false)
    expect(button.textContent).toContain('Confirm disconnect?')

    fireEvent.click(
      [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (item) => item.textContent?.includes('Cancel'),
      )!,
    )
    expect(button.textContent).toContain('Disconnect')
    expect(button.textContent).not.toContain('Confirm')

    // Arm again and confirm: the form posts.
    fireEvent.submit(form)
    const confirmed = fireEvent.submit(form)
    expect(confirmed).toBe(true)
    expect(button.disabled).toBe(true)
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('keeps every interval value successful while a weekday save is pending', () => {
    const { container } = render(
      <AvailabilityWeekdayForm
        isoWeekday={1}
        windows={[
          { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
          { id: 2, isoWeekday: 1, startMinute: 780, endMinute: 1020 },
        ]}
      />,
    )
    const form = container.querySelector('form')!
    form.addEventListener('submit', (event) => event.preventDefault())

    fireEvent.submit(form)

    const submitted = new FormData(form)
    expect(submitted.get('intent')).toBe('save-weekday')
    expect(submitted.get('weekday')).toBe('1')
    expect(submitted.getAll('start')).toEqual(['09:00', '13:00'])
    expect(submitted.getAll('end')).toEqual(['12:00', '17:00'])

    const save = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(save.disabled).toBe(true)
    expect(save.querySelector('svg')).not.toBeNull()
    const weekday = container.querySelector<HTMLInputElement>('input[name="weekday"]')!
    expect(weekday.disabled).toBe(false)
    const fields = container.querySelectorAll<HTMLInputElement>(
      'input[name="start"], input[name="end"]',
    )
    expect(fields.length).toBe(4)
    for (const field of fields) {
      expect(field.disabled).toBe(false)
      expect(field.readOnly).toBe(true)
    }
  })

  it('keeps edited interval values in the submitted form while saving', () => {
    const { container } = render(
      <AvailabilityWeekdayForm
        isoWeekday={1}
        windows={[
          { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
        ]}
      />,
    )
    const form = container.querySelector('form')!
    const [startTrigger, endTrigger] = form.querySelectorAll<HTMLButtonElement>(
      'button[role="combobox"]',
    )

    chooseSelectOption(startTrigger!, '13:00')
    expect(startTrigger!.textContent).toContain('13:00')
    chooseSelectOption(endTrigger!, '17:00')

    expect(startTrigger!.textContent).toContain('13:00')
    expect(endTrigger!.textContent).toContain('17:00')
    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      start: '13:00',
      end: '17:00',
    })

    form.addEventListener('submit', (event) => event.preventDefault())
    fireEvent.click(form.querySelector<HTMLButtonElement>('button[type="submit"]')!)

    expect(Object.fromEntries(new FormData(form))).toMatchObject({
      intent: 'save-weekday',
      weekday: '1',
      start: '13:00',
      end: '17:00',
    })
  })

  it('restores focus to mutation feedback after a redirect render', () => {
    render(
      <AmaSettings
        timeZone="Asia/Taipei"
        windows={[]}
        overrides={[]}
        googleConnection={{ status: 'disconnected', identity: null }}
        previewSlots={[]}
        publicBookingUrl="https://cali.so/ama/book"
        notices={{ availability: 'saved' }}
      />,
    )

    expect(document.activeElement?.id).toBe('availability-notice')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('removes one local interval without deleting the remaining weekday hours', () => {
    const { container } = render(
      <AvailabilityWeekdayForm
        isoWeekday={1}
        windows={[
          { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
          { id: 2, isoWeekday: 1, startMinute: 780, endMinute: 1020 },
        ]}
      />,
    )
    const form = container.querySelector('form')!
    const removeButtons = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent?.includes('Remove'))

    expect(removeButtons).toHaveLength(2)
    fireEvent.click(removeButtons[1]!)

    expect(new FormData(form).getAll('start')).toEqual(['09:00'])
    expect(new FormData(form).getAll('end')).toEqual(['12:00'])
    const remainingRemove = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Remove'))!
    expect(remainingRemove.disabled).toBe(true)
  })

  it('associates visible field labels and reports an invalid interval in place', () => {
    const { container } = render(
      <AvailabilityWeekdayForm
        isoWeekday={1}
        windows={[
          { id: 1, isoWeekday: 1, startMinute: 720, endMinute: 600 },
        ]}
      />,
    )
    const form = container.querySelector('form')!
    const triggers = container.querySelectorAll<HTMLButtonElement>(
      'button[role="combobox"]',
    )

    for (const trigger of triggers) {
      const labelledBy = trigger.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      expect(container.querySelector(`#${labelledBy}`)).not.toBeNull()
    }

    expect(fireEvent.submit(form)).toBe(false)
    expect(container.textContent).toContain(
      'It must end after it starts and cannot overlap another interval.',
    )
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2)
  })

  it('reports both overlapping intervals before submitting the weekday', () => {
    const { container } = render(
      <AvailabilityWeekdayForm
        isoWeekday={1}
        windows={[
          { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
          { id: 2, isoWeekday: 1, startMinute: 660, endMinute: 1020 },
        ]}
      />,
    )
    const form = container.querySelector('form')!

    expect(fireEvent.submit(form)).toBe(false)
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2)
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(4)

    const removeButtons = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent?.includes('Remove'))
    fireEvent.click(removeButtons[1]!)

    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(container.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)
  })
})

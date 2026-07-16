// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clerk = vi.hoisted(() => ({
  verifyWithPasskey: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
  useSession: () => ({
    isLoaded: true,
    session: { id: 'sess_owner', verifyWithPasskey: clerk.verifyWithPasskey },
  }),
  useReverification: (fetcher: unknown) => fetcher,
}))

import { AdminDashboard } from '../../../app/admin/(protected)/AdminDashboard'
import { AvailabilityWindowForm } from '../../../app/admin/(protected)/AvailabilityWindowForm'
import { LOCALE_CHANGE_EVENT } from '../../locale-client'

beforeEach(() => {
  clerk.verifyWithPasskey.mockResolvedValue({ status: 'complete' })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.locale
  clerk.verifyWithPasskey.mockReset()
})

function renderDashboard(
  status: Parameters<typeof AdminDashboard>[0]['googleConnection']['status'],
) {
  return renderToStaticMarkup(
    <AdminDashboard
      windows={[
        { id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 },
      ]}
      googleConnection={{
        status,
        identity:
          status === 'disconnected'
            ? null
            : {
                calendarId: 'owner@example.com',
                summary: 'Cali Castle',
                email: 'owner@example.com',
              },
      }}
      previewSlots={[
        {
          startsAt: '2026-07-15T01:00:00.000Z',
          endsAt: '2026-07-15T02:00:00.000Z',
        },
      ]}
      notices={{ availability: 'invalid', calendar: status }}
    />,
  )
}

describe('AMA admin dashboard UI contract', () => {
  it('keeps bilingual scheduling content and accessible form recovery in static HTML', () => {
    const html = renderDashboard('expired')

    expect(html).toMatch(/<label[^>]+for="[^"]+-weekday-zh"[^>]+data-zh-block="true"/)
    expect(html).toMatch(/<label[^>]+for="[^"]+-weekday-en"[^>]+data-en-block="true"/)
    expect(html).toContain('<option value="1" selected="">星期一</option>')
    expect(html).toContain('<option value="1" selected="">Monday</option>')
    expect(html).toContain('data-zh="true"')
    expect(html).toContain('data-en="true"')
    expect(html).toContain('Wed, Jul 15')
    expect(html).toContain('aria-describedby="availability-notice"')
    expect(html).toContain('id="availability-notice"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('motion-reduce:transition-none')
  })

  it('offers recovery and local disconnect for an unhealthy Calendar connection', () => {
    const html = renderDashboard('revoked')

    expect(html).toContain('action="/api/admin/ama/google/connect"')
    expect(html).toContain('action="/api/admin/ama/google/disconnect"')
    expect(html).toContain('owner@example.com')
  })

  it('does not offer disconnect before a Calendar has connected', () => {
    const html = renderDashboard('disconnected')

    expect(html).toContain('action="/api/admin/ama/google/connect"')
    expect(html).not.toContain('action="/api/admin/ama/google/disconnect"')
  })

  it('does not submit a Google integration change when passkey verification is cancelled', async () => {
    clerk.verifyWithPasskey.mockRejectedValueOnce(
      new Error('passkey cancelled'),
    )
    const nativeSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined)
    const { container } = render(
      <AdminDashboard
        windows={[]}
        googleConnection={{ status: 'disconnected', identity: null }}
        previewSlots={[]}
      />,
    )

    fireEvent.submit(
      container.querySelector<HTMLFormElement>(
        'form[action="/api/admin/ama/google/connect"]',
      )!,
    )

    await waitFor(() => expect(clerk.verifyWithPasskey).toHaveBeenCalledOnce())
    expect(nativeSubmit).not.toHaveBeenCalled()
  })

  it('submits a Google integration change only after passkey verification', async () => {
    const nativeSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => undefined)
    const { container } = render(
      <AdminDashboard
        windows={[]}
        googleConnection={{ status: 'disconnected', identity: null }}
        previewSlots={[]}
      />,
    )
    const form = container.querySelector<HTMLFormElement>(
      'form[action="/api/admin/ama/google/connect"]',
    )!

    fireEvent.submit(form)

    await waitFor(() => expect(nativeSubmit).toHaveBeenCalledOnce())
    expect(clerk.verifyWithPasskey).toHaveBeenCalledOnce()
    expect(nativeSubmit).toHaveBeenCalledWith()
  })

  it('preserves an edited weekday when the locale changes mid-form', () => {
    const { container } = render(<AvailabilityWindowForm />)
    const zhSelect = container.querySelector<HTMLSelectElement>('label[data-zh-block] select')!
    const enSelect = container.querySelector<HTMLSelectElement>('label[data-en-block] select')!

    fireEvent.change(zhSelect, { target: { value: '5' } })
    expect(zhSelect.value).toBe('5')
    expect(enSelect.value).toBe('5')

    act(() => {
      document.documentElement.dataset.locale = 'en'
      window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
    })

    expect(enSelect.value).toBe('5')
    expect(enSelect.options[4]?.text).toBe('Friday')
    expect(zhSelect.options[4]?.text).toBe('星期五')
    const formData = new FormData(container.querySelector('form')!)
    expect(formData.get('weekdayZh')).toBe('5')
    expect(formData.get('weekdayEn')).toBe('5')
    expect(formData.get('weekdayOriginal')).toBe('1')
  })

  it('supports keyboard-style submission with a stable pending state', () => {
    const { container } = render(<AvailabilityWindowForm />)
    const form = container.querySelector('form')!
    form.addEventListener('submit', (event) => event.preventDefault())

    fireEvent.submit(form)

    const save = container.querySelector<HTMLButtonElement>('button[value="create"]')!
    expect(save.disabled).toBe(true)
    expect(save.textContent).toContain('Saving')
    for (const select of container.querySelectorAll('select')) {
      expect(select.disabled).toBe(true)
    }
  })

  it('restores focus to mutation feedback after a redirect render', () => {
    render(
      <AdminDashboard
        windows={[]}
        googleConnection={{ status: 'disconnected', identity: null }}
        previewSlots={[]}
        notices={{ availability: 'saved' }}
      />,
    )

    expect(document.activeElement?.id).toBe('availability-notice')
    expect(document.activeElement?.getAttribute('tabindex')).toBe('-1')
  })

  it('keeps delete idle when confirmation is cancelled and labels the accepted action', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = render(
      <AvailabilityWindowForm
        window={{ id: 1, isoWeekday: 1, startMinute: 540, endMinute: 720 }}
      />,
    )
    const form = container.querySelector('form')!
    form.addEventListener('submit', (event) => event.preventDefault())
    const remove = container.querySelector<HTMLButtonElement>('button[value="delete"]')!

    fireEvent.click(remove)
    expect(confirm).toHaveBeenCalledOnce()
    expect(remove.disabled).toBe(false)

    confirm.mockReturnValue(true)
    fireEvent.click(remove)
    expect(remove.disabled).toBe(true)
    expect(remove.textContent).toContain('Deleting')
  })
})

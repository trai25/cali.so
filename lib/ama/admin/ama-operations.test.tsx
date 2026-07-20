// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AmaOperations,
  type AmaOperationsProps,
} from '../../../app/admin/(protected)/ama/AmaOperations'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  // Notices from localize() follow the admin locale preference.
  document.documentElement.dataset.locale = 'en'
})

afterEach(() => {
  cleanup()
  fetchMock.mockReset()
  delete document.documentElement.dataset.locale
})

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status })
}

// The route owns the page header now; the count line opens the component.
function countLine(container: HTMLElement) {
  return container.querySelector('p')!
}

function buttonWithText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text),
  )
  if (!button) throw new Error(`No button containing "${text}"`)
  return button
}

const upcomingBooking: AmaOperationsProps['bookings'][number] = {
  id: 'bk_upcoming',
  status: 'confirmed',
  guestName: 'Ada Lovelace',
  guestEmail: 'ada@example.com',
  guestTimeZone: 'America/New_York',
  meetingProvider: 'google-meet',
  startsAt: '2026-08-01T02:00:00.000Z',
  endsAt: '2026-08-01T03:00:00.000Z',
  refundStatus: 'none',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  calendarUrl: 'https://calendar.google.com/calendar/u/0/r/eventedit/gcal_1',
  topics: ['AI products', 'independent work'],
  briefPreview: 'I want a practical critique of my launch plan.',
}

const pastBooking: AmaOperationsProps['bookings'][number] = {
  id: 'bk_past',
  status: 'confirmed',
  guestName: 'Grace Hopper',
  guestEmail: 'grace@example.com',
  guestTimeZone: 'Europe/Berlin',
  meetingProvider: 'tencent-meeting',
  startsAt: '2026-06-01T02:00:00.000Z',
  endsAt: '2026-06-01T03:00:00.000Z',
  refundStatus: 'none',
  meetingUrl: 'https://meeting.tencent.com/dm/example',
  calendarUrl: null,
  topics: ['engineering leadership'],
  briefPreview: 'How should I structure a small platform team?',
}

const fixtures: AmaOperationsProps = {
  view: 'attention',
  bookings: [
    {
      id: 'bk_attention',
      status: 'needs_reschedule',
      guestName: 'Alan Turing',
      guestEmail: 'alan@example.com',
      guestTimeZone: 'Asia/Tokyo',
      meetingProvider: 'google-meet',
      startsAt: '2026-08-02T02:00:00.000Z',
      endsAt: '2026-08-02T03:00:00.000Z',
      refundStatus: 'failed',
      meetingUrl: null,
      calendarUrl: null,
      topics: ['career transition'],
      briefPreview: 'I need to choose between two research directions.',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  ownerTimeZone: 'Asia/Taipei',
  filters: {
    guestName: '',
    guestEmail: '',
    bookingId: '',
    status: '',
    from: '',
    to: '',
  },
  attentionTotal: 3,
  timeRequests: [
    {
      id: 'req_1',
      guestName: 'Katherine Johnson',
      guestEmail: 'katherine@example.com',
      guestTimeZone: 'America/Chicago',
      preferredWindows: 'Weekday evenings after 19:00',
      note: 'Any Friday works best.',
      createdAt: '2026-07-10T09:00:00.000Z',
    },
  ],
  failedOperations: [
    {
      id: 'op_failed',
      kind: 'issue_refund',
      bookingId: 'bk_attention',
      status: 'failed',
      attemptCount: 8,
      maxAttempts: 8,
      nextAttemptAt: '2026-07-16T00:00:00.000Z',
      lastErrorCode: 'stripe_unavailable',
    },
  ],
}

const emptyFixtures: AmaOperationsProps = {
  view: 'attention',
  bookings: [],
  total: 0,
  page: 1,
  pageSize: 20,
  ownerTimeZone: 'Asia/Taipei',
  filters: {
    guestName: '',
    guestEmail: '',
    bookingId: '',
    status: '',
    from: '',
    to: '',
  },
  attentionTotal: 0,
  timeRequests: [],
  failedOperations: [],
}

describe('AMA admin page', () => {
  it('defaults to the exception-first view and exposes all four booking views', () => {
    const { container } = render(<AmaOperations {...fixtures} />)
    const text = container.textContent!

    // Header counts: the current result set and everything needing a hand.
    const counts = countLine(container)
    expect(counts.textContent).toContain('1 ')
    expect(counts.textContent).toContain('3 ')
    expect(counts.className).toContain('tabular-nums')

    // Attention remains the first working view: the broken booking, failed
    // operation, and new Alternate Time Request are together.
    const sections = Array.from(container.querySelectorAll('section'))
    expect(sections[0]?.textContent).toContain('Alan Turing')
    expect(sections[0]?.textContent).toContain('stripe_unavailable')
    expect(sections[0]?.textContent).toContain('katherine@example.com')
    expect(sections[0]?.textContent).toContain('Weekday evenings after 19:00')
    expect(sections[0]?.textContent).toContain('Any Friday works best.')
    expect(sections[0]?.querySelector('.text-destructive')).not.toBeNull()

    for (const view of ['attention', 'upcoming', 'past', 'cancelled']) {
      expect(
        container.querySelector(`a[href^="/admin/ama/bookings?view=${view}"]`),
      ).not.toBeNull()
    }

    // The operation-status count strip is gone.
    expect(text).not.toContain('Succeeded')
    expect(text).not.toContain('Running')

    // Settings moved to their own page under the AMA menu.
    expect(text).not.toContain('Weekly Availability Windows')
    expect(
      container.querySelector('form[action="/api/admin/ama/availability"]'),
    ).toBeNull()
  })

  it('puts upcoming prep links, topics, and the Brief preview directly on the row', () => {
    const { container } = render(
      <AmaOperations
        {...fixtures}
        view="upcoming"
        bookings={[upcomingBooking]}
        total={1}
      />,
    )
    const text = container.textContent!

    expect(
      container.querySelector('a[href="/admin/ama/bookings/bk_upcoming"]'),
    ).not.toBeNull()
    expect(text).toContain('(Asia/Taipei)')
    expect(text).toContain('(America/New_York)')
    expect(text).toContain('AI products, independent work')
    expect(text).toContain('I want a practical critique of my launch plan.')
    expect(
      container.querySelector('a[href="https://meet.google.com/abc-defg-hij"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('a[href*="calendar.google.com"]'),
    ).not.toBeNull()
  })

  it('renders past Bookings as a first-class URL view', () => {
    const { container } = render(
      <AmaOperations
        {...fixtures}
        view="past"
        bookings={[pastBooking]}
        total={1}
      />,
    )

    expect(container.textContent).toContain('Grace Hopper')
    expect(container.querySelector('button[aria-controls="past-bookings"]')).toBeNull()
  })

  it('renders all booking filters and paginates from the real total', () => {
    const { container } = render(
      <AmaOperations
        {...fixtures}
        view="upcoming"
        bookings={[upcomingBooking]}
        total={45}
        page={2}
        filters={{
          guestName: 'Ada',
          guestEmail: 'ada@example.com',
          bookingId: 'bk_upcoming',
          status: 'confirmed',
          from: '2026-08-01',
          to: '2026-08-31',
        }}
      />,
    )

    for (const name of [
      'guestName',
      'guestEmail',
      'bookingId',
      'status',
      'from',
      'to',
    ]) {
      expect(container.querySelector(`[name="${name}"]`)).not.toBeNull()
    }
    expect(container.textContent).toContain('21–40 of 45')
    expect(container.textContent).toContain('Page 2 of 3')
    expect(container.querySelector('a[href*="page=3"]')).not.toBeNull()
  })

  it('shows one quiet all-clear line when nothing needs attention', () => {
    const { container } = render(<AmaOperations {...emptyFixtures} />)
    const text = container.textContent!

    expect(text).toContain('All clear.')
    expect(text).toContain('0–0 of 0')
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('resolves an Alternate Time Request, removes its row, and drops the count', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'done' }))
    const { container } = render(<AmaOperations {...fixtures} />)

    fireEvent.click(buttonWithText(container, 'Resolve'))

    await waitFor(() =>
      expect(container.textContent).not.toContain('katherine@example.com'),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/ama/time-requests/req_1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'resolve' }),
      }),
    )
    expect(container.textContent).toContain('Marked as resolved.')
    expect(countLine(container).textContent).toContain('2 ')
  })

  it('retries a failed operation from the attention section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'done' }))
    const { container } = render(<AmaOperations {...fixtures} />)

    fireEvent.click(buttonWithText(container, 'Retry'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ama/operations/op_failed',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'retry' }),
        }),
      ),
    )
    await waitFor(() =>
      expect(container.textContent).not.toContain('stripe_unavailable'),
    )
    // The retried operation no longer offers Retry (it is pending again).
    expect(
      Array.from(container.querySelectorAll('button')).some((item) =>
        item.textContent?.includes('Retry'),
      ),
    ).toBe(false)
    expect(countLine(container).textContent).toContain('2 ')
  })

  it('requires an inline confirm before marking an operation resolved', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ result: 'done' }))
    const { container } = render(<AmaOperations {...fixtures} />)

    fireEvent.click(buttonWithText(container, 'Mark resolved'))
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(buttonWithText(container, 'Confirm done outside the system'))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ama/operations/op_failed',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'resolve' }),
        }),
      ),
    )
    await waitFor(() =>
      expect(container.textContent).toContain('Marked as manually resolved.'),
    )
    expect(container.textContent).not.toContain('stripe_unavailable')
  })

  it('keeps the row and shows a specific notice when an action fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'dependency_unavailable' }, 503),
    )
    const { container } = render(<AmaOperations {...fixtures} />)

    fireEvent.click(buttonWithText(container, 'Retry'))

    await waitFor(() =>
      expect(container.textContent).toContain(
        'Retry failed: the service is unavailable. Try again.',
      ),
    )
    expect(container.textContent).toContain('stripe_unavailable')
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0)
  })
})

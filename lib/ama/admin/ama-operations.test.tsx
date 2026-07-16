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

function buttonWithText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent?.includes(text),
  )
  if (!button) throw new Error(`No button containing "${text}"`)
  return button
}

const fixtures: AmaOperationsProps = {
  counts: { pending: 1, failed: 2, succeeded: 5 },
  upcoming: [
    {
      id: 'bk_upcoming',
      status: 'confirmed',
      guestName: 'Ada Lovelace',
      guestEmail: 'ada@example.com',
      guestTimeZone: 'America/New_York',
      meetingProvider: 'google-meet',
      startsAt: '2026-08-01T02:00:00.000Z',
      endsAt: '2026-08-01T03:00:00.000Z',
      refundStatus: 'none',
    },
  ],
  past: [
    {
      id: 'bk_past',
      status: 'confirmed',
      guestName: 'Grace Hopper',
      guestEmail: 'grace@example.com',
      guestTimeZone: 'Europe/Berlin',
      meetingProvider: 'tencent-meeting',
      startsAt: '2026-06-01T02:00:00.000Z',
      endsAt: '2026-06-01T03:00:00.000Z',
      refundStatus: 'none',
    },
  ],
  attention: [
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
    },
  ],
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
  operations: [
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
    {
      id: 'op_pending',
      kind: 'send_reminder',
      bookingId: 'bk_upcoming',
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 8,
      nextAttemptAt: '2026-07-20T00:00:00.000Z',
      lastErrorCode: null,
    },
  ],
}

const emptyFixtures: AmaOperationsProps = {
  counts: {},
  upcoming: [],
  past: [],
  attention: [],
  timeRequests: [],
  operations: [],
}

describe('AMA operations dashboard', () => {
  it('renders the status strip, bookings, requests, and operations', () => {
    const { container } = render(<AmaOperations {...fixtures} />)
    const text = container.textContent!

    // Status strip highlights failures and keeps counts tabular.
    expect(text).toContain('Failed')
    expect(container.querySelector('dl .text-destructive')).not.toBeNull()

    // Upcoming booking row with owner and guest zone labels.
    expect(text).toContain('Ada Lovelace')
    expect(text).toContain('(Asia/Taipei)')
    expect(text).toContain('(America/New_York)')
    expect(
      container.querySelector('a[href="/admin/ama/bookings/bk_upcoming"]'),
    ).not.toBeNull()

    // Alternate Time Request content.
    expect(text).toContain('katherine@example.com')
    expect(text).toContain('Weekday evenings after 19:00')
    expect(text).toContain('Any Friday works best.')

    // Operation rows: kind, attempts, error code, booking link.
    expect(text).toContain('Issue refund')
    expect(text).toContain('8/8')
    expect(text).toContain('stripe_unavailable')
    expect(text).toContain('View Booking')
  })

  it('renders empty states that preserve every section', () => {
    const { container } = render(<AmaOperations {...emptyFixtures} />)
    const text = container.textContent!

    expect(text).toContain('There are no upcoming Bookings.')
    expect(text).toContain('There are no new Alternate Time Requests.')
    expect(text).toContain('There are no operations needing recovery.')
    // The status strip keeps its shape with zero counts.
    expect(text).toContain('Pending')
    expect(container.querySelectorAll('section').length).toBeGreaterThanOrEqual(4)
  })

  it('switches booking lists through the tabs', () => {
    const { container } = render(<AmaOperations {...fixtures} />)

    expect(container.textContent).toContain('Ada Lovelace')
    expect(container.textContent).not.toContain('Grace Hopper')

    fireEvent.click(buttonWithText(container, 'Past'))
    expect(container.textContent).toContain('Grace Hopper')
    expect(container.textContent).not.toContain('Ada Lovelace')

    fireEvent.click(buttonWithText(container, 'Needs attention'))
    expect(container.textContent).toContain('Alan Turing')
    expect(container.textContent).toContain('Refund failed')
  })

  it('resolves an Alternate Time Request and removes its row', async () => {
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
  })

  it('retries a failed operation and reconciles its status and the counts', async () => {
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
    // Counts moved one operation from failed to pending: 2 -> 1, 1 -> 2.
    const strip = container.querySelector('dl')!
    expect(strip.textContent).toContain('1')
    expect(strip.textContent).toContain('2')
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

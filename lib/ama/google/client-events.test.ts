import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createGoogleCalendarClient } from './client'

function makeClient(fetch: typeof globalThis.fetch) {
  return createGoogleCalendarClient({
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
    fetch,
    clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
  })
}

function insertInput(overrides?: Partial<Parameters<
  ReturnType<typeof createGoogleCalendarClient>['insertCalendarEvent']
>[0]>) {
  return {
    accessToken: 'access-token-value',
    eventId: 'a1b2c3d4e5f6',
    summary: 'AMA with Guest',
    description: 'Ask me anything.',
    location: null,
    startsAt: new Date('2026-07-20T09:00:00.000Z'),
    endsAt: new Date('2026-07-20T09:30:00.000Z'),
    attendee: { email: 'guest@example.com', displayName: 'Guest Name' },
    withMeetConference: true,
    ...overrides,
  }
}

describe('Google Calendar event writes', () => {
  it('inserts an event with a Meet conference and returns its hangout link', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        id: 'a1b2c3d4e5f6',
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
      }),
    )
    const client = makeClient(fetch)

    const result = await client.insertCalendarEvent(insertInput())

    expect(result).toEqual({
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      created: true,
    })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    )
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer access-token-value',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      id: 'a1b2c3d4e5f6',
      summary: 'AMA with Guest',
      description: 'Ask me anything.',
      start: { dateTime: '2026-07-20T09:00:00.000Z', timeZone: 'UTC' },
      end: { dateTime: '2026-07-20T09:30:00.000Z', timeZone: 'UTC' },
      attendees: [{ email: 'guest@example.com', displayName: 'Guest Name' }],
      conferenceData: {
        createRequest: {
          requestId: 'a1b2c3d4e5f6',
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    })
  })

  it('extracts the Meet URL from conference entry points when hangoutLink is absent', async () => {
    const client = makeClient(
      vi.fn(async () =>
        Response.json({
          conferenceData: {
            entryPoints: [
              { entryPointType: 'phone', uri: 'tel:+1-555-0100' },
              { entryPointType: 'video', uri: 'https://meet.google.com/xyz-uvwx-yza' },
            ],
          },
        }),
      ),
    )

    const result = await client.insertCalendarEvent(insertInput())

    expect(result).toEqual({
      meetUrl: 'https://meet.google.com/xyz-uvwx-yza',
      created: true,
    })
  })

  it('omits conference data when no Meet conference is requested and includes a location', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'a1b2c3d4e5f6' }))
    const client = makeClient(fetch)

    const result = await client.insertCalendarEvent(
      insertInput({ withMeetConference: false, location: 'Taipei 101' }),
    )

    expect(result).toEqual({ meetUrl: null, created: true })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.conferenceData).toBeUndefined()
    expect(body.location).toBe('Taipei 101')
  })

  it('treats an event id conflict as an idempotent retry and reads the existing event', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'The requested identifier already exists.' } }, {
          status: 409,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'a1b2c3d4e5f6',
          hangoutLink: 'https://meet.google.com/pre-exist-ing',
        }),
      )
    const client = makeClient(fetch)

    const result = await client.insertCalendarEvent(insertInput())

    expect(result).toEqual({
      meetUrl: 'https://meet.google.com/pre-exist-ing',
      created: false,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/a1b2c3d4e5f6',
    )
    expect(init?.method).toBeUndefined()
    expect(init?.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer access-token-value',
    })
  })

  it('normalizes an insert 401 as an expired or revoked connection', async () => {
    const client = makeClient(
      vi.fn(async () =>
        Response.json({ error: { message: 'invalid credentials' } }, { status: 401 }),
      ),
    )

    await expect(client.insertCalendarEvent(insertInput())).rejects.toMatchObject({
      code: 'expired_or_revoked',
      message: 'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
    })
  })

  it('normalizes an insert outage without leaking the access token or raw body', async () => {
    const client = makeClient(
      vi.fn(async () =>
        Response.json(
          { error: { message: 'access-token-must-stay-private raw outage detail' } },
          { status: 503 },
        ),
      ),
    )

    const error = await client
      .insertCalendarEvent(insertInput({ accessToken: 'access-token-must-stay-private' }))
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 'provider_unavailable',
      message: 'Google Calendar is temporarily unavailable.',
    })
    expect(String(error)).not.toContain('access-token-must-stay-private')
    expect(JSON.stringify(error)).not.toContain('access-token-must-stay-private')
    expect(String(error)).not.toContain('raw outage detail')
  })

  it('fails closed when the insert response is not JSON', async () => {
    const client = makeClient(
      vi.fn(async () =>
        new Response('not-json-at-all', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(client.insertCalendarEvent(insertInput())).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Google Calendar returned an invalid response.',
    })
  })

  it('patches event times and notifies attendees', async () => {
    const fetch = vi.fn(async () => Response.json({ id: 'a1b2c3d4e5f6' }))
    const client = makeClient(fetch)

    const outcome = await client.patchCalendarEventTime({
      accessToken: 'access-token-value',
      eventId: 'a1b2c3d4e5f6',
      startsAt: new Date('2026-07-21T09:00:00.000Z'),
      endsAt: new Date('2026-07-21T09:30:00.000Z'),
    })

    expect(outcome).toBe('done')
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/a1b2c3d4e5f6?sendUpdates=all',
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer access-token-value',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: { dateTime: '2026-07-21T09:00:00.000Z', timeZone: 'UTC' },
          end: { dateTime: '2026-07-21T09:30:00.000Z', timeZone: 'UTC' },
        }),
      },
    )
  })

  it('reports a missing event when a patch target no longer exists', async () => {
    const client = makeClient(
      vi.fn(async () =>
        Response.json({ error: { message: 'Not Found' } }, { status: 404 }),
      ),
    )

    const outcome = await client.patchCalendarEventTime({
      accessToken: 'access-token-value',
      eventId: 'a1b2c3d4e5f6',
      startsAt: new Date('2026-07-21T09:00:00.000Z'),
      endsAt: new Date('2026-07-21T09:30:00.000Z'),
    })

    expect(outcome).toBe('missing')
  })

  it('deletes an event and notifies attendees', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    const client = makeClient(fetch)

    const outcome = await client.deleteCalendarEvent({
      accessToken: 'access-token-value',
      eventId: 'a1b2c3d4e5f6',
    })

    expect(outcome).toBe('done')
    expect(fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/a1b2c3d4e5f6?sendUpdates=all',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer access-token-value' },
      },
    )
  })

  it('reports an already-deleted event as missing', async () => {
    const client = makeClient(
      vi.fn(async () =>
        Response.json({ error: { message: 'Resource has been deleted' } }, { status: 410 }),
      ),
    )

    const outcome = await client.deleteCalendarEvent({
      accessToken: 'access-token-value',
      eventId: 'a1b2c3d4e5f6',
    })

    expect(outcome).toBe('missing')
  })
})

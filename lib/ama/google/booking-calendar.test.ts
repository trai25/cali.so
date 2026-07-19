import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { CalendarEventInput } from '../meeting/calendar'
import { createSecretBox, type EncryptedSecretEnvelope } from '../secrets'
import { GOOGLE_CALENDAR_SCOPES, GoogleCalendarError } from './client'
import {
  createGoogleBookingCalendar,
  type GoogleBookingCalendarProvider,
} from './booking-calendar'
import type { GoogleCalendarConnection, GoogleCalendarRepository } from './service'

function connectedConnection(
  refreshTokenEnvelope: EncryptedSecretEnvelope,
): GoogleCalendarConnection {
  const connectedAt = new Date('2026-07-14T04:00:00.000Z')
  return {
    id: 1,
    status: 'connected',
    calendarId: 'owner@example.com',
    calendarEmail: 'owner@example.com',
    calendarSummary: 'Cali Castle',
    grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
    refreshTokenEnvelope,
    accessTokenExpiresAt: new Date('2026-07-14T05:00:00.000Z'),
    lastErrorCode: null,
    connectedAt,
    createdAt: connectedAt,
    updatedAt: connectedAt,
  }
}

function fixture(initialConnection: GoogleCalendarConnection | null = null) {
  const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
  const now = new Date('2026-07-16T08:00:00.000Z')
  let connection = initialConnection

  const repository: GoogleCalendarRepository = {
    async createOAuthAttempt() {
      throw new Error('not used by booking calendar')
    },
    async consumeOAuthAttempt() {
      throw new Error('not used by booking calendar')
    },
    async getConnection() {
      return connection
    },
    async saveConnection(input) {
      connection = { id: 1, createdAt: connection?.createdAt ?? input.updatedAt, ...input }
      return connection
    },
    async setConnectionStatus(status, lastErrorCode, updatedAt) {
      connection = {
        id: 1,
        status,
        calendarId: connection?.calendarId ?? null,
        calendarEmail: connection?.calendarEmail ?? null,
        calendarSummary: connection?.calendarSummary ?? null,
        grantedScopes: connection?.grantedScopes ?? [],
        refreshTokenEnvelope: connection?.refreshTokenEnvelope ?? null,
        accessTokenExpiresAt: connection?.accessTokenExpiresAt ?? null,
        lastErrorCode,
        connectedAt: connection?.connectedAt ?? null,
        createdAt: connection?.createdAt ?? updatedAt,
        updatedAt,
      }
      return connection
    },
    async disconnect() {
      throw new Error('not used by booking calendar')
    },
  }

  const calls: unknown[] = []
  const provider: GoogleBookingCalendarProvider = {
    async refreshAccessToken(refreshToken) {
      calls.push(['refresh', refreshToken])
      return {
        accessToken: 'fresh-access-token',
        expiresAt: new Date('2026-07-16T09:00:00.000Z'),
      }
    },
    async insertCalendarEvent(input) {
      calls.push(['insert', input])
      return { meetUrl: 'https://meet.google.com/abc-defg-hij', created: true }
    },
    async patchCalendarEventTime(input) {
      calls.push(['patch', input])
      return 'done'
    },
    async deleteCalendarEvent(input) {
      calls.push(['delete', input])
      return 'done'
    },
  }

  const calendar = createGoogleBookingCalendar({
    repository,
    provider,
    secretBox: box,
    clock: { now: () => now },
  })

  return {
    calendar,
    provider,
    box,
    calls,
    get connection() {
      return connection
    },
    setConnection(value: GoogleCalendarConnection | null) {
      connection = value
    },
  }
}

function eventInput(): CalendarEventInput {
  return {
    eventId: 'a1b2c3d4e5f6',
    summary: 'AMA with Guest',
    description: 'Ask me anything.',
    location: null,
    startsAt: new Date('2026-07-20T09:00:00.000Z'),
    endsAt: new Date('2026-07-20T09:30:00.000Z'),
    guestEmail: 'guest@example.com',
    guestName: 'Guest Name',
    withMeetConference: true,
  }
}

describe('Google booking calendar', () => {
  it('reports a disconnected calendar without contacting Google', async () => {
    const f = fixture()

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({ status: 'disconnected' })
    expect(f.calls).toEqual([])
  })

  it('maps stored failure states to their public statuses', async () => {
    const f = fixture()
    f.setConnection({
      ...connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')),
      status: 'denied_scope',
    })

    const result = await f.calendar.deleteEvent('a1b2c3d4e5f6')

    expect(result).toEqual({ status: 'denied-scope' })
    expect(f.calls).toEqual([])
  })

  it('creates an event with a freshly minted access token and the connected calendar', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({
      status: 'created',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
    })
    expect(f.calls).toEqual([
      ['refresh', 'refresh-token'],
      [
        'insert',
        {
          accessToken: 'fresh-access-token',
          calendarId: 'owner@example.com',
          eventId: 'a1b2c3d4e5f6',
          summary: 'AMA with Guest',
          description: 'Ask me anything.',
          location: null,
          startsAt: new Date('2026-07-20T09:00:00.000Z'),
          endsAt: new Date('2026-07-20T09:30:00.000Z'),
          attendee: { email: 'guest@example.com', displayName: 'Guest Name' },
          withMeetConference: true,
        },
      ],
    ])
  })

  it('treats an idempotent insert retry as a created event', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.insertCalendarEvent = async () => ({
      meetUrl: 'https://meet.google.com/pre-exist-ing',
      created: false,
    })

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({
      status: 'created',
      meetUrl: 'https://meet.google.com/pre-exist-ing',
    })
  })

  it('records denied scope and reports it when Google rejects the write', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.insertCalendarEvent = async () => {
      throw new GoogleCalendarError(
        'denied_scope',
        'Google Calendar permissions were not granted.',
      )
    }

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({ status: 'denied-scope' })
    expect(f.connection).toMatchObject({
      status: 'denied_scope',
      lastErrorCode: 'denied_scope',
      updatedAt: new Date('2026-07-16T08:00:00.000Z'),
    })
  })

  it('marks the connection revoked when refresh credentials are rejected', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.refreshAccessToken = async () => {
      throw new GoogleCalendarError(
        'expired_or_revoked',
        'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
      )
    }

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({ status: 'revoked' })
    expect(f.connection).toMatchObject({ status: 'revoked', lastErrorCode: 'invalid_grant' })
  })

  it('reports transient provider failures as unavailable without mutating the connection', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.insertCalendarEvent = async () => {
      throw new GoogleCalendarError(
        'provider_unavailable',
        'Google Calendar is temporarily unavailable.',
      )
    }

    const result = await f.calendar.createEvent(eventInput())

    expect(result).toEqual({ status: 'unavailable' })
    expect(f.connection).toMatchObject({ status: 'connected' })
  })

  it('moves an event and relays a done outcome', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))

    const result = await f.calendar.moveEvent({
      eventId: 'a1b2c3d4e5f6',
      startsAt: new Date('2026-07-21T09:00:00.000Z'),
      endsAt: new Date('2026-07-21T09:30:00.000Z'),
    })

    expect(result).toEqual({ status: 'done' })
    expect(f.calls).toContainEqual([
      'patch',
      {
        accessToken: 'fresh-access-token',
        calendarId: 'owner@example.com',
        eventId: 'a1b2c3d4e5f6',
        startsAt: new Date('2026-07-21T09:00:00.000Z'),
        endsAt: new Date('2026-07-21T09:30:00.000Z'),
      },
    ])
  })

  it('relays a missing event outcome from a move', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.patchCalendarEventTime = async () => 'missing'

    const result = await f.calendar.moveEvent({
      eventId: 'a1b2c3d4e5f6',
      startsAt: new Date('2026-07-21T09:00:00.000Z'),
      endsAt: new Date('2026-07-21T09:30:00.000Z'),
    })

    expect(result).toEqual({ status: 'missing' })
  })

  it('deletes an event on the connected calendar', async () => {
    const f = fixture()
    f.setConnection(connectedConnection(f.box.seal('refresh-token', 'google-refresh-token')))
    f.provider.deleteCalendarEvent = async () => 'missing'

    const result = await f.calendar.deleteEvent('a1b2c3d4e5f6')

    expect(result).toEqual({ status: 'missing' })
    expect(f.calls).toContainEqual(['refresh', 'refresh-token'])
  })
})

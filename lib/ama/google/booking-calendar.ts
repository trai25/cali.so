import 'server-only'

import type {
  BookingCalendar,
  CalendarEventInput,
  CalendarEventResult,
  CalendarMutationResult,
  CalendarWriteStatus,
} from '../meeting/calendar'
import type { createSecretBox } from '../secrets'
import {
  GoogleCalendarError,
  type GoogleCalendarEventResult,
  type GoogleCalendarMutationOutcome,
} from './client'
import type { GoogleCalendarRepository, GoogleConnectionStatus } from './service'

type FailureStatus = Exclude<CalendarWriteStatus, 'connected'>

export interface GoogleBookingCalendarProvider {
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken?: string
    expiresAt: Date
  }>
  insertCalendarEvent(input: {
    accessToken: string
    calendarId?: string
    eventId: string
    summary: string
    description: string
    location: string | null
    startsAt: Date
    endsAt: Date
    attendee: { email: string; displayName: string }
    withMeetConference: boolean
  }): Promise<GoogleCalendarEventResult>
  patchCalendarEventTime(input: {
    accessToken: string
    calendarId?: string
    eventId: string
    startsAt: Date
    endsAt: Date
  }): Promise<GoogleCalendarMutationOutcome>
  deleteCalendarEvent(input: {
    accessToken: string
    calendarId?: string
    eventId: string
  }): Promise<GoogleCalendarMutationOutcome>
}

type GoogleBookingCalendarDependencies = {
  repository: GoogleCalendarRepository
  provider: GoogleBookingCalendarProvider
  secretBox: ReturnType<typeof createSecretBox>
  clock?: { now(): Date }
}

function notConnectedStatus(status: GoogleConnectionStatus | undefined): FailureStatus {
  if (!status || status === 'disconnected') return 'disconnected'
  if (status === 'denied_scope') return 'denied-scope'
  // A connection marked connected without a refresh token is unusable.
  if (status === 'error' || status === 'connected') return 'unavailable'
  return status
}

export function createGoogleBookingCalendar(
  dependencies: GoogleBookingCalendarDependencies,
): BookingCalendar {
  const { repository, provider, secretBox, clock = { now: () => new Date() } } = dependencies

  async function setFailure(error: unknown, now: Date): Promise<FailureStatus> {
    if (error instanceof GoogleCalendarError && error.code === 'denied_scope') {
      await repository.setConnectionStatus('denied_scope', 'denied_scope', now)
      return 'denied-scope'
    }
    if (error instanceof GoogleCalendarError && error.code === 'expired_or_revoked') {
      await repository.setConnectionStatus('revoked', 'invalid_grant', now)
      return 'revoked'
    }
    return 'unavailable'
  }

  async function withAccessToken<Success>(
    operation: (context: {
      accessToken: string
      calendarId: string | undefined
    }) => Promise<Success>,
  ): Promise<Success | { status: FailureStatus }> {
    const connection = await repository.getConnection()
    if (
      !connection ||
      connection.status !== 'connected' ||
      !connection.refreshTokenEnvelope
    ) {
      return { status: notConnectedStatus(connection?.status) }
    }

    const now = clock.now()
    try {
      const refreshToken = secretBox.open(
        connection.refreshTokenEnvelope,
        'google-refresh-token',
      )
      const tokens = await provider.refreshAccessToken(refreshToken)
      if (!tokens.accessToken) return { status: 'unavailable' as const }
      return await operation({
        accessToken: tokens.accessToken,
        calendarId: connection.calendarId ?? undefined,
      })
    } catch (error) {
      return { status: await setFailure(error, now) }
    }
  }

  return {
    async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
      return withAccessToken(async ({ accessToken, calendarId }) => {
        const event = await provider.insertCalendarEvent({
          accessToken,
          calendarId,
          eventId: input.eventId,
          summary: input.summary,
          description: input.description,
          location: input.location,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          attendee: { email: input.guestEmail, displayName: input.guestName },
          withMeetConference: input.withMeetConference,
        })
        // An idempotent 409 retry still means the event exists as requested.
        return { status: 'created' as const, meetUrl: event.meetUrl }
      })
    },

    async moveEvent(input: {
      eventId: string
      startsAt: Date
      endsAt: Date
    }): Promise<CalendarMutationResult> {
      return withAccessToken(async ({ accessToken, calendarId }) => {
        const outcome = await provider.patchCalendarEventTime({
          accessToken,
          calendarId,
          eventId: input.eventId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        })
        return { status: outcome }
      })
    },

    async deleteEvent(eventId: string): Promise<CalendarMutationResult> {
      return withAccessToken(async ({ accessToken, calendarId }) => {
        const outcome = await provider.deleteCalendarEvent({
          accessToken,
          calendarId,
          eventId,
        })
        return { status: outcome }
      })
    },
  }
}

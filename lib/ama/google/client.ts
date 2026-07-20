import 'server-only'

import { createHash } from 'node:crypto'

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOCATION_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
] as const

export type GoogleCalendarErrorCode =
  | 'denied_scope'
  | 'expired_or_revoked'
  | 'provider_unavailable'
  | 'invalid_response'

export class GoogleCalendarError extends Error {
  constructor(
    readonly code: GoogleCalendarErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'GoogleCalendarError'
  }
}

type GoogleCalendarClientDependencies = {
  clientId: string
  clientSecret: string
  fetch: typeof fetch
  clock: { now(): Date }
}

type AuthorizationUrlInput = {
  state: string
  codeVerifier: string
  redirectUri: URL
}

type AuthorizationCodeInput = {
  code: string
  codeVerifier: string
  redirectUri: URL
}

type GoogleTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

export type GoogleBusyInterval = {
  start: string
  end: string
}

type FreeBusyInput = {
  accessToken: string
  calendarId?: string
  timeMin: Date
  timeMax: Date
}

type CalendarEventPathInput = {
  accessToken: string
  calendarId?: string
  eventId: string
}

type InsertCalendarEventInput = CalendarEventPathInput & {
  summary: string
  description: string
  location: string | null
  startsAt: Date
  endsAt: Date
  attendee: { email: string; displayName: string }
  withMeetConference: boolean
}

export type GoogleCalendarEventResult = {
  meetUrl: string | null
  created: boolean
}

export type GoogleCalendarMutationOutcome = 'done' | 'missing'

function pkceChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function googleErrorReasons(response: Response): Promise<string[]> {
  try {
    const payload = (await response.clone().json()) as {
      error?: { errors?: Array<{ reason?: unknown }> }
    }
    return (payload.error?.errors ?? []).flatMap((error) =>
      typeof error.reason === 'string' ? [error.reason] : [],
    )
  } catch {
    return []
  }
}

async function assertCalendarResponse(response: Response) {
  if (response.ok) return
  if (response.status === 401) {
    throw new GoogleCalendarError(
      'expired_or_revoked',
      'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
    )
  }
  if (response.status === 403) {
    const denied = (await googleErrorReasons(response)).includes('insufficientPermissions')
    throw new GoogleCalendarError(
      denied ? 'denied_scope' : 'provider_unavailable',
      denied
        ? 'Google Calendar permissions were not granted.'
        : 'Google Calendar is temporarily unavailable.',
    )
  }
  throw new GoogleCalendarError(
    'provider_unavailable',
    'Google Calendar is temporarily unavailable.',
  )
}

function invalidResponse(): never {
  throw new GoogleCalendarError(
    'invalid_response',
    'Google Calendar returned an invalid response.',
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return invalidResponse()
  }
}

function eventTime(value: Date) {
  return { dateTime: value.toISOString(), timeZone: 'UTC' }
}

function calendarEventUrl(calendarId: string | undefined, eventId: string) {
  const calendar = encodeURIComponent(calendarId ?? 'primary')
  return `${GOOGLE_CALENDAR_API}/calendars/${calendar}/events/${encodeURIComponent(eventId)}`
}

function meetUrlFrom(payload: Record<string, unknown>): string | null {
  if (typeof payload.hangoutLink === 'string' && payload.hangoutLink) {
    return payload.hangoutLink
  }
  if (!isRecord(payload.conferenceData) || !Array.isArray(payload.conferenceData.entryPoints)) {
    return null
  }
  for (const entryPoint of payload.conferenceData.entryPoints) {
    if (
      isRecord(entryPoint) &&
      entryPoint.entryPointType === 'video' &&
      typeof entryPoint.uri === 'string'
    ) {
      return entryPoint.uri
    }
  }
  return null
}

async function readProviderErrorCode(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { error?: unknown }
    return typeof payload.error === 'string' ? payload.error : null
  } catch {
    return null
  }
}

export function createGoogleCalendarClient(dependencies: GoogleCalendarClientDependencies) {
  async function request(input: string, init?: RequestInit) {
    try {
      return await dependencies.fetch(input, init)
    } catch {
      throw new GoogleCalendarError(
        'provider_unavailable',
        'Google Calendar is temporarily unavailable.',
      )
    }
  }

  async function getCalendarEvent(
    input: CalendarEventPathInput,
  ): Promise<{ meetUrl: string | null }> {
    const response = await request(calendarEventUrl(input.calendarId, input.eventId), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
    })
    await assertCalendarResponse(response)
    const payload = await readJson(response)
    if (!isRecord(payload)) invalidResponse()
    return { meetUrl: meetUrlFrom(payload) }
  }

  return {
    createAuthorizationUrl(input: AuthorizationUrlInput) {
      const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT)
      url.search = new URLSearchParams({
        access_type: 'offline',
        client_id: dependencies.clientId,
        code_challenge: pkceChallenge(input.codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'consent',
        redirect_uri: input.redirectUri.toString(),
        response_type: 'code',
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
        state: input.state,
      }).toString()
      return url
    },

    async exchangeAuthorizationCode(input: AuthorizationCodeInput) {
      const response = await request(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: dependencies.clientId,
          client_secret: dependencies.clientSecret,
          code: input.code,
          code_verifier: input.codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: input.redirectUri.toString(),
        }),
      })
      if (!response.ok) {
        const providerError = await readProviderErrorCode(response)
        throw new GoogleCalendarError(
          providerError === 'invalid_scope' ? 'denied_scope' : 'provider_unavailable',
          providerError === 'invalid_scope'
            ? 'Google Calendar permissions were not granted.'
            : 'Google Calendar is temporarily unavailable.',
        )
      }
      const parsed = await readJson(response)
      if (!isRecord(parsed)) invalidResponse()
      const payload = parsed as GoogleTokenResponse
      if (
        typeof payload.access_token !== 'string' ||
        !payload.access_token ||
        typeof payload.refresh_token !== 'string' ||
        !payload.refresh_token ||
        typeof payload.expires_in !== 'number' ||
        !Number.isFinite(payload.expires_in) ||
        payload.expires_in <= 0
      ) {
        invalidResponse()
      }
      if (payload.scope === undefined || payload.scope === '') {
        throw new GoogleCalendarError(
          'denied_scope',
          'Google Calendar permissions were not granted.',
        )
      }
      if (typeof payload.scope !== 'string') {
        invalidResponse()
      }
      const grantedScopes = new Set(payload.scope.split(/\s+/).filter(Boolean))
      if (
        GOOGLE_CALENDAR_SCOPES.some((scope) => !grantedScopes.has(scope))
      ) {
        throw new GoogleCalendarError(
          'denied_scope',
          'Google Calendar permissions were not granted.',
        )
      }
      return {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: new Date(
          dependencies.clock.now().getTime() + payload.expires_in * 1000,
        ),
      }
    },

    async refreshAccessToken(refreshToken: string) {
      const response = await request(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: dependencies.clientId,
          client_secret: dependencies.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })
      if (!response.ok) {
        if ((await readProviderErrorCode(response)) === 'invalid_grant') {
          throw new GoogleCalendarError(
            'expired_or_revoked',
            'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
          )
        }
        throw new GoogleCalendarError(
          'provider_unavailable',
          'Google Calendar is temporarily unavailable.',
        )
      }
      const parsed = await readJson(response)
      if (!isRecord(parsed)) invalidResponse()
      const payload = parsed as GoogleTokenResponse
      if (
        typeof payload.access_token !== 'string' ||
        !payload.access_token ||
        typeof payload.expires_in !== 'number' ||
        !Number.isFinite(payload.expires_in) ||
        payload.expires_in <= 0
      ) {
        invalidResponse()
      }
      return {
        accessToken: payload.access_token,
        expiresAt: new Date(
          dependencies.clock.now().getTime() + payload.expires_in * 1000,
        ),
      }
    },

    async queryFreeBusy(input: FreeBusyInput): Promise<GoogleBusyInterval[]> {
      const calendarId = input.calendarId ?? 'primary'
      const response = await request(`${GOOGLE_CALENDAR_API}/freeBusy`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: input.timeMin.toISOString(),
          timeMax: input.timeMax.toISOString(),
          items: [{ id: calendarId }],
        }),
      })
      await assertCalendarResponse(response)
      const payload = await readJson(response)
      if (!isRecord(payload) || !isRecord(payload.calendars)) invalidResponse()
      const calendar = payload.calendars[calendarId]
      if (!isRecord(calendar) || !Array.isArray(calendar.busy)) invalidResponse()
      if (calendar.errors !== undefined && !Array.isArray(calendar.errors)) invalidResponse()
      const errors = calendar.errors ?? []
      if (errors.length) {
        const denied = errors.some(
          (error) => isRecord(error) && error.reason === 'insufficientPermissions',
        )
        throw new GoogleCalendarError(
          denied ? 'denied_scope' : 'provider_unavailable',
          denied
            ? 'Google Calendar permissions were not granted.'
            : 'Google Calendar is temporarily unavailable.',
        )
      }
      return calendar.busy.map((interval) => {
        if (!isRecord(interval)) return invalidResponse()
        const start = Date.parse(typeof interval.start === 'string' ? interval.start : '')
        const end = Date.parse(typeof interval.end === 'string' ? interval.end : '')
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          return invalidResponse()
        }
        return {
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
        }
      })
    },

    getCalendarEvent,

    async insertCalendarEvent(input: InsertCalendarEventInput): Promise<GoogleCalendarEventResult> {
      const calendar = encodeURIComponent(input.calendarId ?? 'primary')
      const response = await request(
        `${GOOGLE_CALENDAR_API}/calendars/${calendar}/events?conferenceDataVersion=1&sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: input.eventId,
            summary: input.summary,
            description: input.description,
            ...(input.location === null ? {} : { location: input.location }),
            start: eventTime(input.startsAt),
            end: eventTime(input.endsAt),
            attendees: [
              {
                email: input.attendee.email,
                displayName: input.attendee.displayName,
              },
            ],
            ...(input.withMeetConference
              ? {
                  conferenceData: {
                    createRequest: {
                      requestId: input.eventId,
                      conferenceSolutionKey: { type: 'hangoutsMeet' },
                    },
                  },
                }
              : {}),
          }),
        },
      )
      if (response.status === 409) {
        // Stable event ids make inserts idempotent: a conflict means an
        // earlier attempt already created this event.
        const existing = await getCalendarEvent(input)
        return { meetUrl: existing.meetUrl, created: false }
      }
      await assertCalendarResponse(response)
      const payload = await readJson(response)
      if (!isRecord(payload)) invalidResponse()
      return { meetUrl: meetUrlFrom(payload), created: true }
    },

    async patchCalendarEventTime(
      input: CalendarEventPathInput & { startsAt: Date; endsAt: Date },
    ): Promise<GoogleCalendarMutationOutcome> {
      const response = await request(
        `${calendarEventUrl(input.calendarId, input.eventId)}?sendUpdates=all`,
        {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start: eventTime(input.startsAt),
            end: eventTime(input.endsAt),
          }),
        },
      )
      if (response.status === 404 || response.status === 410) return 'missing'
      await assertCalendarResponse(response)
      return 'done'
    },

    async deleteCalendarEvent(
      input: CalendarEventPathInput,
    ): Promise<GoogleCalendarMutationOutcome> {
      const response = await request(
        `${calendarEventUrl(input.calendarId, input.eventId)}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
        },
      )
      if (response.status === 404 || response.status === 410) return 'missing'
      await assertCalendarResponse(response)
      return 'done'
    },

    async revokeToken(token: string): Promise<void> {
      const response = await request(GOOGLE_REVOCATION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
      })
      await assertCalendarResponse(response)
    },
  }
}

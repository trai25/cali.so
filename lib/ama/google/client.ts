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

export type GoogleCalendarIdentity = {
  id: string
  summary: string
  timeZone: string
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

    async getPrimaryCalendarIdentity(accessToken: string): Promise<GoogleCalendarIdentity> {
      const response = await request(`${GOOGLE_CALENDAR_API}/calendars/primary`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })
      await assertCalendarResponse(response)
      const payload = await readJson(response)
      if (
        !isRecord(payload) ||
        typeof payload.id !== 'string' ||
        !payload.id ||
        typeof payload.summary !== 'string' ||
        typeof payload.timeZone !== 'string' ||
        !payload.timeZone
      ) {
        invalidResponse()
      }
      return {
        id: payload.id,
        summary: payload.summary,
        timeZone: payload.timeZone,
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

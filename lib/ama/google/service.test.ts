import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createSecretBox, type EncryptedSecretEnvelope } from '../secrets'
import {
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarError,
  type GoogleCalendarIdentity,
} from './client'
import {
  createGoogleCalendarService,
  type GoogleCalendarConnection,
  type GoogleCalendarProvider,
  type GoogleCalendarRepository,
  type GoogleOAuthAttempt,
} from './service'

function fixture() {
  const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
  let now = new Date('2026-07-14T04:00:00.000Z')
  let connection: GoogleCalendarConnection | null = null
  const attempts = new Map<string, GoogleOAuthAttempt>()
  const repository: GoogleCalendarRepository = {
    async createOAuthAttempt(input) {
      attempts.set(input.state, { ...input, consumedAt: null })
    },
    async consumeOAuthAttempt(state, ownerEmail, consumedAt) {
      const attempt = attempts.get(state)
      if (
        !attempt ||
        attempt.ownerEmail !== ownerEmail ||
        attempt.consumedAt ||
        attempt.expiresAt <= consumedAt
      ) {
        return null
      }
      attempt.consumedAt = consumedAt
      return attempt
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
    async disconnect(updatedAt) {
      connection = {
        id: 1,
        status: 'disconnected',
        calendarId: null,
        calendarEmail: null,
        calendarSummary: null,
        grantedScopes: [],
        refreshTokenEnvelope: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        connectedAt: null,
        createdAt: connection?.createdAt ?? updatedAt,
        updatedAt,
      }
      return connection
    },
  }

  const calls: unknown[] = []
  const provider: GoogleCalendarProvider = {
    createAuthorizationUrl(input) {
      calls.push(['authorize', input])
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('state', input.state)
      return url
    },
    async exchangeAuthorizationCode(input) {
      calls.push(['exchange', input])
      return {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date('2026-07-14T05:00:00.000Z'),
      }
    },
    async getPrimaryCalendarIdentity(accessToken) {
      calls.push(['identity', accessToken])
      return {
        id: 'owner@example.com',
        summary: 'Cali Castle',
        timeZone: 'Asia/Taipei',
      } satisfies GoogleCalendarIdentity
    },
    async refreshAccessToken(refreshToken) {
      calls.push(['refresh', refreshToken])
      return {
        accessToken: 'fresh-access-token',
        expiresAt: new Date('2026-07-14T05:00:00.000Z'),
      }
    },
    async queryFreeBusy(input) {
      calls.push(['freebusy', input])
      return [
        {
          start: '2026-07-15T01:00:00.000Z',
          end: '2026-07-15T02:00:00.000Z',
        },
      ]
    },
    async revokeToken(token) {
      calls.push(['revoke', token])
    },
  }

  const randomValues = ['persisted-state', 'pkce-verifier']
  const service = createGoogleCalendarService({
    ownerEmail: 'owner@example.com',
    baseUrl: new URL('https://cali.so'),
    repository,
    provider,
    secretBox: box,
    clock: { now: () => now },
    randomToken: () => randomValues.shift() ?? 'next-random-value',
  })

  return {
    service,
    provider,
    calls,
    get connection() {
      return connection
    },
    setConnection(value: GoogleCalendarConnection) {
      connection = value
    },
    setNow(value: string) {
      now = new Date(value)
    },
  }
}

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

describe('Google Calendar connection service', () => {
  it('persists a one-time PKCE attempt and uses the canonical callback URL', async () => {
    const f = fixture()

    const authorizationUrl = await f.service.begin()

    expect(authorizationUrl.searchParams.get('state')).toBe('persisted-state')
    expect(f.calls).toEqual([
      [
        'authorize',
        {
          state: 'persisted-state',
          codeVerifier: 'pkce-verifier',
          redirectUri: new URL('https://cali.so/api/admin/ama/google/callback'),
        },
      ],
    ])
  })

  it('connects the primary calendar and stores only an encrypted refresh token', async () => {
    const f = fixture()
    await f.service.begin()

    const result = await f.service.complete({
      state: 'persisted-state',
      code: 'authorization-code',
      error: null,
    })

    expect(result).toBe('connected')
    expect(f.connection).toMatchObject({
      status: 'connected',
      calendarId: 'owner@example.com',
      calendarEmail: 'owner@example.com',
      calendarSummary: 'Cali Castle',
      grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
      lastErrorCode: null,
    })
    expect(JSON.stringify(f.connection)).not.toContain('refresh-token')
    expect(f.calls).toContainEqual([
      'exchange',
      {
        code: 'authorization-code',
        codeVerifier: 'pkce-verifier',
        redirectUri: new URL('https://cali.so/api/admin/ama/google/callback'),
      },
    ])
  })

  it('rejects replayed OAuth state before exchanging another code', async () => {
    const f = fixture()
    await f.service.begin()
    await f.service.complete({ state: 'persisted-state', code: 'first-code', error: null })

    const replay = await f.service.complete({
      state: 'persisted-state',
      code: 'second-code',
      error: null,
    })

    expect(replay).toBe('expired')
    expect(
      f.calls.filter((call) => Array.isArray(call) && call[0] === 'exchange'),
    ).toHaveLength(1)
  })

  it('persists a denied-scope state without exposing provider credentials', async () => {
    const f = fixture()
    await f.service.begin()
    f.provider.exchangeAuthorizationCode = async () => {
      throw new GoogleCalendarError(
        'denied_scope',
        'Google Calendar permissions were not granted.',
      )
    }

    const result = await f.service.complete({
      state: 'persisted-state',
      code: 'authorization-code',
      error: null,
    })

    expect(result).toBe('denied-scope')
    expect(f.connection).toMatchObject({
      status: 'denied_scope',
      lastErrorCode: 'denied_scope',
      refreshTokenEnvelope: null,
    })
  })

  it('does not misclassify temporary OAuth callback failures as denied scope', async () => {
    const f = fixture()
    await f.service.begin()

    const result = await f.service.complete({
      state: 'persisted-state',
      code: null,
      error: 'temporarily_unavailable',
    })

    expect(result).toBe('unavailable')
    expect(f.connection).toBeNull()
  })

  it('refreshes credentials and returns normalized busy intervals', async () => {
    const f = fixture()
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    f.setConnection(connectedConnection(box.seal('refresh-token', 'google-refresh-token')))

    const result = await f.service.queryFreeBusy({
      timeMin: new Date('2026-07-15T00:00:00.000Z'),
      timeMax: new Date('2026-07-16T00:00:00.000Z'),
    })

    expect(result).toEqual({
      status: 'connected',
      busy: [
        {
          startsAt: new Date('2026-07-15T01:00:00.000Z'),
          endsAt: new Date('2026-07-15T02:00:00.000Z'),
        },
      ],
    })
    expect(f.calls).toContainEqual(['refresh', 'refresh-token'])
  })

  it('marks invalid refresh credentials revoked and returns no slots', async () => {
    const f = fixture()
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    f.setConnection(connectedConnection(box.seal('refresh-token', 'google-refresh-token')))
    f.provider.refreshAccessToken = async () => {
      throw new GoogleCalendarError(
        'expired_or_revoked',
        'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
      )
    }

    const result = await f.service.queryFreeBusy({
      timeMin: new Date('2026-07-15T00:00:00.000Z'),
      timeMax: new Date('2026-07-16T00:00:00.000Z'),
    })

    expect(result).toEqual({ status: 'revoked', busy: [] })
    expect(f.connection).toMatchObject({ status: 'revoked', lastErrorCode: 'invalid_grant' })
  })

  it('disconnects locally even when remote revocation is unavailable', async () => {
    const f = fixture()
    const box = createSecretBox(Buffer.alloc(32, 7).toString('base64'))
    f.setConnection(connectedConnection(box.seal('refresh-token', 'google-refresh-token')))
    f.provider.revokeToken = async () => {
      throw new GoogleCalendarError('provider_unavailable', 'Google Calendar is unavailable.')
    }

    await expect(f.service.disconnect()).resolves.toBeUndefined()

    expect(f.connection).toMatchObject({
      status: 'disconnected',
      refreshTokenEnvelope: null,
    })
  })
})

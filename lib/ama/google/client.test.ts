import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarError,
  createGoogleCalendarClient,
} from './client'

describe('Google Calendar provider', () => {
  it('builds an authorization URL with caller state, exact scopes, and PKCE S256', () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const url = client.createAuthorizationUrl({
      state: 'persisted-state-123',
      codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: new URL('https://cali.so/api/ama/google/callback'),
    })

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      access_type: 'offline',
      client_id: 'google-client-id',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
      prompt: 'consent',
      redirect_uri: 'https://cali.so/api/ama/google/callback',
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPES.join(' '),
      state: 'persisted-state-123',
    })
    expect(GOOGLE_CALENDAR_SCOPES).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.freebusy',
    ])
    expect(url.toString()).not.toContain('google-client-secret')
    expect(url.toString()).not.toContain('dBjftJeZ4CVP')
  })

  it('exchanges an authorization code with its PKCE verifier', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        access_token: 'access-token-value',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
        scope: GOOGLE_CALENDAR_SCOPES.join(' '),
        token_type: 'Bearer',
      }),
    )
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch,
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const tokenSet = await client.exchangeAuthorizationCode({
      code: 'authorization-code-value',
      codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: new URL('https://cali.so/api/ama/google/callback'),
    })

    expect(tokenSet).toEqual({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      expiresAt: new Date('2026-07-14T05:00:00.000Z'),
    })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: 'google-client-id',
      client_secret: 'google-client-secret',
      code: 'authorization-code-value',
      code_verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      grant_type: 'authorization_code',
      redirect_uri: 'https://cali.so/api/ama/google/callback',
    })
  })

  it('rejects an authorization grant missing a required calendar scope', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        Response.json({
          access_token: 'access-token-value',
          refresh_token: 'refresh-token-value',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/calendar.events',
        }),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const exchange = client.exchangeAuthorizationCode({
      code: 'authorization-code-value',
      codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
      redirectUri: new URL('https://cali.so/api/ama/google/callback'),
    })

    await expect(exchange).rejects.toEqual(
      new GoogleCalendarError('denied_scope', 'Google Calendar permissions were not granted.'),
    )
  })

  it('fails closed when Google omits the granted scope set', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        Response.json({
          access_token: 'access-token-value',
          refresh_token: 'refresh-token-value',
          expires_in: 3600,
        }),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    await expect(
      client.exchangeAuthorizationCode({
        code: 'authorization-code-value',
        codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        redirectUri: new URL('https://cali.so/api/ama/google/callback'),
      }),
    ).rejects.toMatchObject({ code: 'denied_scope' })
  })

  it('refreshes an access token and computes its absolute expiry with the injected clock', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ access_token: 'fresh-access-token', expires_in: 1800, token_type: 'Bearer' }),
    )
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch,
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const token = await client.refreshAccessToken('refresh-token-value')

    expect(token).toEqual({
      accessToken: 'fresh-access-token',
      expiresAt: new Date('2026-07-14T04:30:00.000Z'),
    })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      client_id: 'google-client-id',
      client_secret: 'google-client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-token-value',
    })
  })

  it('normalizes Google FreeBusy intervals for the requested calendar', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        calendars: {
          primary: {
            busy: [
              {
                start: '2026-07-15T09:00:00+08:00',
                end: '2026-07-15T10:00:00+08:00',
              },
            ],
          },
        },
      }),
    )
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch,
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const busy = await client.queryFreeBusy({
      accessToken: 'access-token-value',
      timeMin: new Date('2026-07-15T00:00:00.000Z'),
      timeMax: new Date('2026-07-16T00:00:00.000Z'),
    })

    expect(busy).toEqual([
      {
        start: '2026-07-15T01:00:00.000Z',
        end: '2026-07-15T02:00:00.000Z',
      },
    ])
    expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token-value',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: '2026-07-15T00:00:00.000Z',
        timeMax: '2026-07-16T00:00:00.000Z',
        items: [{ id: 'primary' }],
      }),
    })
  })

  it('surfaces per-calendar permission errors as denied scope', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        Response.json({
          calendars: {
            primary: {
              errors: [
                {
                  domain: 'global',
                  reason: 'insufficientPermissions',
                  message: 'raw provider detail must not escape',
                },
              ],
              busy: [],
            },
          },
        }),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const query = client.queryFreeBusy({
      accessToken: 'access-token-value',
      timeMin: new Date('2026-07-15T00:00:00.000Z'),
      timeMax: new Date('2026-07-16T00:00:00.000Z'),
    })

    await expect(query).rejects.toMatchObject({
      code: 'denied_scope',
      message: 'Google Calendar permissions were not granted.',
    })
  })

  it('revokes a Google credential without placing it in the URL', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }))
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch,
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    await client.revokeToken('refresh-token-value')

    expect(fetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'refresh-token-value' }),
    })
  })

  it('normalizes invalid_grant during refresh as an expired or revoked connection', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        Response.json(
          {
            error: 'invalid_grant',
            error_description: 'refresh-token-value was revoked',
          },
          { status: 400 },
        ),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const refresh = client.refreshAccessToken('refresh-token-value')

    await expect(refresh).rejects.toMatchObject({
      code: 'expired_or_revoked',
      message: 'Google Calendar access expired or was revoked. Reconnect Google Calendar.',
    })
  })

  it('returns a sanitized provider-unavailable error without OAuth secrets or raw bodies', async () => {
    const secrets = {
      clientSecret: 'client-secret-must-stay-private',
      codeVerifier: 'verifier-must-stay-private-012345678901234567890',
      code: 'authorization-code-must-stay-private',
      accessToken: 'access-token-must-stay-private',
      refreshToken: 'refresh-token-must-stay-private',
      rawBody: 'raw-provider-body-must-stay-private',
    }
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: secrets.clientSecret,
      fetch: vi.fn(async () =>
        Response.json(
          {
            error: 'temporarily_unavailable',
            error_description: Object.values(secrets).join(' '),
          },
          { status: 503 },
        ),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const exchange = client.exchangeAuthorizationCode({
      code: secrets.code,
      codeVerifier: secrets.codeVerifier,
      redirectUri: new URL('https://cali.so/api/ama/google/callback'),
    })

    const error = await exchange.catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      code: 'provider_unavailable',
      message: 'Google Calendar is temporarily unavailable.',
    })
    for (const secret of Object.values(secrets)) {
      expect(String(error)).not.toContain(secret)
      expect(JSON.stringify(error)).not.toContain(secret)
    }
  })

  it('sanitizes transport failures from Google', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'client-secret-must-stay-private',
      fetch: vi.fn(async () => {
        throw new Error('refresh-token-must-stay-private raw network detail')
      }),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const error = await client
      .refreshAccessToken('refresh-token-must-stay-private')
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 'provider_unavailable',
      message: 'Google Calendar is temporarily unavailable.',
    })
    expect(String(error)).not.toContain('refresh-token-must-stay-private')
    expect(String(error)).not.toContain('raw network detail')
  })

  it('fails closed when Google returns a malformed token response', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () => Response.json({ expires_in: 'not-a-number' })),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    await expect(
      client.exchangeAuthorizationCode({
        code: 'authorization-code-value',
        codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        redirectUri: new URL('https://cali.so/api/ama/google/callback'),
      }),
    ).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Google Calendar returned an invalid response.',
    })
  })

  it('does not misclassify a Google quota response as denied scope', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        Response.json(
          {
            error: {
              errors: [{ reason: 'rateLimitExceeded', message: 'raw quota detail' }],
            },
          },
          { status: 403 },
        ),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    await expect(
      client.queryFreeBusy({
        accessToken: 'access-token-value',
        timeMin: new Date('2026-07-15T00:00:00.000Z'),
        timeMax: new Date('2026-07-16T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'provider_unavailable',
      message: 'Google Calendar is temporarily unavailable.',
    })
  })

  it('normalizes a non-JSON Google outage response without exposing its body', async () => {
    const client = createGoogleCalendarClient({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      fetch: vi.fn(async () =>
        new Response('raw-provider-outage-body', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
      clock: { now: () => new Date('2026-07-14T04:00:00.000Z') },
    })

    const error = await client
      .exchangeAuthorizationCode({
        code: 'authorization-code-value',
        codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        redirectUri: new URL('https://cali.so/api/ama/google/callback'),
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 'provider_unavailable',
      message: 'Google Calendar is temporarily unavailable.',
    })
    expect(String(error)).not.toContain('raw-provider-outage-body')
  })

})

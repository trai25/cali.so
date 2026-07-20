import 'server-only'

import { randomBytes } from 'node:crypto'

import type { EncryptedSecretEnvelope, createSecretBox } from '../secrets'
import {
  GOOGLE_CALENDAR_SCOPES,
  GoogleCalendarError,
  type GoogleCalendarIdentity,
} from './client'

const OAUTH_ATTEMPT_LIFETIME_MS = 10 * 60 * 1000
const GOOGLE_CALLBACK_PATH = '/api/admin/ama/google/callback'

export type GoogleConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'denied_scope'
  | 'error'

export type GoogleCalendarConnection = {
  id: number
  status: GoogleConnectionStatus
  calendarId: string | null
  calendarEmail: string | null
  calendarSummary: string | null
  grantedScopes: string[]
  refreshTokenEnvelope: EncryptedSecretEnvelope | null
  accessTokenExpiresAt: Date | null
  lastErrorCode: string | null
  connectedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type GoogleOAuthAttempt = {
  state?: string
  ownerEmail: string
  pkceVerifierEnvelope: EncryptedSecretEnvelope
  expiresAt: Date
  consumedAt: Date | null
  createdAt: Date
}

type SaveConnectionInput = Omit<GoogleCalendarConnection, 'id' | 'createdAt'>

export interface GoogleCalendarRepository {
  createOAuthAttempt(input: {
    state: string
    ownerEmail: string
    pkceVerifierEnvelope: EncryptedSecretEnvelope
    expiresAt: Date
    createdAt: Date
  }): Promise<unknown>
  consumeOAuthAttempt(
    state: string,
    ownerEmail: string,
    consumedAt: Date,
  ): Promise<GoogleOAuthAttempt | null>
  getConnection(): Promise<GoogleCalendarConnection | null>
  saveConnection(input: SaveConnectionInput): Promise<GoogleCalendarConnection>
  setConnectionStatus(
    status: GoogleConnectionStatus,
    lastErrorCode: string,
    updatedAt: Date,
  ): Promise<GoogleCalendarConnection>
  disconnect(updatedAt: Date): Promise<GoogleCalendarConnection>
}

export interface GoogleCalendarProvider {
  createAuthorizationUrl(input: {
    state: string
    codeVerifier: string
    redirectUri: URL
  }): URL
  exchangeAuthorizationCode(input: {
    code: string
    codeVerifier: string
    redirectUri: URL
  }): Promise<{
    accessToken?: string
    refreshToken?: string
    expiresAt: Date
  }>
  getPrimaryCalendarIdentity(accessToken: string): Promise<GoogleCalendarIdentity>
  refreshAccessToken(refreshToken: string): Promise<{
    accessToken?: string
    expiresAt: Date
  }>
  queryFreeBusy(input: {
    accessToken: string
    calendarId?: string
    timeMin: Date
    timeMax: Date
  }): Promise<Array<{ start: string; end: string }>>
  revokeToken(token: string): Promise<void>
}

type GoogleCalendarServiceDependencies = {
  ownerEmail: string
  baseUrl: URL
  repository: GoogleCalendarRepository
  provider: GoogleCalendarProvider
  secretBox: ReturnType<typeof createSecretBox>
  clock?: { now(): Date }
  randomToken?: () => string
}

export type GoogleConnectionResult =
  | 'connected'
  | 'denied-scope'
  | 'expired'
  | 'revoked'
  | 'unavailable'

function calendarEmail(identity: GoogleCalendarIdentity) {
  return identity.id.includes('@') ? identity.id : null
}

function publicStatus(status: GoogleConnectionStatus | undefined): GoogleConnectionResult | 'disconnected' {
  if (!status || status === 'disconnected') return 'disconnected'
  if (status === 'denied_scope') return 'denied-scope'
  if (status === 'error') return 'unavailable'
  return status
}

export function createGoogleCalendarService(dependencies: GoogleCalendarServiceDependencies) {
  const {
    ownerEmail,
    baseUrl,
    repository,
    provider,
    secretBox,
    clock = { now: () => new Date() },
    randomToken = () => randomBytes(32).toString('base64url'),
  } = dependencies
  const redirectUri = new URL(GOOGLE_CALLBACK_PATH, baseUrl)

  async function setFailure(error: unknown, now: Date): Promise<GoogleConnectionResult> {
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

  return {
    async begin() {
      const now = clock.now()
      const state = randomToken()
      const codeVerifier = randomToken()
      await repository.createOAuthAttempt({
        state,
        ownerEmail,
        pkceVerifierEnvelope: secretBox.seal(codeVerifier, 'google-pkce-verifier'),
        expiresAt: new Date(now.getTime() + OAUTH_ATTEMPT_LIFETIME_MS),
        createdAt: now,
      })
      return provider.createAuthorizationUrl({ state, codeVerifier, redirectUri })
    },

    async complete(input: {
      state: string | null
      code: string | null
      error: string | null
    }): Promise<GoogleConnectionResult> {
      const now = clock.now()
      if (!input.state) return 'unavailable'
      const attempt = await repository.consumeOAuthAttempt(input.state, ownerEmail, now)
      if (!attempt) return 'expired'
      if (input.error === 'access_denied') {
        await repository.setConnectionStatus('denied_scope', input.error, now)
        return 'denied-scope'
      }
      if (input.error || !input.code) {
        return 'unavailable'
      }

      try {
        const codeVerifier = secretBox.open(
          attempt.pkceVerifierEnvelope,
          'google-pkce-verifier',
        )
        const tokens = await provider.exchangeAuthorizationCode({
          code: input.code,
          codeVerifier,
          redirectUri,
        })
        if (!tokens.accessToken || !tokens.refreshToken) return 'unavailable'

        const identity = await provider.getPrimaryCalendarIdentity(tokens.accessToken)
        await repository.saveConnection({
          status: 'connected',
          calendarId: identity.id,
          calendarEmail: calendarEmail(identity),
          calendarSummary: identity.summary,
          grantedScopes: [...GOOGLE_CALENDAR_SCOPES],
          refreshTokenEnvelope: secretBox.seal(
            tokens.refreshToken,
            'google-refresh-token',
          ),
          accessTokenExpiresAt: tokens.expiresAt,
          lastErrorCode: null,
          connectedAt: now,
          updatedAt: now,
        })
        return 'connected'
      } catch (error) {
        return setFailure(error, now)
      }
    },

    getConnection() {
      return repository.getConnection()
    },

    async queryFreeBusy(input: { timeMin: Date; timeMax: Date }) {
      const connection = await repository.getConnection()
      if (
        !connection ||
        connection.status !== 'connected' ||
        !connection.refreshTokenEnvelope
      ) {
        return { status: publicStatus(connection?.status), busy: [] }
      }

      const now = clock.now()
      try {
        const refreshToken = secretBox.open(
          connection.refreshTokenEnvelope,
          'google-refresh-token',
        )
        const tokens = await provider.refreshAccessToken(refreshToken)
        if (!tokens.accessToken) return { status: 'unavailable' as const, busy: [] }
        const intervals = await provider.queryFreeBusy({
          accessToken: tokens.accessToken,
          calendarId: connection.calendarId ?? undefined,
          timeMin: input.timeMin,
          timeMax: input.timeMax,
        })
        const busy = intervals.map((interval) => ({
          startsAt: new Date(interval.start),
          endsAt: new Date(interval.end),
        }))
        if (
          busy.some(
            (interval) =>
              !Number.isFinite(interval.startsAt.getTime()) ||
              !Number.isFinite(interval.endsAt.getTime()) ||
              interval.startsAt >= interval.endsAt,
          )
        ) {
          return { status: 'unavailable' as const, busy: [] }
        }
        await repository.saveConnection({
          status: 'connected',
          calendarId: connection.calendarId,
          calendarEmail: connection.calendarEmail,
          calendarSummary: connection.calendarSummary,
          grantedScopes: connection.grantedScopes,
          refreshTokenEnvelope: connection.refreshTokenEnvelope,
          accessTokenExpiresAt: tokens.expiresAt,
          lastErrorCode: null,
          connectedAt: connection.connectedAt,
          updatedAt: now,
        })
        return { status: 'connected' as const, busy }
      } catch (error) {
        return { status: await setFailure(error, now), busy: [] }
      }
    },

    async disconnect() {
      const connection = await repository.getConnection()
      if (connection?.refreshTokenEnvelope) {
        try {
          const refreshToken = secretBox.open(
            connection.refreshTokenEnvelope,
            'google-refresh-token',
          )
          await provider.revokeToken(refreshToken)
        } catch {
          // Local disconnect remains authoritative when Google is unavailable.
        }
      }
      await repository.disconnect(clock.now())
    },
  }
}

export type GoogleCalendarService = ReturnType<typeof createGoogleCalendarService>

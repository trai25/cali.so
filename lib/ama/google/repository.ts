import 'server-only'

import { createHash } from 'node:crypto'

import { and, eq, gt, isNull } from 'drizzle-orm'

import { getDatabase } from '~/db'
import { amaGoogleCalendarConnections, amaGoogleOAuthAttempts } from '~/db/schema'

import type { EncryptedSecretEnvelope } from '../secrets'

export type GoogleDatabase = ReturnType<typeof getDatabase>

export type GoogleConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'denied_scope'
  | 'error'

export type GoogleConnectionInput = {
  status: GoogleConnectionStatus
  calendarId: string | null
  calendarEmail: string | null
  calendarSummary: string | null
  grantedScopes: string[]
  refreshTokenEnvelope: EncryptedSecretEnvelope | null
  accessTokenExpiresAt: Date | null
  lastErrorCode: string | null
  connectedAt: Date | null
  updatedAt: Date
}

export type GoogleOAuthAttemptInput = {
  state: string
  ownerEmail: string
  pkceVerifierEnvelope: EncryptedSecretEnvelope
  expiresAt: Date
  createdAt: Date
}

function hashState(state: string) {
  return createHash('sha256').update(state).digest('hex')
}

export function createGoogleRepository(database: () => GoogleDatabase) {
  return {
    async getConnection() {
      const [connection] = await database()
        .select()
        .from(amaGoogleCalendarConnections)
        .where(eq(amaGoogleCalendarConnections.id, 1))
        .limit(1)
      return connection ?? null
    },

    async saveConnection(input: GoogleConnectionInput) {
      const [connection] = await database()
        .insert(amaGoogleCalendarConnections)
        .values({ id: 1, ...input })
        .onConflictDoUpdate({
          target: amaGoogleCalendarConnections.id,
          set: input,
        })
        .returning()
      return connection
    },

    async setConnectionStatus(
      status: GoogleConnectionStatus,
      lastErrorCode: string | null,
      updatedAt: Date,
    ) {
      const [connection] = await database()
        .insert(amaGoogleCalendarConnections)
        .values({ id: 1, status, lastErrorCode, updatedAt })
        .onConflictDoUpdate({
          target: amaGoogleCalendarConnections.id,
          set: { status, lastErrorCode, updatedAt },
        })
        .returning()
      return connection
    },

    async disconnect(updatedAt: Date) {
      const disconnected = {
        status: 'disconnected' as const,
        calendarId: null,
        calendarEmail: null,
        calendarSummary: null,
        grantedScopes: [],
        refreshTokenEnvelope: null,
        accessTokenExpiresAt: null,
        lastErrorCode: null,
        connectedAt: null,
        updatedAt,
      }
      const [connection] = await database()
        .insert(amaGoogleCalendarConnections)
        .values({ id: 1, ...disconnected })
        .onConflictDoUpdate({
          target: amaGoogleCalendarConnections.id,
          set: disconnected,
        })
        .returning()
      return connection
    },

    async createOAuthAttempt(input: GoogleOAuthAttemptInput) {
      await database().insert(amaGoogleOAuthAttempts).values({
        stateHash: hashState(input.state),
        ownerEmail: input.ownerEmail,
        pkceVerifierEnvelope: input.pkceVerifierEnvelope,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: input.createdAt,
      })
    },

    async consumeOAuthAttempt(state: string, ownerEmail: string, consumedAt: Date) {
      const [attempt] = await database()
        .update(amaGoogleOAuthAttempts)
        .set({ consumedAt })
        .where(
          and(
            eq(amaGoogleOAuthAttempts.stateHash, hashState(state)),
            eq(amaGoogleOAuthAttempts.ownerEmail, ownerEmail),
            isNull(amaGoogleOAuthAttempts.consumedAt),
            gt(amaGoogleOAuthAttempts.expiresAt, consumedAt),
          ),
        )
        .returning()
      return attempt ?? null
    },
  }
}

export const googleRepository = createGoogleRepository(getDatabase)

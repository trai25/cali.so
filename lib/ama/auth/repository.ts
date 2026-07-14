import 'server-only'

import { and, eq, gt, isNull } from 'drizzle-orm'

import { getDatabase } from '~/db'
import { amaAdminSessions, amaAuthTokens } from '~/db/schema'

import type { AuthRepository } from './service'

export type AuthDatabase = ReturnType<typeof getDatabase>

export function createAuthRepository(database: () => AuthDatabase): AuthRepository {
  return {
    async createLoginToken(record) {
      await database().insert(amaAuthTokens).values({
        tokenHash: record.tokenHash,
        ownerEmail: record.email,
        expiresAt: record.expiresAt,
        consumedAt: record.consumedAt,
        createdAt: record.createdAt,
      })
    },

    async consumeLoginToken(tokenHash, ownerEmail, consumedAt) {
      const consumed = await database()
        .update(amaAuthTokens)
        .set({ consumedAt })
        .where(
          and(
            eq(amaAuthTokens.tokenHash, tokenHash),
            eq(amaAuthTokens.ownerEmail, ownerEmail),
            isNull(amaAuthTokens.consumedAt),
            gt(amaAuthTokens.expiresAt, consumedAt),
          ),
        )
        .returning({ tokenHash: amaAuthTokens.tokenHash })
      return consumed.length === 1
    },

    async createSession(record) {
      await database().insert(amaAdminSessions).values({
        tokenHash: record.tokenHash,
        ownerEmail: record.email,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
        createdAt: record.createdAt,
      })
    },

    async findActiveSession(tokenHash, ownerEmail, checkedAt) {
      const [session] = await database()
        .select()
        .from(amaAdminSessions)
        .where(
          and(
            eq(amaAdminSessions.tokenHash, tokenHash),
            eq(amaAdminSessions.ownerEmail, ownerEmail),
            isNull(amaAdminSessions.revokedAt),
            gt(amaAdminSessions.expiresAt, checkedAt),
          ),
        )
        .limit(1)
      if (!session) return null
      return {
        tokenHash: session.tokenHash,
        email: session.ownerEmail,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
      }
    },

    async revokeSession(tokenHash, revokedAt) {
      await database()
        .update(amaAdminSessions)
        .set({ revokedAt })
        .where(
          and(
            eq(amaAdminSessions.tokenHash, tokenHash),
            isNull(amaAdminSessions.revokedAt),
          ),
        )
    },
  }
}

export const authRepository = createAuthRepository(getDatabase)

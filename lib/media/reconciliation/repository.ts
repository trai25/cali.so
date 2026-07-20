import 'server-only'

import { and, asc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import { mediaAssets, mediaUploadIntents } from '~/db/schema'

export type MediaReconciliationDatabase = ReturnType<typeof getDatabase>

export type MediaRecoveryCandidate = {
  ownerUserId: string
  uploadIntentId: string
  mediaAssetId: string | null
  originalKey: string
  byteSize: number
  expiresAt: Date
  lastActiveAt: Date
}

export function createMediaReconciliationRepository(
  database: () => MediaReconciliationDatabase,
) {
  return {
    async listRecoveryCandidates(input: {
      createdBefore: Date
      abandonedStaleBefore: Date
      processingStaleBefore: Date
      limit: number
    }): Promise<MediaRecoveryCandidate[]> {
      return database()
        .select({
          ownerUserId: mediaUploadIntents.ownerUserId,
          uploadIntentId: mediaUploadIntents.id,
          mediaAssetId: mediaAssets.id,
          originalKey: mediaUploadIntents.originalKey,
          byteSize: mediaUploadIntents.byteSize,
          expiresAt: mediaUploadIntents.expiresAt,
          lastActiveAt: mediaUploadIntents.updatedAt,
        })
        .from(mediaUploadIntents)
        .leftJoin(
          mediaAssets,
          eq(mediaAssets.uploadIntentId, mediaUploadIntents.id),
        )
        .where(
          or(
            and(
              isNull(mediaAssets.id),
              lt(mediaUploadIntents.createdAt, input.createdBefore),
              lt(mediaUploadIntents.updatedAt, input.abandonedStaleBefore),
            ),
            and(
              eq(mediaAssets.catalogState, 'active'),
              inArray(mediaAssets.processingState, [
                'original_verified',
                'retryable_failure',
              ]),
            ),
            and(
              eq(mediaAssets.catalogState, 'active'),
              eq(mediaAssets.processingState, 'processing'),
              lt(mediaAssets.updatedAt, input.processingStaleBefore),
            ),
          ),
        )
        .orderBy(
          asc(mediaUploadIntents.updatedAt),
          asc(mediaUploadIntents.createdAt),
        )
        .limit(input.limit)
    },

    async claimAbandonedUploadIntent(input: {
      uploadIntentId: string
      expectedLastActiveAt: Date
      expiredBefore: Date
      claimedAt: Date
    }) {
      const [claimed] = await database()
        .update(mediaUploadIntents)
        .set({ updatedAt: input.claimedAt })
        .where(
          and(
            eq(mediaUploadIntents.id, input.uploadIntentId),
            eq(mediaUploadIntents.updatedAt, input.expectedLastActiveAt),
            lt(mediaUploadIntents.expiresAt, input.expiredBefore),
            sql`NOT EXISTS (
              SELECT 1 FROM ${mediaAssets}
              WHERE ${mediaAssets.uploadIntentId} = ${mediaUploadIntents.id}
            )`,
          ),
        )
        .returning({ id: mediaUploadIntents.id })
      return claimed !== undefined
    },

    async markRecoveryAttempted(input: {
      uploadIntentId: string
      attemptedAt: Date
    }) {
      await database()
        .update(mediaUploadIntents)
        .set({ updatedAt: input.attemptedAt })
        .where(eq(mediaUploadIntents.id, input.uploadIntentId))
    },

    async deleteAbandonedUploadIntent(input: {
      uploadIntentId: string
      expiredBefore: Date
      cleanupClaimedAt: Date
    }) {
      const [deleted] = await database()
        .delete(mediaUploadIntents)
        .where(
          and(
            eq(mediaUploadIntents.id, input.uploadIntentId),
            lt(mediaUploadIntents.expiresAt, input.expiredBefore),
            eq(mediaUploadIntents.updatedAt, input.cleanupClaimedAt),
            sql`NOT EXISTS (
              SELECT 1 FROM ${mediaAssets}
              WHERE ${mediaAssets.uploadIntentId} = ${mediaUploadIntents.id}
            )`,
          ),
        )
        .returning({ id: mediaUploadIntents.id })
      return deleted !== undefined
    },

    async listReadyWithoutAltTextSuggestion(limit: number) {
      return database()
        .select({
          ownerUserId: mediaUploadIntents.ownerUserId,
          mediaAssetId: mediaAssets.id,
        })
        .from(mediaAssets)
        .innerJoin(
          mediaUploadIntents,
          eq(mediaUploadIntents.id, mediaAssets.uploadIntentId),
        )
        .where(
          and(
            eq(mediaAssets.catalogState, 'active'),
            eq(mediaAssets.processingState, 'ready'),
            isNull(mediaAssets.altTextSuggestedAt),
          ),
        )
        .orderBy(asc(mediaAssets.updatedAt), asc(mediaAssets.createdAt))
        .limit(limit)
    },

    async markAltTextSuggestionAttempted(input: {
      mediaAssetId: string
      attemptedAt: Date
    }) {
      await database()
        .update(mediaAssets)
        .set({ updatedAt: input.attemptedAt })
        .where(eq(mediaAssets.id, input.mediaAssetId))
    },

    async findOwnedRecoverableAsset(input: {
      ownerUserId: string
      mediaAssetId: string
    }) {
      const [asset] = await database()
        .select({ uploadIntentId: mediaUploadIntents.id })
        .from(mediaAssets)
        .innerJoin(
          mediaUploadIntents,
          and(
            eq(mediaUploadIntents.id, mediaAssets.uploadIntentId),
            eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
          ),
        )
        .where(
          and(
            eq(mediaAssets.id, input.mediaAssetId),
            eq(mediaAssets.catalogState, 'active'),
            inArray(mediaAssets.processingState, [
              'original_verified',
              'processing',
              'repair_required',
              'retryable_failure',
            ]),
          ),
        )
        .limit(1)
      return asset ?? null
    },
  }
}

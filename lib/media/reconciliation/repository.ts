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
  expiresAt: Date
}

export function createMediaReconciliationRepository(
  database: () => MediaReconciliationDatabase,
) {
  return {
    async listRecoveryCandidates(input: {
      createdBefore: Date
      processingStaleBefore: Date
      limit: number
    }): Promise<MediaRecoveryCandidate[]> {
      return database()
        .select({
          ownerUserId: mediaUploadIntents.ownerUserId,
          uploadIntentId: mediaUploadIntents.id,
          mediaAssetId: mediaAssets.id,
          originalKey: mediaUploadIntents.originalKey,
          expiresAt: mediaUploadIntents.expiresAt,
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
            ),
            and(
              eq(mediaAssets.lifecycle, 'active'),
              inArray(mediaAssets.processingState, [
                'original_verified',
                'retryable_failure',
              ]),
            ),
            and(
              eq(mediaAssets.lifecycle, 'active'),
              eq(mediaAssets.processingState, 'processing'),
              lt(mediaAssets.updatedAt, input.processingStaleBefore),
            ),
          ),
        )
        .orderBy(asc(mediaUploadIntents.createdAt))
        .limit(input.limit)
    },

    async deleteAbandonedUploadIntent(input: {
      uploadIntentId: string
      expiredBefore: Date
    }) {
      const [deleted] = await database()
        .delete(mediaUploadIntents)
        .where(
          and(
            eq(mediaUploadIntents.id, input.uploadIntentId),
            lt(mediaUploadIntents.expiresAt, input.expiredBefore),
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
            eq(mediaAssets.lifecycle, 'active'),
            eq(mediaAssets.processingState, 'ready'),
            isNull(mediaAssets.altTextSuggestedAt),
          ),
        )
        .orderBy(asc(mediaAssets.createdAt))
        .limit(limit)
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
            eq(mediaAssets.lifecycle, 'active'),
            inArray(mediaAssets.processingState, [
              'original_verified',
              'processing',
              'retryable_failure',
            ]),
          ),
        )
        .limit(1)
      return asset ?? null
    },
  }
}

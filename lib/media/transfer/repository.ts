import 'server-only'

import { and, desc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import { mediaAssets, mediaUploadIntents } from '~/db/schema'

import { lockMediaAssetProcessing } from '../catalog/lifecycle-locks'

import type { MediaTransferRepository, TransferJob } from './service'

export type MediaTransferDatabase = ReturnType<typeof getDatabase>

export function createMediaTransferRepository(
  database: () => MediaTransferDatabase,
): MediaTransferRepository {
  return {
    async listOwnedTransferJobs(ownerUserId) {
      const rows = await database()
        .select({
          uploadIntentId: mediaUploadIntents.id,
          mediaAssetId: mediaAssets.id,
          contentType: mediaUploadIntents.contentType,
          byteSize: mediaUploadIntents.byteSize,
          checksumSha256: mediaUploadIntents.checksumSha256,
          completedAt: mediaUploadIntents.completedAt,
          discardStartedAt: mediaUploadIntents.discardStartedAt,
          processingState: mediaAssets.processingState,
          processingErrorCode: mediaAssets.processingErrorCode,
          catalogState: mediaAssets.catalogState,
          createdAt: mediaUploadIntents.createdAt,
          updatedAt: mediaUploadIntents.updatedAt,
          expiresAt: mediaUploadIntents.expiresAt,
        })
        .from(mediaUploadIntents)
        .leftJoin(
          mediaAssets,
          eq(mediaAssets.uploadIntentId, mediaUploadIntents.id),
        )
        .where(
          and(
            eq(mediaUploadIntents.ownerUserId, ownerUserId),
            or(
              and(isNull(mediaAssets.id), isNull(mediaUploadIntents.completedAt)),
              and(ne(mediaAssets.processingState, 'ready')),
            ),
          ),
        )
        .orderBy(desc(mediaUploadIntents.updatedAt))

      return rows.map((row): TransferJob => ({
        uploadIntentId: row.uploadIntentId,
        mediaAssetId: row.mediaAssetId,
        contentType: row.contentType,
        byteSize: row.byteSize,
        checksumSha256: row.checksumSha256,
        stage:
          row.discardStartedAt !== null || row.catalogState === 'purging'
            ? 'discarding'
            : row.mediaAssetId === null
              ? 'awaiting_file'
              : row.processingState === 'retryable_failure' ||
                  row.processingState === 'repair_required'
                ? 'failed'
                : 'processing',
        processingState: row.processingState,
        processingErrorCode: row.processingErrorCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
      }))
    },

    async prepareDiscard(input) {
      return database().transaction(async (transaction) => {
        const [intent] = await transaction
          .select()
          .from(mediaUploadIntents)
          .where(
            and(
              eq(mediaUploadIntents.id, input.uploadIntentId),
              eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
            ),
          )
          .limit(1)
          .for('update')
        if (!intent) return { status: 'not_found' as const }
        const [assetIdentity] = await transaction
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(eq(mediaAssets.uploadIntentId, intent.id))
          .limit(1)
        if (!assetIdentity) {
          if (intent.completedAt) return { status: 'invalid_state' as const }
          await transaction
            .update(mediaUploadIntents)
            .set({
              discardStartedAt: input.discardedAt,
              updatedAt: input.discardedAt,
            })
            .where(
              and(
                eq(mediaUploadIntents.id, intent.id),
                isNull(mediaUploadIntents.completedAt),
              ),
            )
          return {
            status: 'bare_intent' as const,
            originalKey: intent.originalKey,
            byteSize: intent.byteSize,
          }
        }

        await lockMediaAssetProcessing(transaction, assetIdentity.id)
        const [asset] = await transaction
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, assetIdentity.id))
          .limit(1)
          .for('update')
        if (!asset) return { status: 'not_found' as const }
        if (asset.processingState === 'ready') {
          return { status: 'invalid_state' as const }
        }
        if (asset.catalogState === 'active') {
          await transaction
            .update(mediaAssets)
            .set({
              catalogState: 'archived',
              archivedAt: input.discardedAt,
              updatedAt: input.discardedAt,
            })
            .where(eq(mediaAssets.id, asset.id))
        }
        return { status: 'asset' as const, mediaAssetId: asset.id }
      })
    },

    async deleteBareIntent(input) {
      const [deleted] = await database()
        .delete(mediaUploadIntents)
        .where(
          and(
            eq(mediaUploadIntents.id, input.uploadIntentId),
            eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
            isNull(mediaUploadIntents.completedAt),
            isNotNull(mediaUploadIntents.discardStartedAt),
          ),
        )
        .returning({ id: mediaUploadIntents.id })
      return deleted !== undefined
    },
  }
}

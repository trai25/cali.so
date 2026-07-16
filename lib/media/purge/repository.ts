import 'server-only'

import { and, asc, eq, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaActivePhotoPublication,
  mediaAssetPurgeJobs,
  mediaAssetPurgeRenditions,
  mediaAssets,
  mediaPhotoSelectionDraftEntries,
  mediaPublishedPhotoSelectionEntries,
  mediaRenditions,
  mediaUploadIntents,
} from '~/db/schema'

import type {
  ClaimMediaPurgeResult,
  MediaPurgeJob,
  MediaPurgeRepository,
} from './service'

export type MediaPurgeDatabase = ReturnType<typeof getDatabase>

function ownedAssetCondition(ownerUserId: string, mediaAssetId: string) {
  return and(
    eq(mediaAssets.id, mediaAssetId),
    sql`EXISTS (
      SELECT 1 FROM ${mediaUploadIntents}
      WHERE ${mediaUploadIntents.id} = ${mediaAssets.uploadIntentId}
        AND ${mediaUploadIntents.ownerUserId} = ${ownerUserId}
    )`,
  )
}

function selectionConflictCondition() {
  return sql`EXISTS (
    SELECT 1 FROM ${mediaPhotoSelectionDraftEntries}
    WHERE ${mediaPhotoSelectionDraftEntries.mediaAssetId} = ${mediaAssets.id}
  ) OR EXISTS (
    SELECT 1
    FROM ${mediaActivePhotoPublication}
    INNER JOIN ${mediaPublishedPhotoSelectionEntries}
      ON ${mediaPublishedPhotoSelectionEntries.publishedSelectionId} =
         ${mediaActivePhotoPublication.publishedSelectionId}
    WHERE ${mediaActivePhotoPublication.id} = 1
      AND ${mediaPublishedPhotoSelectionEntries.sourceMediaAssetId} =
          ${mediaAssets.id}
  )`
}

export function createMediaPurgeRepository(
  database: () => MediaPurgeDatabase,
): MediaPurgeRepository {
  return {
    async getStatus(input) {
      const [job] = await database()
        .select()
        .from(mediaAssetPurgeJobs)
        .where(
          and(
            eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
            eq(mediaAssetPurgeJobs.ownerUserId, input.ownerUserId),
          ),
        )
        .limit(1)
      if (!job) return null
      const steps = await database()
        .select({
          objectDeletedAt: mediaAssetPurgeRenditions.objectDeletedAt,
          cdnPurgedAt: mediaAssetPurgeRenditions.cdnPurgedAt,
        })
        .from(mediaAssetPurgeRenditions)
        .where(eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId))
      return {
        mediaAssetId: job.mediaAssetId,
        status: job.completedAt
          ? ('completed' as const)
          : job.lastErrorCode
            ? ('failed' as const)
            : ('purging' as const),
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
        renditionCount: steps.length,
        renditionObjectsDeleted: steps.filter(
          ({ objectDeletedAt }) => objectDeletedAt !== null,
        ).length,
        renditionCdnPurged: steps.filter(({ cdnPurgedAt }) => cdnPurgedAt !== null)
          .length,
        originalDeleted: job.originalDeletedAt !== null,
        lastErrorCode: job.lastErrorCode,
      }
    },

    async claim(input): Promise<ClaimMediaPurgeResult> {
      return database().transaction(async (transaction) => {
        const [knownJob] = await transaction
          .select()
          .from(mediaAssetPurgeJobs)
          .where(
            and(
              eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
              eq(mediaAssetPurgeJobs.ownerUserId, input.ownerUserId),
            ),
          )
          .limit(1)
        if (knownJob?.completedAt) return { status: 'completed' }

        const [asset] = await transaction
          .select()
          .from(mediaAssets)
          .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
          .limit(1)
          .for('update')
        // Photo Selection takes a FOR SHARE lock on these same asset rows
        // before inserting Draft or Published membership. This lock therefore
        // closes the race between the conflict check and the purging update.
        if (!asset) {
          const [completedJob] = await transaction
            .select({ completedAt: mediaAssetPurgeJobs.completedAt })
            .from(mediaAssetPurgeJobs)
            .where(
              and(
                eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
                eq(mediaAssetPurgeJobs.ownerUserId, input.ownerUserId),
              ),
            )
            .limit(1)
          return completedJob?.completedAt
            ? { status: 'completed' }
            : { status: 'not_found' }
        }

        const [existingJob] = await transaction
          .select()
          .from(mediaAssetPurgeJobs)
          .where(
            and(
              eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
              eq(mediaAssetPurgeJobs.ownerUserId, input.ownerUserId),
            ),
          )
          .limit(1)
          .for('update')

        let originalKey: string
        if (existingJob) {
          if (existingJob.completedAt) return { status: 'completed' }
          if (
            existingJob.claimExpiresAt &&
            existingJob.claimExpiresAt > input.claimedAt
          ) {
            return { status: 'busy' }
          }
          if (asset.catalogState !== 'purging' || existingJob.originalKey === null) {
            return { status: 'invalid_state' }
          }
          originalKey = existingJob.originalKey
          await transaction
            .update(mediaAssetPurgeJobs)
            .set({
              claimToken: input.claimToken,
              claimExpiresAt: input.claimExpiresAt,
              lastErrorCode: null,
              updatedAt: input.claimedAt,
            })
            .where(eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId))
        } else {
          if (asset.catalogState !== 'archived') return { status: 'invalid_state' }
          const [selection] = await transaction
            .select({ id: mediaAssets.id })
            .from(mediaAssets)
            .where(
              and(
                eq(mediaAssets.id, asset.id),
                selectionConflictCondition(),
              ),
            )
            .limit(1)
          if (selection) return { status: 'selection_conflict' }

          const renditions = await transaction
            .select({ objectKey: mediaRenditions.objectKey })
            .from(mediaRenditions)
            .where(eq(mediaRenditions.mediaAssetId, asset.id))
            .orderBy(asc(mediaRenditions.profileWidth))
          originalKey = asset.originalKey
          await transaction.insert(mediaAssetPurgeJobs).values({
            mediaAssetId: asset.id,
            ownerUserId: input.ownerUserId,
            originalKey,
            startedAt: input.claimedAt,
            claimToken: input.claimToken,
            claimExpiresAt: input.claimExpiresAt,
            updatedAt: input.claimedAt,
          })
          if (renditions.length > 0) {
            await transaction.insert(mediaAssetPurgeRenditions).values(
              renditions.map(({ objectKey }) => ({
                mediaAssetId: asset.id,
                objectKey,
                updatedAt: input.claimedAt,
              })),
            )
          }
          await transaction
            .update(mediaAssets)
            .set({
              catalogState: 'purging',
              purgeStartedAt: input.claimedAt,
              updatedAt: input.claimedAt,
            })
            .where(eq(mediaAssets.id, asset.id))
        }

        const steps = await transaction
          .select({
            objectKey: mediaAssetPurgeRenditions.objectKey,
            objectDeletedAt: mediaAssetPurgeRenditions.objectDeletedAt,
            cdnPurgedAt: mediaAssetPurgeRenditions.cdnPurgedAt,
          })
          .from(mediaAssetPurgeRenditions)
          .where(eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId))
          .orderBy(asc(mediaAssetPurgeRenditions.objectKey))
        return {
          status: 'claimed',
          job: {
            mediaAssetId: input.mediaAssetId,
            originalKey,
            originalDeletedAt: existingJob?.originalDeletedAt ?? null,
            renditions: steps,
          } satisfies MediaPurgeJob,
        }
      })
    },

    async markRenditionObjectDeleted(input) {
      const [updated] = await database()
        .update(mediaAssetPurgeRenditions)
        .set({ objectDeletedAt: input.deletedAt, updatedAt: input.deletedAt })
        .where(
          and(
            eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId),
            eq(mediaAssetPurgeRenditions.objectKey, input.objectKey),
            sql`EXISTS (
              SELECT 1 FROM ${mediaAssetPurgeJobs}
              WHERE ${mediaAssetPurgeJobs.mediaAssetId} = ${input.mediaAssetId}
                AND ${mediaAssetPurgeJobs.claimToken} = ${input.claimToken}
                AND ${mediaAssetPurgeJobs.completedAt} IS NULL
            )`,
          ),
        )
        .returning({ id: mediaAssetPurgeRenditions.id })
      return updated !== undefined
    },

    async markRenditionCdnPurged(input) {
      const [updated] = await database()
        .update(mediaAssetPurgeRenditions)
        .set({ cdnPurgedAt: input.purgedAt, updatedAt: input.purgedAt })
        .where(
          and(
            eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId),
            eq(mediaAssetPurgeRenditions.objectKey, input.objectKey),
            sql`${mediaAssetPurgeRenditions.objectDeletedAt} IS NOT NULL`,
            sql`EXISTS (
              SELECT 1 FROM ${mediaAssetPurgeJobs}
              WHERE ${mediaAssetPurgeJobs.mediaAssetId} = ${input.mediaAssetId}
                AND ${mediaAssetPurgeJobs.claimToken} = ${input.claimToken}
                AND ${mediaAssetPurgeJobs.completedAt} IS NULL
            )`,
          ),
        )
        .returning({ id: mediaAssetPurgeRenditions.id })
      return updated !== undefined
    },

    async markOriginalDeleted(input) {
      const [updated] = await database()
        .update(mediaAssetPurgeJobs)
        .set({
          originalDeletedAt: input.deletedAt,
          updatedAt: input.deletedAt,
        })
        .where(
          and(
            eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
            eq(mediaAssetPurgeJobs.claimToken, input.claimToken),
            sql`${mediaAssetPurgeJobs.completedAt} IS NULL`,
            sql`NOT EXISTS (
              SELECT 1 FROM ${mediaAssetPurgeRenditions}
              WHERE ${mediaAssetPurgeRenditions.mediaAssetId} = ${input.mediaAssetId}
                AND (${mediaAssetPurgeRenditions.objectDeletedAt} IS NULL OR
                     ${mediaAssetPurgeRenditions.cdnPurgedAt} IS NULL)
            )`,
          ),
        )
        .returning({ mediaAssetId: mediaAssetPurgeJobs.mediaAssetId })
      return updated !== undefined
    },

    async recordFailure(input) {
      await database()
        .update(mediaAssetPurgeJobs)
        .set({
          claimToken: null,
          claimExpiresAt: null,
          lastErrorCode: input.errorCode,
          updatedAt: input.failedAt,
        })
        .where(
          and(
            eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
            eq(mediaAssetPurgeJobs.claimToken, input.claimToken),
            sql`${mediaAssetPurgeJobs.completedAt} IS NULL`,
          ),
        )
    },

    async complete(input) {
      return database().transaction(async (transaction) => {
        const [job] = await transaction
          .select()
          .from(mediaAssetPurgeJobs)
          .where(
            and(
              eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId),
              eq(mediaAssetPurgeJobs.ownerUserId, input.ownerUserId),
              eq(mediaAssetPurgeJobs.claimToken, input.claimToken),
            ),
          )
          .limit(1)
          .for('update')
        if (!job || job.completedAt || job.originalDeletedAt === null) return false

        const [incomplete] = await transaction
          .select({ id: mediaAssetPurgeRenditions.id })
          .from(mediaAssetPurgeRenditions)
          .where(
            and(
              eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId),
              sql`(${mediaAssetPurgeRenditions.objectDeletedAt} IS NULL OR ${mediaAssetPurgeRenditions.cdnPurgedAt} IS NULL)`,
            ),
          )
          .limit(1)
        if (incomplete) return false

        await transaction
          .delete(mediaRenditions)
          .where(eq(mediaRenditions.mediaAssetId, input.mediaAssetId))
        const [deletedAsset] = await transaction
          .delete(mediaAssets)
          .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
          .returning({ id: mediaAssets.id })
        if (!deletedAsset) return false
        await transaction
          .delete(mediaAssetPurgeRenditions)
          .where(eq(mediaAssetPurgeRenditions.mediaAssetId, input.mediaAssetId))
        await transaction
          .update(mediaAssetPurgeJobs)
          .set({
            originalKey: null,
            completedAt: input.completedAt,
            claimToken: null,
            claimExpiresAt: null,
            lastErrorCode: null,
            updatedAt: input.completedAt,
          })
          .where(eq(mediaAssetPurgeJobs.mediaAssetId, input.mediaAssetId))
        return true
      })
    },
  }
}

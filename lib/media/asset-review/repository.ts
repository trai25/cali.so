import 'server-only'

import { and, eq, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaActivePhotoPublication,
  mediaAssets,
  mediaPhotoSelectionDraftEntries,
  mediaPublishedPhotoSelectionEntries,
  mediaUploadIntents,
} from '~/db/schema'

import type {
  MediaAssetReviewRecord,
  MediaAssetReviewRepository,
} from './service'

export type MediaAssetReviewDatabase = ReturnType<typeof getDatabase>

function record(row: typeof mediaAssets.$inferSelect): MediaAssetReviewRecord {
  const altTextSuggestion =
    row.altTextSuggestionZhHans !== null &&
    row.altTextSuggestionEn !== null &&
    row.altTextSuggestionModel !== null &&
    row.altTextSuggestedAt !== null
      ? {
          zhHans: row.altTextSuggestionZhHans,
          en: row.altTextSuggestionEn,
          model: row.altTextSuggestionModel,
          suggestedAt: row.altTextSuggestedAt,
        }
      : null
  return {
    id: row.id,
    lifecycle: row.lifecycle,
    processingState: row.processingState,
    width: row.width,
    height: row.height,
    capturedAt: row.capturedAt,
    cameraMake: row.cameraMake,
    cameraModel: row.cameraModel,
    lens: row.lens,
    focalLengthMillimeters:
      row.focalLengthMillimeters === null
        ? null
        : Number(row.focalLengthMillimeters),
    aperture: row.aperture === null ? null : Number(row.aperture),
    shutterSpeedSeconds:
      row.shutterSpeedSeconds === null ? null : Number(row.shutterSpeedSeconds),
    iso: row.iso,
    locationLabelZhHans: row.locationLabelZhHans,
    locationLabelEn: row.locationLabelEn,
    focalPoint:
      row.focalPointX === null || row.focalPointY === null
        ? null
        : { x: Number(row.focalPointX), y: Number(row.focalPointY) },
    altTextSuggestion,
    altTextZhHans: row.altTextZhHans,
    altTextEn: row.altTextEn,
    altTextApprovedAt: row.altTextApprovedAt,
    archivedAt: row.archivedAt,
  }
}

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

export function createMediaAssetReviewRepository(
  database: () => MediaAssetReviewDatabase,
): MediaAssetReviewRepository {
  async function findOwnedAsset(input: {
    ownerUserId: string
    mediaAssetId: string
  }) {
    const [asset] = await database()
      .select()
      .from(mediaAssets)
      .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
      .limit(1)
    return asset ? record(asset) : null
  }

  return {
    findOwnedAsset,

    async updateDisplayMetadata(input) {
      const [asset] = await database()
        .update(mediaAssets)
        .set({
          locationLabelZhHans: input.locationLabelZhHans,
          locationLabelEn: input.locationLabelEn,
          focalPointX:
            input.focalPoint === null ? null : String(input.focalPoint.x),
          focalPointY:
            input.focalPoint === null ? null : String(input.focalPoint.y),
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            ownedAssetCondition(input.ownerUserId, input.mediaAssetId),
            eq(mediaAssets.lifecycle, 'active'),
            eq(mediaAssets.processingState, 'ready'),
          ),
        )
        .returning()
      return asset ? record(asset) : null
    },

    async approveAltText(input) {
      const [asset] = await database()
        .update(mediaAssets)
        .set({
          altTextZhHans: input.zhHans,
          altTextEn: input.en,
          altTextApprovedAt: input.approvedAt,
          updatedAt: input.approvedAt,
        })
        .where(
          and(
            ownedAssetCondition(input.ownerUserId, input.mediaAssetId),
            eq(mediaAssets.lifecycle, 'active'),
            eq(mediaAssets.processingState, 'ready'),
          ),
        )
        .returning()
      return asset ? record(asset) : null
    },

    async archive(input) {
      return database().transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(mediaAssets)
          .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
          .limit(1)
          .for('update')
        if (!current) return { status: 'not_found' }
        if (current.lifecycle !== 'active') return { status: 'invalid_state' }

        const [selection] = await transaction
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, current.id),
              sql`EXISTS (
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
              )`,
            ),
          )
          .limit(1)
        if (selection) return { status: 'selection_conflict' }

        const [asset] = await transaction
          .update(mediaAssets)
          .set({
            lifecycle: 'archived',
            archivedAt: input.archivedAt,
            updatedAt: input.archivedAt,
          })
          .where(
            and(
              eq(mediaAssets.id, current.id),
              eq(mediaAssets.lifecycle, 'active'),
            ),
          )
          .returning()
        return asset
          ? { status: 'updated', asset: record(asset) }
          : { status: 'invalid_state' }
      })
    },

    async restore(input) {
      const [asset] = await database()
        .update(mediaAssets)
        .set({
          lifecycle: 'active',
          archivedAt: null,
          updatedAt: input.restoredAt,
        })
        .where(
          and(
            ownedAssetCondition(input.ownerUserId, input.mediaAssetId),
            eq(mediaAssets.lifecycle, 'archived'),
          ),
        )
        .returning()
      if (asset) return { status: 'updated', asset: record(asset) }

      const current = await findOwnedAsset(input)
      return { status: current ? 'invalid_state' : 'not_found' }
    },
  }
}

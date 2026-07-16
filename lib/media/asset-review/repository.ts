import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaActivePhotoPublication,
  mediaAssets,
  mediaPhotoSelectionDraftEntries,
  mediaPhotoSelectionDrafts,
  mediaPublishedPhotoSelectionEntries,
  mediaRenditions,
  mediaUploadIntents,
} from '~/db/schema'

import type {
  MediaAssetReviewRecord,
  MediaAssetReviewRepository,
} from './service'

export type MediaAssetReviewDatabase = ReturnType<typeof getDatabase>

const reviewAssetColumns = {
  id: mediaAssets.id,
  createdAt: mediaAssets.createdAt,
  catalogState: mediaAssets.catalogState,
  processingState: mediaAssets.processingState,
  width: mediaAssets.width,
  height: mediaAssets.height,
  capturedAt: mediaAssets.capturedAt,
  cameraMake: mediaAssets.cameraMake,
  cameraModel: mediaAssets.cameraModel,
  lens: mediaAssets.lens,
  focalLengthMillimeters: mediaAssets.focalLengthMillimeters,
  aperture: mediaAssets.aperture,
  shutterSpeedSeconds: mediaAssets.shutterSpeedSeconds,
  iso: mediaAssets.iso,
  locationLabelZhHans: mediaAssets.locationLabelZhHans,
  locationLabelEn: mediaAssets.locationLabelEn,
  focalPointX: mediaAssets.focalPointX,
  focalPointY: mediaAssets.focalPointY,
  altTextSuggestionZhHans: mediaAssets.altTextSuggestionZhHans,
  altTextSuggestionEn: mediaAssets.altTextSuggestionEn,
  altTextSuggestionModel: mediaAssets.altTextSuggestionModel,
  altTextSuggestedAt: mediaAssets.altTextSuggestedAt,
  altTextZhHans: mediaAssets.altTextZhHans,
  altTextEn: mediaAssets.altTextEn,
  altTextApprovedAt: mediaAssets.altTextApprovedAt,
  archivedAt: mediaAssets.archivedAt,
} as const

type ReviewAssetRow = Pick<
  typeof mediaAssets.$inferSelect,
  keyof typeof reviewAssetColumns
>

function record(
  row: ReviewAssetRow,
  preview:
    | { objectKey: string; width: number; height: number }
    | null = null,
  publicRenditionUrl?: (key: string) => string,
): MediaAssetReviewRecord {
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
    createdAt: row.createdAt,
    catalogState: row.catalogState,
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
    previewRendition:
      preview && publicRenditionUrl
        ? {
            src: publicRenditionUrl(preview.objectKey),
            width: preview.width,
            height: preview.height,
          }
        : null,
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

async function previewRendition(
  database: Pick<MediaAssetReviewDatabase, 'select'>,
  mediaAssetId: string,
) {
  const [preview] = await database
    .select({
      objectKey: mediaRenditions.objectKey,
      width: mediaRenditions.width,
      height: mediaRenditions.height,
    })
    .from(mediaRenditions)
    .where(
      and(
        eq(mediaRenditions.mediaAssetId, mediaAssetId),
        eq(mediaRenditions.profileWidth, 640),
      ),
    )
    .limit(1)
  return preview ?? null
}

export function createMediaAssetReviewRepository(
  database: () => MediaAssetReviewDatabase,
  publicRenditionUrl: (key: string) => string,
): MediaAssetReviewRepository {
  async function findOwnedAsset(input: {
    ownerUserId: string
    mediaAssetId: string
  }) {
    const [asset] = await database()
      .select(reviewAssetColumns)
      .from(mediaAssets)
      .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
      .limit(1)
    if (!asset) return null
    const preview = await previewRendition(database(), asset.id)
    return record(asset, preview, publicRenditionUrl)
  }

  return {
    async listOwnedAssets(input) {
      const rows = await database()
        .select({
          ...reviewAssetColumns,
          previewObjectKey: mediaRenditions.objectKey,
          previewWidth: mediaRenditions.width,
          previewHeight: mediaRenditions.height,
        })
        .from(mediaAssets)
        .innerJoin(
          mediaUploadIntents,
          and(
            eq(mediaUploadIntents.id, mediaAssets.uploadIntentId),
            eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
          ),
        )
        .leftJoin(
          mediaRenditions,
          and(
            eq(mediaRenditions.mediaAssetId, mediaAssets.id),
            eq(mediaRenditions.profileWidth, 640),
          ),
        )
        .where(
          input.view === 'active'
            ? eq(mediaAssets.catalogState, 'active')
            : inArray(mediaAssets.catalogState, ['archived', 'purging']),
        )
        .orderBy(desc(mediaAssets.createdAt))
      return rows.map(
        ({ previewObjectKey, previewWidth, previewHeight, ...asset }) =>
          record(
            asset,
            previewObjectKey && previewWidth && previewHeight
              ? {
                  objectKey: previewObjectKey,
                  width: previewWidth,
                  height: previewHeight,
                }
              : null,
            publicRenditionUrl,
          ),
      )
    },

    findOwnedAsset,

    async updateDisplayMetadata(input) {
      const client = database()
      const [asset] = await client
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
            eq(mediaAssets.catalogState, 'active'),
            eq(mediaAssets.processingState, 'ready'),
          ),
        )
        .returning(reviewAssetColumns)
      if (!asset) return null
      const preview = await previewRendition(client, asset.id)
      return record(asset, preview, publicRenditionUrl)
    },

    async approveAltText(input) {
      const client = database()
      const [asset] = await client
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
            eq(mediaAssets.catalogState, 'active'),
            eq(mediaAssets.processingState, 'ready'),
          ),
        )
        .returning(reviewAssetColumns)
      if (!asset) return null
      const preview = await previewRendition(client, asset.id)
      return record(asset, preview, publicRenditionUrl)
    },

    async archive(input) {
      return database().transaction(async (transaction) => {
        const [current] = await transaction
          .select({ id: mediaAssets.id, catalogState: mediaAssets.catalogState })
          .from(mediaAssets)
          .where(ownedAssetCondition(input.ownerUserId, input.mediaAssetId))
          .limit(1)
          .for('update')
        if (!current) return { status: 'not_found' }
        if (current.catalogState !== 'active') return { status: 'invalid_state' }

        const [selection] = await transaction
          .select({ id: mediaAssets.id })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, current.id),
              sql`EXISTS (
                SELECT 1
                FROM ${mediaPhotoSelectionDraftEntries}
                INNER JOIN ${mediaPhotoSelectionDrafts}
                  ON ${mediaPhotoSelectionDrafts.id} =
                     ${mediaPhotoSelectionDraftEntries.draftId}
                WHERE ${mediaPhotoSelectionDraftEntries.mediaAssetId} = ${mediaAssets.id}
                  AND ${mediaPhotoSelectionDrafts.ownerUserId} =
                      ${input.ownerUserId}
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
            catalogState: 'archived',
            archivedAt: input.archivedAt,
            updatedAt: input.archivedAt,
          })
          .where(
            and(
              eq(mediaAssets.id, current.id),
              eq(mediaAssets.catalogState, 'active'),
            ),
          )
          .returning(reviewAssetColumns)
        const preview = asset
          ? await previewRendition(transaction, asset.id)
          : null
        return asset
          ? {
              status: 'updated',
              asset: record(asset, preview, publicRenditionUrl),
            }
          : { status: 'invalid_state' }
      })
    },

    async restore(input) {
      const client = database()
      const [asset] = await client
        .update(mediaAssets)
        .set({
          catalogState: 'active',
          archivedAt: null,
          updatedAt: input.restoredAt,
        })
        .where(
          and(
            ownedAssetCondition(input.ownerUserId, input.mediaAssetId),
            eq(mediaAssets.catalogState, 'archived'),
          ),
        )
        .returning(reviewAssetColumns)
      if (asset) {
        const preview = await previewRendition(client, asset.id)
        return {
          status: 'updated',
          asset: record(asset, preview, publicRenditionUrl),
        }
      }

      const current = await findOwnedAsset(input)
      return { status: current ? 'invalid_state' : 'not_found' }
    },
  }
}

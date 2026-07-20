import 'server-only'

import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import {
  mediaAssets,
  mediaRenditions,
  mediaUploadIntents,
} from '~/db/schema'

import { lockMediaAssetProcessing } from '../catalog/lifecycle-locks'

import type {
  ActiveMediaAssetProcessingSession,
  MarkMediaAssetReadyInput,
  MediaAssetRecord,
  MediaIngestionRepository,
  OriginalContentType,
  RenditionRecord,
  UploadIntentRecord,
} from './service'

export type MediaIngestionDatabase = ReturnType<typeof getDatabase>

function uploadIntentRecord(
  row: typeof mediaUploadIntents.$inferSelect,
): UploadIntentRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    idempotencyKey: row.idempotencyKey,
    originalKey: row.originalKey,
    contentType: row.contentType as OriginalContentType,
    byteSize: row.byteSize,
    checksumSha256: row.checksumSha256,
    expiresAt: row.expiresAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  }
}

function optionalNumber(value: string | null) {
  return value === null ? null : Number(value)
}

function mediaAssetRecord(
  row: typeof mediaAssets.$inferSelect,
): MediaAssetRecord {
  return {
    id: row.id,
    uploadIntentId: row.uploadIntentId,
    processingState: row.processingState as MediaAssetRecord['processingState'],
    processingErrorCode: row.processingErrorCode,
    originalKey: row.originalKey,
    originalContentType: row.originalContentType as OriginalContentType,
    originalByteSize: row.originalByteSize,
    originalChecksumSha256: row.originalChecksumSha256,
    width: row.width,
    height: row.height,
    capturedAt: row.capturedAt,
    cameraMake: row.cameraMake,
    cameraModel: row.cameraModel,
    lens: row.lens,
    focalLengthMillimeters: optionalNumber(row.focalLengthMillimeters),
    aperture: optionalNumber(row.aperture),
    shutterSpeedSeconds: optionalNumber(row.shutterSpeedSeconds),
    iso: row.iso,
    captureLocationEnvelope: row.captureLocationEnvelope,
  }
}

function renditionRecord(
  row: typeof mediaRenditions.$inferSelect,
): RenditionRecord {
  return {
    mediaAssetId: row.mediaAssetId,
    profileWidth: row.profileWidth,
    objectKey: row.objectKey,
    checksumSha256: row.checksumSha256,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    contentType: row.contentType as 'image/jpeg',
    colorSpace: row.colorSpace as 'srgb',
    progressive: row.progressive as true,
    metadataStripped: row.metadataStripped as true,
  }
}

function numericValue(value: number | null) {
  return value === null ? null : String(value)
}

export function createMediaIngestionRepository(
  database: () => MediaIngestionDatabase,
): MediaIngestionRepository {
  async function findAssetBy(
    field: typeof mediaAssets.id | typeof mediaAssets.uploadIntentId,
    value: string,
  ) {
    const [row] = await database()
      .select()
      .from(mediaAssets)
      .where(eq(field, value))
      .limit(1)
    return row ? mediaAssetRecord(row) : null
  }

  async function findRenditionWith(
    client: MediaIngestionDatabase | Parameters<
      Parameters<MediaIngestionDatabase['transaction']>[0]
    >[0],
    mediaAssetId: string,
    profileWidth: number,
  ) {
    const [row] = await client
      .select()
      .from(mediaRenditions)
      .where(
        and(
          eq(mediaRenditions.mediaAssetId, mediaAssetId),
          eq(mediaRenditions.profileWidth, profileWidth),
        ),
      )
      .limit(1)
    return row ? renditionRecord(row) : null
  }

  async function recordRenditionWith(
    client: MediaIngestionDatabase | Parameters<
      Parameters<MediaIngestionDatabase['transaction']>[0]
    >[0],
    input: RenditionRecord,
  ) {
    const [created] = await client
      .insert(mediaRenditions)
      .values(input)
      .onConflictDoNothing({
        target: [mediaRenditions.mediaAssetId, mediaRenditions.profileWidth],
      })
      .returning()
    if (created) return renditionRecord(created)

    const existing = await findRenditionWith(
      client,
      input.mediaAssetId,
      input.profileWidth,
    )
    if (!existing) throw new Error('Rendition conflict was not readable')
    return existing
  }

  async function markReadyWith(
    client: MediaIngestionDatabase | Parameters<
      Parameters<MediaIngestionDatabase['transaction']>[0]
    >[0],
    {
      mediaAssetId,
      metadata,
      completedAt,
      requiredRenditionCount,
    }: MarkMediaAssetReadyInput,
  ) {
    const [ready] = await client
      .update(mediaAssets)
      .set({
        processingState: 'ready',
        processingErrorCode: null,
        width: metadata.width,
        height: metadata.height,
        capturedAt: metadata.capturedAt,
        cameraMake: metadata.cameraMake,
        cameraModel: metadata.cameraModel,
        lens: metadata.lens,
        focalLengthMillimeters: numericValue(metadata.focalLengthMillimeters),
        aperture: numericValue(metadata.aperture),
        shutterSpeedSeconds: numericValue(metadata.shutterSpeedSeconds),
        iso: metadata.iso,
        captureLocationEnvelope: metadata.captureLocationEnvelope,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.catalogState, 'active'),
          eq(mediaAssets.processingState, 'processing'),
          sql`(
            SELECT count(*)
            FROM ${mediaRenditions}
            WHERE ${mediaRenditions.mediaAssetId} = ${mediaAssetId}
          ) = ${requiredRenditionCount}`,
        ),
      )
      .returning()
    if (ready) return mediaAssetRecord(ready)

    const [current] = await client
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId))
      .limit(1)
    if (!current || current.catalogState !== 'active') return null
    if (current.processingState === 'ready') return mediaAssetRecord(current)
    throw new Error('Media Asset Rendition manifest is incomplete')
  }

  return {
    async createUploadIntent(input) {
      const [created] = await database()
        .insert(mediaUploadIntents)
        .values(input)
        .onConflictDoNothing({
          target: [
            mediaUploadIntents.ownerUserId,
            mediaUploadIntents.idempotencyKey,
          ],
        })
        .returning()
      if (created) return uploadIntentRecord(created)

      const [existing] = await database()
        .select()
        .from(mediaUploadIntents)
        .where(
          and(
            eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
            eq(mediaUploadIntents.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
      if (!existing) throw new Error('Upload Intent conflict was not readable')
      return uploadIntentRecord(existing)
    },

    async findUploadIntent(ownerUserId, id) {
      const [row] = await database()
        .select()
        .from(mediaUploadIntents)
        .where(
          and(
            eq(mediaUploadIntents.id, id),
            eq(mediaUploadIntents.ownerUserId, ownerUserId),
          ),
        )
        .limit(1)
      return row ? uploadIntentRecord(row) : null
    },

    async claimUploadIntentTransfer(ownerUserId, id, activeAt) {
      const [row] = await database()
        .update(mediaUploadIntents)
        .set({ updatedAt: activeAt })
        .where(
          and(
            eq(mediaUploadIntents.id, id),
            eq(mediaUploadIntents.ownerUserId, ownerUserId),
            gt(mediaUploadIntents.expiresAt, activeAt),
            isNull(mediaUploadIntents.completedAt),
            isNull(mediaUploadIntents.discardStartedAt),
          ),
        )
        .returning()
      return row ? uploadIntentRecord(row) : null
    },

    findMediaAsset(uploadIntentId) {
      return findAssetBy(mediaAssets.uploadIntentId, uploadIntentId)
    },

    async createVerifiedMediaAsset({ uploadIntent, completedAt }) {
      await database().execute(sql`
        WITH completed_intent AS (
          UPDATE ${mediaUploadIntents}
          SET
            completed_at = COALESCE(completed_at, ${completedAt}),
            updated_at = ${completedAt}
          WHERE id = ${uploadIntent.id}
            AND discard_started_at IS NULL
          RETURNING id
        )
        INSERT INTO ${mediaAssets} (
          upload_intent_id,
          processing_state,
          original_key,
          original_content_type,
          original_byte_size,
          original_checksum_sha256,
          created_at,
          updated_at
        )
        SELECT
          completed_intent.id,
          'original_verified',
          ${uploadIntent.originalKey},
          ${uploadIntent.contentType},
          ${uploadIntent.byteSize},
          ${uploadIntent.checksumSha256},
          ${completedAt},
          ${completedAt}
        FROM completed_intent
        ON CONFLICT (upload_intent_id) DO NOTHING
      `)
      const asset = await findAssetBy(mediaAssets.uploadIntentId, uploadIntent.id)
      return asset
    },

    async claimProcessing({ mediaAssetId, claimedAt, staleBefore }) {
      const [claimed] = await database()
        .update(mediaAssets)
        .set({
          processingState: 'processing',
          processingErrorCode: null,
          updatedAt: claimedAt,
        })
        .where(
          and(
            eq(mediaAssets.id, mediaAssetId),
            eq(mediaAssets.catalogState, 'active'),
            or(
              inArray(mediaAssets.processingState, [
                'original_verified',
                'repair_required',
                'retryable_failure',
              ]),
              and(
                eq(mediaAssets.processingState, 'processing'),
                lt(mediaAssets.updatedAt, staleBefore),
              ),
            ),
          ),
        )
        .returning({ id: mediaAssets.id })
      return claimed !== undefined
    },

    getMediaAsset(id) {
      return findAssetBy(mediaAssets.id, id)
    },

    async withActiveProcessingAsset<T>({ mediaAssetId, run }: {
      mediaAssetId: string
      run(session: ActiveMediaAssetProcessingSession): Promise<T>
    }) {
      const result = await database().transaction(async (transaction) => {
        await lockMediaAssetProcessing(transaction, mediaAssetId)
        const [asset] = await transaction
          .select({
            catalogState: mediaAssets.catalogState,
            processingState: mediaAssets.processingState,
          })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, mediaAssetId))
          .limit(1)
        if (
          !asset ||
          asset.catalogState !== 'active' ||
          asset.processingState !== 'processing'
        ) {
          return { status: 'canceled' as const }
        }

        try {
          const value = await run({
            findRendition: (profileWidth) =>
              findRenditionWith(transaction, mediaAssetId, profileWidth),
            recordRendition: (input) =>
              recordRenditionWith(transaction, input),
            markReady: (input) =>
              markReadyWith(transaction, { mediaAssetId, ...input }),
          })
          return { status: 'active' as const, value }
        } catch (error) {
          // The callback may have inserted a deterministic Rendition manifest
          // before a Bunny failure. Return the error as data so the transaction
          // commits that cleanup record, then rethrow outside the transaction.
          return { status: 'failed' as const, error }
        }
      })
      if (result.status === 'failed') throw result.error
      return result
    },

    async findRendition(mediaAssetId, profileWidth) {
      return findRenditionWith(database(), mediaAssetId, profileWidth)
    },

    async recordRendition(input) {
      return recordRenditionWith(database(), input)
    },

    async markReady(input) {
      return markReadyWith(database(), input)
    },

    async markFailure({
      mediaAssetId,
      processingState,
      processingErrorCode,
      failedAt,
    }) {
      const [failed] = await database()
        .update(mediaAssets)
        .set({
          processingState,
          processingErrorCode,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(mediaAssets.id, mediaAssetId),
            eq(mediaAssets.catalogState, 'active'),
            ne(mediaAssets.processingState, 'ready'),
          ),
        )
        .returning()
      if (!failed) {
        const [current] = await database()
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, mediaAssetId))
          .limit(1)
        if (!current || current.catalogState !== 'active') return null
        if (current.processingState === 'ready') return mediaAssetRecord(current)
        throw new Error('Media Asset failure was not recorded')
      }
      return mediaAssetRecord(failed)
    },
  }
}

import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import {
  MediaImageError,
  processOriginalImage,
  RENDITION_PROFILE_WIDTHS,
} from '../processing/image'
import { BunnyStorageError } from '../storage/bunny'
import { MAX_ORIGINAL_UPLOAD_BYTES } from '../storage/upload'

export const UPLOAD_INTENT_LIFETIME_MS = 24 * 60 * 60 * 1000

export type OriginalContentType =
  | 'image/heic'
  | 'image/heif'
  | 'image/jpeg'
  | 'image/png'

export type UploadIntentRecord = {
  id: string
  ownerUserId: string
  idempotencyKey: string
  originalKey: string
  contentType: OriginalContentType
  byteSize: number
  checksumSha256: string
  expiresAt: Date
  completedAt: Date | null
  createdAt: Date
}

export type MediaAssetProcessingState =
  | 'original_verified'
  | 'processing'
  | 'ready'
  | 'retryable_failure'
  | 'repair_required'

export type MediaAssetRecord = {
  id: string
  uploadIntentId: string
  processingState: MediaAssetProcessingState
  processingErrorCode: string | null
  originalKey: string
  originalContentType: OriginalContentType
  originalByteSize: number
  originalChecksumSha256: string
  width: number | null
  height: number | null
  capturedAt: Date | null
  cameraMake: string | null
  cameraModel: string | null
  lens: string | null
  focalLengthMillimeters: number | null
  aperture: number | null
  shutterSpeedSeconds: number | null
  iso: number | null
  captureLocationEnvelope: unknown | null
}

export type RenditionRecord = {
  mediaAssetId: string
  profileWidth: number
  objectKey: string
  checksumSha256: string
  byteSize: number
  width: number
  height: number
  contentType: 'image/jpeg'
  colorSpace: 'srgb'
  progressive: true
  metadataStripped: true
}

export interface MediaIngestionRepository {
  createUploadIntent(
    input: Omit<UploadIntentRecord, 'completedAt'>,
  ): Promise<UploadIntentRecord>
  findUploadIntent(ownerUserId: string, id: string): Promise<UploadIntentRecord | null>
  findMediaAsset(uploadIntentId: string): Promise<MediaAssetRecord | null>
  createVerifiedMediaAsset(input: {
    uploadIntent: UploadIntentRecord
    completedAt: Date
  }): Promise<MediaAssetRecord>
  claimProcessing(input: {
    mediaAssetId: string
    claimedAt: Date
    staleBefore: Date
  }): Promise<boolean>
  getMediaAsset(id: string): Promise<MediaAssetRecord | null>
  findRendition(
    mediaAssetId: string,
    profileWidth: number,
  ): Promise<RenditionRecord | null>
  recordRendition(input: RenditionRecord): Promise<RenditionRecord>
  markReady(input: {
    mediaAssetId: string
    metadata: Omit<
      MediaAssetRecord,
      | 'id'
      | 'uploadIntentId'
      | 'processingState'
      | 'processingErrorCode'
      | 'originalKey'
      | 'originalContentType'
      | 'originalByteSize'
      | 'originalChecksumSha256'
    >
    completedAt: Date
  }): Promise<MediaAssetRecord>
  markFailure(input: {
    mediaAssetId: string
    processingState: 'retryable_failure' | 'repair_required'
    processingErrorCode: string
    failedAt: Date
  }): Promise<MediaAssetRecord>
}

export type MediaIngestionErrorCode =
  | 'idempotency_conflict'
  | 'invalid_request'
  | 'not_found'
  | 'original_mismatch'
  | 'rendition_mismatch'

export class MediaIngestionError extends Error {
  constructor(readonly code: MediaIngestionErrorCode) {
    super(`Media ingestion failed: ${code}`)
    this.name = 'MediaIngestionError'
  }
}

type MediaIngestionDependencies = {
  repository: MediaIngestionRepository
  storage: {
    inspectOriginal(key: string): Promise<{
      byteSize: number
      contentType: string
    }>
    readOriginal(key: string): Promise<Uint8Array>
    storeRendition(input: {
      key: string
      bytes: Uint8Array
      checksumSha256: string
      contentType: 'image/jpeg'
    }): Promise<string>
    inspectRendition(key: string): Promise<{
      byteSize: number
      contentType: string
    }>
    readRendition(key: string): Promise<Uint8Array>
  }
  captureLocationVault: {
    seal(location: { latitude: number; longitude: number }): unknown
  }
  processor?: typeof processOriginalImage
  clock?: { now(): Date }
  idGenerator?: () => string
}

const contentTypeExtensions: Record<OriginalContentType, string> = {
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validText(value: string, maximumLength: number) {
  return value === value.trim() && value.length > 0 && value.length <= maximumLength
}

function assertUploadIntentInput(input: {
  ownerUserId: string
  idempotencyKey: string
  contentType: string
  byteSize: number
  checksumSha256: string
}): asserts input is typeof input & { contentType: OriginalContentType } {
  if (
    !validText(input.ownerUserId, 255) ||
    !validText(input.idempotencyKey, 128) ||
    !(input.contentType in contentTypeExtensions) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > MAX_ORIGINAL_UPLOAD_BYTES ||
    !/^[a-f0-9]{64}$/.test(input.checksumSha256)
  ) {
    throw new MediaIngestionError('invalid_request')
  }
}

function sameTransferExpectation(
  intent: UploadIntentRecord,
  input: {
    ownerUserId: string
    idempotencyKey: string
    contentType: OriginalContentType
    byteSize: number
    checksumSha256: string
  },
) {
  return (
    intent.ownerUserId === input.ownerUserId &&
    intent.idempotencyKey === input.idempotencyKey &&
    intent.originalKey ===
      `originals/${intent.id}.${contentTypeExtensions[input.contentType]}` &&
    intent.contentType === input.contentType &&
    intent.byteSize === input.byteSize &&
    intent.checksumSha256 === input.checksumSha256
  )
}

const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000

async function verifyOriginal(
  storage: MediaIngestionDependencies['storage'],
  intent: UploadIntentRecord,
) {
  const object = await storage.inspectOriginal(intent.originalKey)
  if (
    object.byteSize !== intent.byteSize ||
    object.contentType !== intent.contentType
  ) {
    throw new MediaIngestionError('original_mismatch')
  }
  const bytes = await storage.readOriginal(intent.originalKey)
  const checksumSha256 = createHash('sha256').update(bytes).digest('hex')
  if (
    bytes.byteLength !== intent.byteSize ||
    checksumSha256 !== intent.checksumSha256
  ) {
    throw new MediaIngestionError('original_mismatch')
  }
  return bytes
}

async function inspectOptionalRendition(
  storage: MediaIngestionDependencies['storage'],
  key: string,
) {
  try {
    return await storage.inspectRendition(key)
  } catch (error) {
    if (error instanceof BunnyStorageError && error.code === 'not_found') {
      return null
    }
    throw error
  }
}

async function verifyRendition(
  storage: MediaIngestionDependencies['storage'],
  key: string,
  expected: { byteSize: number; contentType: string; checksumSha256: string },
  inspected?: { byteSize: number; contentType: string },
) {
  const object = inspected ?? (await storage.inspectRendition(key))
  if (
    object.byteSize !== expected.byteSize ||
    object.contentType !== expected.contentType
  ) {
    throw new MediaIngestionError('rendition_mismatch')
  }
  const bytes = await storage.readRendition(key)
  if (
    bytes.byteLength !== expected.byteSize ||
    createHash('sha256').update(bytes).digest('hex') !== expected.checksumSha256
  ) {
    throw new MediaIngestionError('rendition_mismatch')
  }
}

function renditionMatches(
  record: RenditionRecord,
  expected: Omit<RenditionRecord, 'mediaAssetId' | 'objectKey'>,
) {
  return (
    record.profileWidth === expected.profileWidth &&
    record.checksumSha256 === expected.checksumSha256 &&
    record.byteSize === expected.byteSize &&
    record.width === expected.width &&
    record.height === expected.height &&
    record.contentType === expected.contentType &&
    record.colorSpace === expected.colorSpace &&
    record.progressive === expected.progressive &&
    record.metadataStripped === expected.metadataStripped
  )
}

function safeFailure(error: unknown) {
  if (error instanceof MediaImageError) {
    return {
      processingState: 'repair_required' as const,
      processingErrorCode: `image_${error.code}`,
    }
  }
  if (error instanceof MediaIngestionError) {
    return {
      processingState: 'repair_required' as const,
      processingErrorCode: `ingestion_${error.code}`,
    }
  }
  if (error instanceof BunnyStorageError) {
    if (error.code === 'not_found') {
      return {
        processingState: 'repair_required' as const,
        processingErrorCode: 'storage_not_found',
      }
    }
    return {
      processingState: 'retryable_failure' as const,
      processingErrorCode: `storage_${error.code}`,
    }
  }
  return {
    processingState: 'retryable_failure' as const,
    processingErrorCode: 'dependency_unavailable',
  }
}

export function createMediaIngestionService({
  repository,
  storage,
  captureLocationVault,
  processor = processOriginalImage,
  clock = { now: () => new Date() },
  idGenerator = randomUUID,
}: MediaIngestionDependencies) {
  return {
    async createUploadIntent(input: {
      ownerUserId: string
      idempotencyKey: string
      contentType: OriginalContentType
      byteSize: number
      checksumSha256: string
    }) {
      assertUploadIntentInput(input)
      const now = clock.now()
      const id = idGenerator()
      if (!uuidPattern.test(id)) {
        throw new MediaIngestionError('invalid_request')
      }
      const intent = await repository.createUploadIntent({
        ...input,
        id,
        originalKey: `originals/${id}.${contentTypeExtensions[input.contentType]}`,
        createdAt: now,
        expiresAt: new Date(now.getTime() + UPLOAD_INTENT_LIFETIME_MS),
      })
      if (!sameTransferExpectation(intent, input)) {
        throw new MediaIngestionError('idempotency_conflict')
      }
      return intent
    },

    async completeUploadIntent(input: {
      ownerUserId: string
      uploadIntentId: string
    }) {
      if (
        !validText(input.ownerUserId, 255) ||
        !validText(input.uploadIntentId, 64)
      ) {
        throw new MediaIngestionError('invalid_request')
      }
      const intent = await repository.findUploadIntent(
        input.ownerUserId,
        input.uploadIntentId,
      )
      if (!intent) throw new MediaIngestionError('not_found')

      let asset = await repository.findMediaAsset(intent.id)
      if (asset?.processingState === 'ready') return asset

      let bytes: Uint8Array
      try {
        bytes = await verifyOriginal(storage, intent)
      } catch (error) {
        if (!asset) throw error
        const failure = safeFailure(error)
        return repository.markFailure({
          mediaAssetId: asset.id,
          ...failure,
          failedAt: clock.now(),
        })
      }

      const now = clock.now()
      asset ??= await repository.createVerifiedMediaAsset({
        uploadIntent: intent,
        completedAt: now,
      })
      const claimed = await repository.claimProcessing({
        mediaAssetId: asset.id,
        claimedAt: now,
        staleBefore: new Date(now.getTime() - PROCESSING_STALE_AFTER_MS),
      })
      if (!claimed) return (await repository.getMediaAsset(asset.id)) ?? asset

      try {
        const processed = await processor(bytes)
        const byProfile = new Map(
          processed.renditions.map((rendition) => [
            rendition.profileWidth,
            rendition,
          ]),
        )
        if (
          processed.renditions.length !== RENDITION_PROFILE_WIDTHS.length ||
          byProfile.size !== RENDITION_PROFILE_WIDTHS.length ||
          RENDITION_PROFILE_WIDTHS.some((width) => !byProfile.has(width))
        ) {
          throw new MediaIngestionError('rendition_mismatch')
        }

        for (const profileWidth of RENDITION_PROFILE_WIDTHS) {
          const rendition = byProfile.get(profileWidth)!
          const objectKey =
            `renditions/${asset.id}/${profileWidth}-${rendition.checksumSha256}.jpg`
          const expected = {
            profileWidth,
            checksumSha256: rendition.checksumSha256,
            byteSize: rendition.byteSize,
            width: rendition.width,
            height: rendition.height,
            contentType: rendition.contentType,
            colorSpace: rendition.colorSpace,
            progressive: rendition.progressive,
            metadataStripped: rendition.metadataStripped,
          }
          const existing = await repository.findRendition(asset.id, profileWidth)
          if (existing) {
            if (!renditionMatches(existing, expected)) {
              throw new MediaIngestionError('rendition_mismatch')
            }
            await verifyRendition(storage, existing.objectKey, existing)
            continue
          }

          let stored = await inspectOptionalRendition(storage, objectKey)
          if (!stored) {
            await storage.storeRendition({
              key: objectKey,
              bytes: rendition.bytes,
              checksumSha256: rendition.checksumSha256,
              contentType: rendition.contentType,
            })
            stored = await storage.inspectRendition(objectKey)
          }
          if (
            stored.byteSize !== rendition.byteSize ||
            stored.contentType !== rendition.contentType
          ) {
            throw new MediaIngestionError('rendition_mismatch')
          }
          await verifyRendition(storage, objectKey, expected, stored)
          const recorded = await repository.recordRendition({
            mediaAssetId: asset.id,
            objectKey,
            ...expected,
          })
          if (
            recorded.objectKey !== objectKey ||
            !renditionMatches(recorded, expected)
          ) {
            throw new MediaIngestionError('rendition_mismatch')
          }
        }

        const captureLocationEnvelope = processed.original.captureLocation
          ? captureLocationVault.seal(processed.original.captureLocation)
          : null
        return repository.markReady({
          mediaAssetId: asset.id,
          metadata: {
            width: processed.original.width,
            height: processed.original.height,
            capturedAt: processed.original.capturedAt,
            cameraMake: processed.original.cameraMake,
            cameraModel: processed.original.cameraModel,
            lens: processed.original.lens,
            focalLengthMillimeters:
              processed.original.focalLengthMillimeters,
            aperture: processed.original.aperture,
            shutterSpeedSeconds: processed.original.shutterSpeedSeconds,
            iso:
              processed.original.iso !== null &&
              Number.isSafeInteger(processed.original.iso)
                ? processed.original.iso
                : null,
            captureLocationEnvelope,
          },
          completedAt: clock.now(),
        })
      } catch (error) {
        const failure = safeFailure(error)
        return repository.markFailure({
          mediaAssetId: asset.id,
          ...failure,
          failedAt: clock.now(),
        })
      }
    },
  }
}

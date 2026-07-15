import 'server-only'

export type MediaAssetReviewRecord = {
  id: string
  lifecycle: 'active' | 'archived' | 'purging'
  processingState:
    | 'upload_initiated'
    | 'original_verified'
    | 'processing'
    | 'ready'
    | 'retryable_failure'
    | 'repair_required'
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
  locationLabelZhHans: string | null
  locationLabelEn: string | null
  focalPoint: { x: number; y: number } | null
  altTextSuggestion: {
    zhHans: string
    en: string
    model: string
    suggestedAt: Date
  } | null
  altTextZhHans: string | null
  altTextEn: string | null
  altTextApprovedAt: Date | null
  archivedAt: Date | null
}

type LifecycleResult =
  | { status: 'updated'; asset: MediaAssetReviewRecord }
  | { status: 'invalid_state' }
  | { status: 'not_found' }
  | { status: 'selection_conflict' }

export interface MediaAssetReviewRepository {
  findOwnedAsset(input: {
    ownerUserId: string
    mediaAssetId: string
  }): Promise<MediaAssetReviewRecord | null>
  updateDisplayMetadata(input: {
    ownerUserId: string
    mediaAssetId: string
    locationLabelZhHans: string | null
    locationLabelEn: string | null
    focalPoint: { x: number; y: number } | null
    updatedAt: Date
  }): Promise<MediaAssetReviewRecord | null>
  approveAltText(input: {
    ownerUserId: string
    mediaAssetId: string
    zhHans: string
    en: string
    approvedAt: Date
  }): Promise<MediaAssetReviewRecord | null>
  archive(input: {
    ownerUserId: string
    mediaAssetId: string
    archivedAt: Date
  }): Promise<LifecycleResult>
  restore(input: {
    ownerUserId: string
    mediaAssetId: string
    restoredAt: Date
  }): Promise<LifecycleResult>
}

export type MediaAssetReviewErrorCode =
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'invalid_state'
  | 'not_found'
  | 'selection_conflict'

export class MediaAssetReviewError extends Error {
  constructor(readonly code: MediaAssetReviewErrorCode) {
    super(`Media Asset review failed: ${code}`)
    this.name = 'MediaAssetReviewError'
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_PUBLIC_TEXT_LENGTH = 280

function validIdentity(ownerUserId: string, mediaAssetId: string) {
  return (
    ownerUserId === ownerUserId.trim() &&
    ownerUserId.length > 0 &&
    ownerUserId.length <= 255 &&
    uuidPattern.test(mediaAssetId)
  )
}

function validRequiredText(value: string) {
  return (
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_PUBLIC_TEXT_LENGTH
  )
}

function validOptionalLabel(value: string | null) {
  return value === null || validRequiredText(value)
}

function validFocalPoint(value: { x: number; y: number } | null) {
  return (
    value === null ||
    (Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      value.x >= 0 &&
      value.x <= 1 &&
      value.y >= 0 &&
      value.y <= 1)
  )
}

function unwrapLifecycle(result: LifecycleResult) {
  if (result.status === 'updated') return result.asset
  throw new MediaAssetReviewError(result.status)
}

export function createMediaAssetReviewService({
  repository,
  clock = { now: () => new Date() },
}: {
  repository: MediaAssetReviewRepository
  clock?: { now(): Date }
}) {
  return {
    async getAsset(input: { ownerUserId: string; mediaAssetId: string }) {
      if (!validIdentity(input.ownerUserId, input.mediaAssetId)) {
        throw new MediaAssetReviewError('invalid_request')
      }
      let asset: MediaAssetReviewRecord | null
      try {
        asset = await repository.findOwnedAsset(input)
      } catch {
        throw new MediaAssetReviewError('dependency_unavailable')
      }
      if (!asset) throw new MediaAssetReviewError('not_found')
      return asset
    },

    async updateDisplayMetadata(input: {
      ownerUserId: string
      mediaAssetId: string
      locationLabelZhHans: string | null
      locationLabelEn: string | null
      focalPoint: { x: number; y: number } | null
    }) {
      if (
        !validIdentity(input.ownerUserId, input.mediaAssetId) ||
        !validOptionalLabel(input.locationLabelZhHans) ||
        !validOptionalLabel(input.locationLabelEn) ||
        !validFocalPoint(input.focalPoint)
      ) {
        throw new MediaAssetReviewError('invalid_request')
      }
      let asset: MediaAssetReviewRecord | null
      try {
        asset = await repository.updateDisplayMetadata({
          ...input,
          updatedAt: clock.now(),
        })
      } catch {
        throw new MediaAssetReviewError('dependency_unavailable')
      }
      if (!asset) throw new MediaAssetReviewError('invalid_state')
      return asset
    },

    async approveAltText(input: {
      ownerUserId: string
      mediaAssetId: string
      zhHans: string
      en: string
    }) {
      if (
        !validIdentity(input.ownerUserId, input.mediaAssetId) ||
        !validRequiredText(input.zhHans) ||
        !validRequiredText(input.en)
      ) {
        throw new MediaAssetReviewError('invalid_request')
      }
      let asset: MediaAssetReviewRecord | null
      try {
        asset = await repository.approveAltText({
          ...input,
          approvedAt: clock.now(),
        })
      } catch {
        throw new MediaAssetReviewError('dependency_unavailable')
      }
      if (!asset) throw new MediaAssetReviewError('invalid_state')
      return asset
    },

    async archive(input: { ownerUserId: string; mediaAssetId: string }) {
      if (!validIdentity(input.ownerUserId, input.mediaAssetId)) {
        throw new MediaAssetReviewError('invalid_request')
      }
      try {
        return unwrapLifecycle(
          await repository.archive({ ...input, archivedAt: clock.now() }),
        )
      } catch (error) {
        if (error instanceof MediaAssetReviewError) throw error
        throw new MediaAssetReviewError('dependency_unavailable')
      }
    },

    async restore(input: { ownerUserId: string; mediaAssetId: string }) {
      if (!validIdentity(input.ownerUserId, input.mediaAssetId)) {
        throw new MediaAssetReviewError('invalid_request')
      }
      try {
        return unwrapLifecycle(
          await repository.restore({ ...input, restoredAt: clock.now() }),
        )
      } catch (error) {
        if (error instanceof MediaAssetReviewError) throw error
        throw new MediaAssetReviewError('dependency_unavailable')
      }
    },
  }
}

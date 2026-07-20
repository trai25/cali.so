import 'server-only'

export type MediaAssetReviewRecord = {
  id: string
  createdAt: Date
  catalogState: 'active' | 'archived' | 'purging'
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
  hasCaptureLocation: boolean
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
  previewRendition: {
    src: string
    width: number
    height: number
  } | null
}

type CatalogStateResult =
  | {
      status: 'updated'
      asset: MediaAssetReviewRecord
      undoOperationId?: string
      publicSelectionChanged?: boolean
    }
  | { status: 'invalid_state' }
  | { status: 'not_found' }
  | { status: 'revision_conflict' }
  | { status: 'undo_expired' }

export interface MediaAssetReviewRepository {
  listOwnedAssets(input: {
    ownerUserId: string
    view: 'active' | 'archived'
  }): Promise<MediaAssetReviewRecord[]>
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
    undoExpiresAt: Date
  }): Promise<CatalogStateResult>
  undoArchive(input: {
    ownerUserId: string
    mediaAssetId: string
    operationId: string
    undoneAt: Date
  }): Promise<CatalogStateResult>
  restore(input: {
    ownerUserId: string
    mediaAssetId: string
    restoredAt: Date
  }): Promise<CatalogStateResult>
}

export type MediaAssetReviewErrorCode =
  | 'cache_invalidation_failed'
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'invalid_state'
  | 'not_found'
  | 'revision_conflict'
  | 'undo_expired'

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

function unwrapCatalogState(result: CatalogStateResult) {
  if (result.status === 'updated') return result
  throw new MediaAssetReviewError(result.status)
}

function unwrapAsset(result: CatalogStateResult) {
  return unwrapCatalogState(result).asset
}

// The UI offers Undo for 10 seconds. Keep server-side validation open longer
// so response transit and a cold-started Undo request do not consume that time.
const ARCHIVE_UNDO_WINDOW_MS = 30_000

export function createMediaAssetReviewService({
  repository,
  invalidatePublicSelection,
  clock = { now: () => new Date() },
}: {
  repository: MediaAssetReviewRepository
  invalidatePublicSelection: () => Promise<void>
  clock?: { now(): Date }
}) {
  return {
    async listAssets(input: {
      ownerUserId: string
      view: 'active' | 'archived'
    }) {
      if (
        input.view !== 'active' &&
        input.view !== 'archived'
      ) {
        throw new MediaAssetReviewError('invalid_request')
      }
      if (
        input.ownerUserId !== input.ownerUserId.trim() ||
        input.ownerUserId.length === 0 ||
        input.ownerUserId.length > 255
      ) {
        throw new MediaAssetReviewError('invalid_request')
      }
      try {
        return await repository.listOwnedAssets(input)
      } catch {
        throw new MediaAssetReviewError('dependency_unavailable')
      }
    },

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
        const archivedAt = clock.now()
        const result = unwrapCatalogState(
          await repository.archive({
            ...input,
            archivedAt,
            undoExpiresAt: new Date(
              archivedAt.getTime() + ARCHIVE_UNDO_WINDOW_MS,
            ),
          }),
        )
        if (result.publicSelectionChanged) {
          try {
            await invalidatePublicSelection()
          } catch {
            throw new MediaAssetReviewError('cache_invalidation_failed')
          }
        }
        return result
      } catch (error) {
        if (error instanceof MediaAssetReviewError) throw error
        throw new MediaAssetReviewError('dependency_unavailable')
      }
    },

    async undoArchive(input: {
      ownerUserId: string
      mediaAssetId: string
      operationId: string
    }) {
      if (
        !validIdentity(input.ownerUserId, input.mediaAssetId) ||
        !uuidPattern.test(input.operationId)
      ) {
        throw new MediaAssetReviewError('invalid_request')
      }
      try {
        const result = unwrapCatalogState(
          await repository.undoArchive({ ...input, undoneAt: clock.now() }),
        )
        if (result.publicSelectionChanged) {
          try {
            await invalidatePublicSelection()
          } catch {
            throw new MediaAssetReviewError('cache_invalidation_failed')
          }
        }
        return result
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
        return unwrapAsset(
          await repository.restore({ ...input, restoredAt: clock.now() }),
        )
      } catch (error) {
        if (error instanceof MediaAssetReviewError) throw error
        throw new MediaAssetReviewError('dependency_unavailable')
      }
    },
  }
}

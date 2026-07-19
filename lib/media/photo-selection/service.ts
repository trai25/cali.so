import 'server-only'

export type DraftPhotoSelection = {
  revision: number
  mediaAssetIds: string[]
  updatedAt: Date | null
}

export type PublishedPhotoSelectionResult = {
  status: 'published'
  replayed: boolean
  publishedSelectionId: string
  draftRevision: number
  itemCount: number
  publishedAt: Date
}

export type SaveDraftRepositoryResult =
  | { status: 'saved'; draft: DraftPhotoSelection }
  | { status: 'revision_conflict'; currentRevision: number }
  | { status: 'ineligible_assets'; ineligibleMediaAssetIds: string[] }

export type PublishDraftRepositoryResult =
  | PublishedPhotoSelectionResult
  | { status: 'revision_conflict'; currentRevision: number }
  | { status: 'ineligible_assets'; ineligibleMediaAssetIds: string[] }
  | { status: 'idempotency_conflict' }

export interface PhotoSelectionRepository {
  getDraft(ownerUserId: string): Promise<DraftPhotoSelection>
  saveDraft(input: {
    ownerUserId: string
    expectedRevision: number
    mediaAssetIds: string[]
    updatedAt: Date
  }): Promise<SaveDraftRepositoryResult>
  publishDraft(input: {
    ownerUserId: string
    expectedDraftRevision: number
    idempotencyKey: string
    publishedAt: Date
  }): Promise<PublishDraftRepositoryResult>
}

export type PhotoSelectionErrorCode =
  | 'cache_invalidation_failed'
  | 'dependency_unavailable'
  | 'idempotency_conflict'
  | 'ineligible_assets'
  | 'invalid_request'
  | 'revision_conflict'

export class PhotoSelectionError extends Error {
  constructor(
    readonly code: PhotoSelectionErrorCode,
    readonly details?: {
      currentRevision?: number
      ineligibleMediaAssetIds?: string[]
      publishedSelectionId?: string
    },
  ) {
    super(`Photo Selection operation failed: ${code}`)
    this.name = 'PhotoSelectionError'
  }
}

type PhotoSelectionDependencies = {
  repository: PhotoSelectionRepository
  invalidatePublicSelection: () => Promise<void>
  clock?: { now(): Date }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validOwnerUserId(value: string) {
  return value === value.trim() && value.length > 0 && value.length <= 255
}

function validRevision(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function validMediaAssetIds(values: string[]) {
  return (
    values.every((value) => uuidPattern.test(value)) &&
    new Set(values).size === values.length
  )
}

function throwRepositoryResult(
  result: Exclude<
    SaveDraftRepositoryResult | PublishDraftRepositoryResult,
    { status: 'saved' | 'published' }
  >,
): never {
  if (result.status === 'revision_conflict') {
    throw new PhotoSelectionError('revision_conflict', {
      currentRevision: result.currentRevision,
    })
  }
  if (result.status === 'ineligible_assets') {
    throw new PhotoSelectionError('ineligible_assets', {
      ineligibleMediaAssetIds: result.ineligibleMediaAssetIds,
    })
  }
  throw new PhotoSelectionError('idempotency_conflict')
}

export function createPhotoSelectionService({
  repository,
  invalidatePublicSelection,
  clock = { now: () => new Date() },
}: PhotoSelectionDependencies) {
  return {
    async getDraft(ownerUserId: string) {
      if (!validOwnerUserId(ownerUserId)) {
        throw new PhotoSelectionError('invalid_request')
      }
      try {
        return await repository.getDraft(ownerUserId)
      } catch {
        throw new PhotoSelectionError('dependency_unavailable')
      }
    },

    async saveDraft(input: {
      ownerUserId: string
      expectedRevision: number
      mediaAssetIds: string[]
    }) {
      if (
        !validOwnerUserId(input.ownerUserId) ||
        !validRevision(input.expectedRevision) ||
        !validMediaAssetIds(input.mediaAssetIds)
      ) {
        throw new PhotoSelectionError('invalid_request')
      }

      let result: SaveDraftRepositoryResult
      try {
        result = await repository.saveDraft({
          ...input,
          mediaAssetIds: [...input.mediaAssetIds],
          updatedAt: clock.now(),
        })
      } catch {
        throw new PhotoSelectionError('dependency_unavailable')
      }
      if (result.status !== 'saved') throwRepositoryResult(result)
      return result.draft
    },

    async publish(input: {
      ownerUserId: string
      expectedDraftRevision: number
      idempotencyKey: string
    }) {
      if (
        !validOwnerUserId(input.ownerUserId) ||
        !validRevision(input.expectedDraftRevision) ||
        input.idempotencyKey !== input.idempotencyKey.trim() ||
        input.idempotencyKey.length === 0 ||
        input.idempotencyKey.length > 128
      ) {
        throw new PhotoSelectionError('invalid_request')
      }

      let result: PublishDraftRepositoryResult
      try {
        result = await repository.publishDraft({
          ...input,
          publishedAt: clock.now(),
        })
      } catch {
        throw new PhotoSelectionError('dependency_unavailable')
      }
      if (result.status !== 'published') throwRepositoryResult(result)

      try {
        await invalidatePublicSelection()
      } catch {
        throw new PhotoSelectionError('cache_invalidation_failed', {
          publishedSelectionId: result.publishedSelectionId,
        })
      }
      return result
    },
  }
}

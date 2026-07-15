import 'server-only'

import { randomUUID } from 'node:crypto'

export const MEDIA_PURGE_CONFIRMATION = 'PURGE'
const PURGE_CLAIM_LEASE_MS = 5 * 60 * 1000

export type MediaPurgeStep = {
  objectKey: string
  objectDeletedAt: Date | null
  cdnPurgedAt: Date | null
}

export type MediaPurgeJob = {
  mediaAssetId: string
  originalKey: string
  originalDeletedAt: Date | null
  renditions: MediaPurgeStep[]
}

export type MediaPurgeStatusRecord = {
  mediaAssetId: string
  status: 'purging' | 'failed' | 'completed'
  startedAt: Date
  updatedAt: Date
  completedAt: Date | null
  renditionCount: number
  renditionObjectsDeleted: number
  renditionCdnPurged: number
  originalDeleted: boolean
  lastErrorCode: string | null
}

export type ClaimMediaPurgeResult =
  | { status: 'claimed'; job: MediaPurgeJob }
  | { status: 'completed' }
  | { status: 'busy' }
  | { status: 'invalid_state' }
  | { status: 'not_found' }
  | { status: 'selection_conflict' }

export interface MediaPurgeRepository {
  getStatus(input: {
    ownerUserId: string
    mediaAssetId: string
  }): Promise<MediaPurgeStatusRecord | null>
  claim(input: {
    ownerUserId: string
    mediaAssetId: string
    claimToken: string
    claimedAt: Date
    claimExpiresAt: Date
  }): Promise<ClaimMediaPurgeResult>
  markRenditionObjectDeleted(input: {
    mediaAssetId: string
    claimToken: string
    objectKey: string
    deletedAt: Date
  }): Promise<boolean>
  markRenditionCdnPurged(input: {
    mediaAssetId: string
    claimToken: string
    objectKey: string
    purgedAt: Date
  }): Promise<boolean>
  markOriginalDeleted(input: {
    mediaAssetId: string
    claimToken: string
    deletedAt: Date
  }): Promise<boolean>
  recordFailure(input: {
    mediaAssetId: string
    claimToken: string
    errorCode: string
    failedAt: Date
  }): Promise<void>
  complete(input: {
    ownerUserId: string
    mediaAssetId: string
    claimToken: string
    completedAt: Date
  }): Promise<boolean>
}

export type MediaPurgeErrorCode =
  | 'busy'
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'invalid_state'
  | 'not_found'
  | 'retryable_failure'
  | 'selection_conflict'

export class MediaPurgeError extends Error {
  constructor(
    readonly code: MediaPurgeErrorCode,
    readonly details?: {
      step?: 'rendition_object' | 'rendition_cdn' | 'original'
    },
  ) {
    super(`Media Asset Purge failed: ${code}`)
    this.name = 'MediaPurgeError'
  }
}

type MediaPurgeDependencies = {
  repository: MediaPurgeRepository
  storage: {
    deleteOriginal(key: string): Promise<void>
    deleteRendition(key: string): Promise<void>
    purgeRendition(key: string): Promise<void>
  }
  clock?: { now(): Date }
  idGenerator?: () => string
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validIdentity(ownerUserId: string, mediaAssetId: string) {
  return (
    ownerUserId === ownerUserId.trim() &&
    ownerUserId.length > 0 &&
    ownerUserId.length <= 255 &&
    uuidPattern.test(mediaAssetId)
  )
}

function throwClaimFailure(
  result: Exclude<ClaimMediaPurgeResult, { status: 'claimed' | 'completed' }>,
): never {
  throw new MediaPurgeError(result.status)
}

export function createMediaPurgeService({
  repository,
  storage,
  clock = { now: () => new Date() },
  idGenerator = randomUUID,
}: MediaPurgeDependencies) {
  return {
    async getStatus(input: { ownerUserId: string; mediaAssetId: string }) {
      if (!validIdentity(input.ownerUserId, input.mediaAssetId)) {
        throw new MediaPurgeError('invalid_request')
      }
      let status: MediaPurgeStatusRecord | null
      try {
        status = await repository.getStatus(input)
      } catch {
        throw new MediaPurgeError('dependency_unavailable')
      }
      if (!status) throw new MediaPurgeError('not_found')
      return status
    },

    async purge(input: {
      ownerUserId: string
      mediaAssetId: string
      confirmation: string
    }) {
      if (
        !validIdentity(input.ownerUserId, input.mediaAssetId) ||
        input.confirmation !== MEDIA_PURGE_CONFIRMATION
      ) {
        throw new MediaPurgeError('invalid_request')
      }

      const claimToken = idGenerator()
      const claimedAt = clock.now()
      let claim: ClaimMediaPurgeResult
      try {
        claim = await repository.claim({
          ownerUserId: input.ownerUserId,
          mediaAssetId: input.mediaAssetId,
          claimToken,
          claimedAt,
          claimExpiresAt: new Date(claimedAt.getTime() + PURGE_CLAIM_LEASE_MS),
        })
      } catch {
        throw new MediaPurgeError('dependency_unavailable')
      }
      if (claim.status === 'completed') {
        return { status: 'purged' as const, mediaAssetId: input.mediaAssetId }
      }
      if (claim.status !== 'claimed') throwClaimFailure(claim)

      const fail = async (
        step: NonNullable<MediaPurgeError['details']>['step'],
      ): Promise<never> => {
        try {
          await repository.recordFailure({
            mediaAssetId: input.mediaAssetId,
            claimToken,
            errorCode: `${step}_failed`,
            failedAt: clock.now(),
          })
        } catch {
          throw new MediaPurgeError('dependency_unavailable')
        }
        throw new MediaPurgeError('retryable_failure', { step })
      }

      for (const rendition of claim.job.renditions) {
        if (rendition.objectDeletedAt === null) {
          try {
            await storage.deleteRendition(rendition.objectKey)
          } catch {
            await fail('rendition_object')
          }
          try {
            const marked = await repository.markRenditionObjectDeleted({
              mediaAssetId: input.mediaAssetId,
              claimToken,
              objectKey: rendition.objectKey,
              deletedAt: clock.now(),
            })
            if (!marked) throw new Error('Purge claim was lost')
          } catch {
            throw new MediaPurgeError('dependency_unavailable')
          }
        }

        if (rendition.cdnPurgedAt === null) {
          try {
            await storage.purgeRendition(rendition.objectKey)
          } catch {
            await fail('rendition_cdn')
          }
          try {
            const marked = await repository.markRenditionCdnPurged({
              mediaAssetId: input.mediaAssetId,
              claimToken,
              objectKey: rendition.objectKey,
              purgedAt: clock.now(),
            })
            if (!marked) throw new Error('Purge claim was lost')
          } catch {
            throw new MediaPurgeError('dependency_unavailable')
          }
        }
      }

      if (claim.job.originalDeletedAt === null) {
        try {
          await storage.deleteOriginal(claim.job.originalKey)
        } catch {
          await fail('original')
        }
        try {
          const marked = await repository.markOriginalDeleted({
            mediaAssetId: input.mediaAssetId,
            claimToken,
            deletedAt: clock.now(),
          })
          if (!marked) throw new Error('Purge claim was lost')
        } catch {
          throw new MediaPurgeError('dependency_unavailable')
        }
      }

      try {
        const completed = await repository.complete({
          ownerUserId: input.ownerUserId,
          mediaAssetId: input.mediaAssetId,
          claimToken,
          completedAt: clock.now(),
        })
        if (!completed) throw new Error('Purge was incomplete')
      } catch {
        throw new MediaPurgeError('dependency_unavailable')
      }
      return { status: 'purged' as const, mediaAssetId: input.mediaAssetId }
    },
  }
}

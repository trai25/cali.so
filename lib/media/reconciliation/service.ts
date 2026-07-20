import 'server-only'

import type { MediaAssetRecord } from '../ingestion/service'
import type { MediaRecoveryCandidate } from './repository'

export type MediaReconciliationErrorCode =
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'not_found'

export class MediaReconciliationError extends Error {
  constructor(readonly code: MediaReconciliationErrorCode) {
    super(`Media reconciliation failed: ${code}`)
    this.name = 'MediaReconciliationError'
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BATCH_SIZE = 5
const UNFINISHED_UPLOAD_GRACE_MS = 5 * 60 * 1000
const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000

type Dependencies = {
  repository: {
    listRecoveryCandidates(input: {
      createdBefore: Date
      processingStaleBefore: Date
      limit: number
    }): Promise<MediaRecoveryCandidate[]>
    markRecoveryAttempted(input: {
      uploadIntentId: string
      attemptedAt: Date
    }): Promise<void>
    deleteAbandonedUploadIntent(input: {
      uploadIntentId: string
      expiredBefore: Date
    }): Promise<boolean>
    listReadyWithoutAltTextSuggestion(limit: number): Promise<
      Array<{ ownerUserId: string; mediaAssetId: string }>
    >
    markAltTextSuggestionAttempted(input: {
      mediaAssetId: string
      attemptedAt: Date
    }): Promise<void>
    findOwnedRecoverableAsset(input: {
      ownerUserId: string
      mediaAssetId: string
    }): Promise<{ uploadIntentId: string } | null>
  }
  ingestion: {
    completeUploadIntent(input: {
      ownerUserId: string
      uploadIntentId: string
    }): Promise<MediaAssetRecord>
  }
  storage: {
    deleteOriginal(key: string): Promise<void>
  }
  altText: {
    generateSuggestion(input: {
      ownerUserId: string
      mediaAssetId: string
    }): Promise<unknown>
  }
  clock?: { now(): Date }
}

export function createMediaReconciliationService({
  repository,
  ingestion,
  storage,
  altText,
  clock = { now: () => new Date() },
}: Dependencies) {
  async function generateAltText(ownerUserId: string, mediaAssetId: string) {
    await repository.markAltTextSuggestionAttempted({
      mediaAssetId,
      attemptedAt: clock.now(),
    })
    await altText.generateSuggestion({ ownerUserId, mediaAssetId })
  }

  return {
    async run() {
      const now = clock.now()
      let resumed = 0
      let cleaned = 0
      let suggested = 0
      let failed = 0
      const attemptedAltText = new Set<string>()
      let candidates: MediaRecoveryCandidate[]
      try {
        candidates = await repository.listRecoveryCandidates({
          createdBefore: new Date(now.getTime() - UNFINISHED_UPLOAD_GRACE_MS),
          processingStaleBefore: new Date(
            now.getTime() - PROCESSING_STALE_AFTER_MS,
          ),
          limit: BATCH_SIZE,
        })
      } catch {
        throw new MediaReconciliationError('dependency_unavailable')
      }

      for (const candidate of candidates) {
        try {
          await repository.markRecoveryAttempted({
            uploadIntentId: candidate.uploadIntentId,
            attemptedAt: now,
          })
          if (!candidate.mediaAssetId && candidate.expiresAt < now) {
            // Bunny deletion treats a missing key as success. Delete storage
            // first so a provider failure leaves the durable intent available
            // for another cleanup attempt instead of orphaning the object.
            await storage.deleteOriginal(candidate.originalKey)
            if (
              await repository.deleteAbandonedUploadIntent({
                uploadIntentId: candidate.uploadIntentId,
                expiredBefore: now,
              })
            ) {
              cleaned += 1
            }
            continue
          }
          const asset = await ingestion.completeUploadIntent({
            ownerUserId: candidate.ownerUserId,
            uploadIntentId: candidate.uploadIntentId,
          })
          if (asset.processingState === 'ready') {
            resumed += 1
            try {
              attemptedAltText.add(asset.id)
              await generateAltText(candidate.ownerUserId, asset.id)
              suggested += 1
            } catch {
              failed += 1
            }
          }
        } catch {
          failed += 1
        }
      }

      let missing: Array<{ ownerUserId: string; mediaAssetId: string }>
      try {
        missing = await repository.listReadyWithoutAltTextSuggestion(
          BATCH_SIZE,
        )
      } catch {
        failed += 1
        return { resumed, cleaned, suggested, failed }
      }
      for (const asset of missing) {
        if (attemptedAltText.has(asset.mediaAssetId)) continue
        try {
          await generateAltText(asset.ownerUserId, asset.mediaAssetId)
          suggested += 1
        } catch {
          failed += 1
        }
      }

      return { resumed, cleaned, suggested, failed }
    },

    async resumeMediaAsset(input: {
      ownerUserId: string
      mediaAssetId: string
    }) {
      if (
        input.ownerUserId !== input.ownerUserId.trim() ||
        input.ownerUserId.length === 0 ||
        input.ownerUserId.length > 255 ||
        !uuidPattern.test(input.mediaAssetId)
      ) {
        throw new MediaReconciliationError('invalid_request')
      }
      let target: { uploadIntentId: string } | null
      try {
        target = await repository.findOwnedRecoverableAsset(input)
      } catch {
        throw new MediaReconciliationError('dependency_unavailable')
      }
      if (!target) throw new MediaReconciliationError('not_found')
      try {
        const asset = await ingestion.completeUploadIntent({
          ownerUserId: input.ownerUserId,
          uploadIntentId: target.uploadIntentId,
        })
        if (asset.processingState === 'ready') {
          try {
            await generateAltText(input.ownerUserId, asset.id)
          } catch {
            // An attempt-marker or AI failure must not undo image recovery.
          }
        }
        return asset
      } catch {
        throw new MediaReconciliationError('dependency_unavailable')
      }
    },
  }
}

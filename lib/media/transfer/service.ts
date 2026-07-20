import 'server-only'

import { originalUploadChunkCount } from '../storage/transfer'

export type TransferJob = {
  uploadIntentId: string
  mediaAssetId: string | null
  contentType: string
  byteSize: number
  checksumSha256: string
  stage: 'awaiting_file' | 'processing' | 'failed' | 'discarding'
  processingState: string | null
  processingErrorCode: string | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface MediaTransferRepository {
  listOwnedTransferJobs(ownerUserId: string): Promise<TransferJob[]>
  prepareDiscard(input: {
    ownerUserId: string
    uploadIntentId: string
    discardedAt: Date
  }): Promise<
    | { status: 'asset'; mediaAssetId: string }
    | {
        status: 'bare_intent'
        originalKey: string
        byteSize: number
      }
    | { status: 'invalid_state' }
    | { status: 'not_found' }
  >
  deleteBareIntent(input: {
    ownerUserId: string
    uploadIntentId: string
  }): Promise<boolean>
}

export type MediaTransferErrorCode =
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'invalid_state'
  | 'not_found'
  | 'retryable_failure'

export class MediaTransferError extends Error {
  constructor(readonly code: MediaTransferErrorCode) {
    super(`Media Transfer failed: ${code}`)
    this.name = 'MediaTransferError'
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validOwnerUserId(value: string) {
  return value === value.trim() && value.length > 0 && value.length <= 255
}

export function createMediaTransferService({
  repository,
  purge,
  storage,
  clock = { now: () => new Date() },
}: {
  repository: MediaTransferRepository
  purge: {
    purge(input: {
      ownerUserId: string
      mediaAssetId: string
      confirmation: string
    }): Promise<unknown>
  }
  storage: {
    deleteOriginal(key: string): Promise<void>
    deleteOriginalChunk(originalKey: string, chunkIndex: number): Promise<void>
  }
  clock?: { now(): Date }
}) {
  return {
    async list(ownerUserId: string) {
      if (!validOwnerUserId(ownerUserId)) {
        throw new MediaTransferError('invalid_request')
      }
      try {
        return await repository.listOwnedTransferJobs(ownerUserId)
      } catch {
        throw new MediaTransferError('dependency_unavailable')
      }
    },

    async discard(input: { ownerUserId: string; uploadIntentId: string }) {
      if (
        !validOwnerUserId(input.ownerUserId) ||
        !uuidPattern.test(input.uploadIntentId)
      ) {
        throw new MediaTransferError('invalid_request')
      }
      let target: Awaited<ReturnType<MediaTransferRepository['prepareDiscard']>>
      try {
        target = await repository.prepareDiscard({
          ...input,
          discardedAt: clock.now(),
        })
      } catch {
        throw new MediaTransferError('dependency_unavailable')
      }
      if (target.status === 'not_found' || target.status === 'invalid_state') {
        throw new MediaTransferError(target.status)
      }
      if (target.status === 'asset') {
        try {
          await purge.purge({
            ownerUserId: input.ownerUserId,
            mediaAssetId: target.mediaAssetId,
            confirmation: 'PURGE',
          })
        } catch {
          throw new MediaTransferError('retryable_failure')
        }
        return { status: 'discarded' as const, uploadIntentId: input.uploadIntentId }
      }

      try {
        await Promise.all([
          storage.deleteOriginal(target.originalKey),
          ...Array.from(
            { length: originalUploadChunkCount(target.byteSize) },
            (_, chunkIndex) =>
              storage.deleteOriginalChunk(target.originalKey, chunkIndex),
          ),
        ])
      } catch {
        throw new MediaTransferError('retryable_failure')
      }
      try {
        const deleted = await repository.deleteBareIntent(input)
        if (!deleted) throw new MediaTransferError('invalid_state')
      } catch (error) {
        if (error instanceof MediaTransferError) throw error
        throw new MediaTransferError('dependency_unavailable')
      }
      return { status: 'discarded' as const, uploadIntentId: input.uploadIntentId }
    },
  }
}

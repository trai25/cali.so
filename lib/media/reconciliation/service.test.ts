import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { MediaAssetRecord } from '../ingestion/service'
import { MAX_ORIGINAL_UPLOAD_CHUNK_BYTES } from '../storage/transfer'
import type { MediaRecoveryCandidate } from './repository'
import {
  createMediaReconciliationService,
  MediaReconciliationError,
} from './service'

const now = new Date('2026-07-15T12:00:00.000Z')
const uploadIntentId = '22222222-2222-4222-8222-222222222222'
const mediaAssetId = '11111111-1111-4111-8111-111111111111'

function readyAsset(): MediaAssetRecord {
  return {
    id: mediaAssetId,
    uploadIntentId,
    processingState: 'ready',
    processingErrorCode: null,
    originalKey: `originals/${uploadIntentId}.jpg`,
    originalContentType: 'image/jpeg',
    originalByteSize: 1000,
    originalChecksumSha256: 'a'.repeat(64),
    width: 1200,
    height: 800,
    capturedAt: null,
    cameraMake: null,
    cameraModel: null,
    lens: null,
    focalLengthMillimeters: null,
    aperture: null,
    shutterSpeedSeconds: null,
    iso: null,
    captureLocationEnvelope: null,
  }
}

function fixture() {
  const repository = {
    listRecoveryCandidates: vi.fn(
      async (): Promise<MediaRecoveryCandidate[]> => [],
    ),
    claimAbandonedUploadIntent: vi.fn(async () => true),
    markRecoveryAttempted: vi.fn(async () => {}),
    deleteAbandonedUploadIntent: vi.fn(async () => true),
    listReadyWithoutAltTextSuggestion: vi.fn(
      async (): Promise<
        Array<{ ownerUserId: string; mediaAssetId: string }>
      > => [],
    ),
    markAltTextSuggestionAttempted: vi.fn(async () => {}),
    findOwnedRecoverableAsset: vi.fn(
      async (): Promise<{ uploadIntentId: string } | null> => ({
        uploadIntentId,
      }),
    ),
  }
  const ingestion = {
    completeUploadIntent: vi.fn(async () => readyAsset()),
  }
  const storage = {
    deleteOriginal: vi.fn(async () => {}),
    deleteOriginalChunk: vi.fn(async () => {}),
  }
  const altText = { generateSuggestion: vi.fn(async () => ({})) }
  return {
    repository,
    ingestion,
    storage,
    altText,
    service: createMediaReconciliationService({
      repository,
      ingestion,
      storage,
      altText,
      clock: { now: () => now },
    }),
  }
}

describe('Media reconciliation service', () => {
  it('resumes durable processing and recovers missing Alt Text Suggestions', async () => {
    const f = fixture()
    f.repository.listRecoveryCandidates.mockResolvedValueOnce([
      {
        ownerUserId: 'owner_01',
        uploadIntentId,
        mediaAssetId,
        originalKey: `originals/${uploadIntentId}.jpg`,
        byteSize: 1000,
        expiresAt: new Date('2026-07-16T00:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T10:00:00.000Z'),
      },
    ])
    f.repository.listReadyWithoutAltTextSuggestion.mockResolvedValueOnce([
      { ownerUserId: 'owner_01', mediaAssetId },
    ])

    await expect(f.service.run()).resolves.toEqual({
      resumed: 1,
      cleaned: 0,
      suggested: 1,
      failed: 0,
    })
    expect(f.repository.listRecoveryCandidates).toHaveBeenCalledWith({
      createdBefore: new Date('2026-07-15T11:55:00.000Z'),
      abandonedStaleBefore: new Date('2026-07-15T11:45:00.000Z'),
      processingStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
      limit: 5,
    })
    expect(f.ingestion.completeUploadIntent).toHaveBeenCalledWith({
      ownerUserId: 'owner_01',
      uploadIntentId,
    })
    expect(f.repository.markRecoveryAttempted).toHaveBeenCalledWith({
      uploadIntentId,
      attemptedAt: now,
    })
    expect(f.repository.markAltTextSuggestionAttempted).toHaveBeenCalledWith({
      mediaAssetId,
      attemptedAt: now,
    })
    expect(f.altText.generateSuggestion).toHaveBeenCalledTimes(1)
  })

  it('purges only expired Upload Intents without a Media Asset', async () => {
    const f = fixture()
    f.repository.listRecoveryCandidates.mockResolvedValueOnce([
      {
        ownerUserId: 'owner_01',
        uploadIntentId,
        mediaAssetId: null,
        originalKey: `originals/${uploadIntentId}.jpg`,
        byteSize: MAX_ORIGINAL_UPLOAD_CHUNK_BYTES * 2 + 1,
        expiresAt: new Date('2026-07-15T11:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T10:00:00.000Z'),
      },
    ])

    await expect(f.service.run()).resolves.toMatchObject({ cleaned: 1 })
    expect(f.storage.deleteOriginal).toHaveBeenCalledWith(
      `originals/${uploadIntentId}.jpg`,
    )
    expect(f.storage.deleteOriginalChunk.mock.calls).toEqual([
      [`originals/${uploadIntentId}.jpg`, 0],
      [`originals/${uploadIntentId}.jpg`, 1],
      [`originals/${uploadIntentId}.jpg`, 2],
    ])
    expect(f.repository.deleteAbandonedUploadIntent).toHaveBeenCalledWith({
      uploadIntentId,
      expiredBefore: now,
      cleanupClaimedAt: now,
    })
    expect(f.repository.claimAbandonedUploadIntent).toHaveBeenCalledWith({
      uploadIntentId,
      expectedLastActiveAt: new Date('2026-07-15T10:00:00.000Z'),
      expiredBefore: now,
      claimedAt: now,
    })
    expect(f.repository.markRecoveryAttempted).not.toHaveBeenCalled()
    expect(f.ingestion.completeUploadIntent).not.toHaveBeenCalled()
  })

  it('does not delete chunks when upload activity wins the cleanup claim', async () => {
    const f = fixture()
    f.repository.claimAbandonedUploadIntent.mockResolvedValueOnce(false)
    f.repository.listRecoveryCandidates.mockResolvedValueOnce([
      {
        ownerUserId: 'owner_01',
        uploadIntentId,
        mediaAssetId: null,
        originalKey: `originals/${uploadIntentId}.jpg`,
        byteSize: 1000,
        expiresAt: new Date('2026-07-15T11:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T10:00:00.000Z'),
      },
    ])

    await expect(f.service.run()).resolves.toMatchObject({ cleaned: 0 })
    expect(f.storage.deleteOriginal).not.toHaveBeenCalled()
    expect(f.storage.deleteOriginalChunk).not.toHaveBeenCalled()
    expect(f.repository.deleteAbandonedUploadIntent).not.toHaveBeenCalled()
  })

  it('lets the owner resume one recoverable Media Asset without AI coupling', async () => {
    const f = fixture()
    f.altText.generateSuggestion.mockRejectedValueOnce(new Error('AI offline'))

    await expect(
      f.service.resumeMediaAsset({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({ id: mediaAssetId, processingState: 'ready' })
    expect(f.repository.findOwnedRecoverableAsset).toHaveBeenCalledWith({
      ownerUserId: 'owner_01',
      mediaAssetId,
    })

    f.repository.findOwnedRecoverableAsset.mockResolvedValueOnce(null)
    await expect(
      f.service.resumeMediaAsset({ ownerUserId: 'owner_01', mediaAssetId }),
    ).rejects.toEqual(new MediaReconciliationError('not_found'))
  })

  it('preserves completed recovery counters when the Alt Text query fails', async () => {
    const f = fixture()
    f.repository.listRecoveryCandidates.mockResolvedValueOnce([
      {
        ownerUserId: 'owner_01',
        uploadIntentId,
        mediaAssetId,
        originalKey: `originals/${uploadIntentId}.jpg`,
        byteSize: 1000,
        expiresAt: new Date('2026-07-16T00:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T10:00:00.000Z'),
      },
    ])
    f.repository.listReadyWithoutAltTextSuggestion.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )

    await expect(f.service.run()).resolves.toEqual({
      resumed: 1,
      cleaned: 0,
      suggested: 1,
      failed: 1,
    })
  })
})

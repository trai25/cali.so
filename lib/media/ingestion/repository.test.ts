import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaIngestionRepository,
  type MediaIngestionDatabase,
} from './repository'
const intentInput = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerUserId: 'owner_01',
  idempotencyKey: 'upload_01',
  originalKey: 'originals/11111111-1111-4111-8111-111111111111.jpg',
  contentType: 'image/jpeg' as const,
  byteSize: 2_660_052,
  checksumSha256:
    '1825bebd811ee2ff341932b96967bd13a0102e1aec90a699af981eaec8991c51',
  expiresAt: new Date('2026-07-16T00:00:00.000Z'),
  createdAt: new Date('2026-07-15T00:00:00.000Z'),
}

describe('Media Library ingestion repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0006_photo_selection.sql',
    '0007_photo_publication_revision.sql',
    '0009_media_catalog_state.sql',
    '0012_high_fidelity_photo_renditions.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaIngestionRepository>

  beforeEach(() => {
    client = getClient()
    const database = drizzle(client)
    repository = createMediaIngestionRepository(
      () => database as unknown as MediaIngestionDatabase,
    )
  })

  it('returns the first Upload Intent for an idempotency replay', async () => {
    const first = await repository.createUploadIntent(intentInput)
    const replay = await repository.createUploadIntent({
      ...intentInput,
      id: '22222222-2222-4222-8222-222222222222',
      originalKey: 'originals/22222222-2222-4222-8222-222222222222.jpg',
    })

    expect(replay).toEqual(first)
    const stored = await client.query('select id from media_upload_intents')
    expect(stored.rows).toHaveLength(1)
  })

  it('atomically completes a late Upload Intent and claims one processor', async () => {
    const intent = await repository.createUploadIntent(intentInput)
    const completedAt = new Date('2026-07-17T00:00:00.000Z')
    const asset = await repository.createVerifiedMediaAsset({
      uploadIntent: intent,
      completedAt,
    })

    const claims = await Promise.all([
      repository.claimProcessing({
        mediaAssetId: asset.id,
        claimedAt: completedAt,
        staleBefore: new Date('2026-07-16T23:55:00.000Z'),
      }),
      repository.claimProcessing({
        mediaAssetId: asset.id,
        claimedAt: completedAt,
        staleBefore: new Date('2026-07-16T23:55:00.000Z'),
      }),
    ])

    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(
      await repository.findUploadIntent(intent.ownerUserId, intent.id),
    ).toMatchObject({ completedAt })
    expect(await repository.findMediaAsset(intent.id)).toMatchObject({
      id: asset.id,
      processingState: 'processing',
      originalKey: intent.originalKey,
    })
  })

  it('requires the complete Rendition manifest before storing ready metadata', async () => {
    const intent = await repository.createUploadIntent(intentInput)
    const now = new Date('2026-07-15T01:00:00.000Z')
    const asset = await repository.createVerifiedMediaAsset({
      uploadIntent: intent,
      completedAt: now,
    })
    await repository.claimProcessing({
      mediaAssetId: asset.id,
      claimedAt: now,
      staleBefore: new Date('2026-07-15T00:55:00.000Z'),
    })

    const rendition = (profileWidth: 640 | 1024 | 1600 | 2560) => ({
      mediaAssetId: asset.id,
      profileWidth,
      objectKey: `renditions/${asset.id}/${profileWidth}-${String(profileWidth).padStart(64, '0')}.jpg`,
      checksumSha256: String(profileWidth).padStart(64, '0'),
      byteSize: profileWidth,
      width: profileWidth,
      height: Math.round(profileWidth * 0.75),
      contentType: 'image/jpeg' as const,
      colorSpace: 'srgb' as const,
      progressive: true as const,
      metadataStripped: true as const,
    })
    await repository.recordRendition(rendition(640))

    const readyInput = {
      mediaAssetId: asset.id,
      metadata: {
        width: 4032,
        height: 3024,
        capturedAt: new Date('2025-05-08T07:31:34.000Z'),
        cameraMake: 'Apple',
        cameraModel: 'iPhone',
        lens: 'Main Camera',
        focalLengthMillimeters: 6.8,
        aperture: 1.78,
        shutterSpeedSeconds: 0.008,
        iso: 80,
        captureLocationEnvelope: {
          version: 1,
          ciphertext: 'encrypted-location',
        },
      },
      completedAt: now,
      requiredRenditionCount: 4,
    }
    await expect(repository.markReady(readyInput)).rejects.toThrow(
      'Rendition manifest is incomplete',
    )

    await repository.recordRendition(rendition(1024))
    await repository.recordRendition(rendition(1600))
    await repository.recordRendition(rendition(2560))
    const ready = await repository.markReady(readyInput)

    const staleFailure = await repository.markFailure({
      mediaAssetId: asset.id,
      processingState: 'retryable_failure',
      processingErrorCode: 'stale_worker_failure',
      failedAt: new Date('2026-07-15T01:01:00.000Z'),
    })

    expect(ready).toMatchObject({
      processingState: 'ready',
      width: 4032,
      height: 3024,
      captureLocationEnvelope: {
        version: 1,
        ciphertext: 'encrypted-location',
      },
    })
    expect(staleFailure).toMatchObject({
      processingState: 'ready',
      processingErrorCode: null,
    })
    expect(JSON.stringify(ready)).not.toContain('37.7749')
  })
})

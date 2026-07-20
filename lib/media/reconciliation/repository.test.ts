import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaReconciliationRepository,
  type MediaReconciliationDatabase,
} from './repository'
const abandonedIntentId = '11111111-1111-4111-8111-111111111111'
const retryIntentId = '22222222-2222-4222-8222-222222222222'
const retryAssetId = '33333333-3333-4333-8333-333333333333'
const readyIntentId = '44444444-4444-4444-8444-444444444444'
const readyAssetId = '55555555-5555-4555-8555-555555555555'
const laterReadyIntentId = '66666666-6666-4666-8666-666666666666'
const laterReadyAssetId = '77777777-7777-4777-8777-777777777777'
const checksum = 'a'.repeat(64)

describe('Media reconciliation repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0009_media_catalog_state.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaReconciliationRepository>

  beforeEach(async () => {
    client = getClient()
    const database = drizzle(client)
    repository = createMediaReconciliationRepository(
      () => database as unknown as MediaReconciliationDatabase,
    )
    for (const [id, key, expiresAt, completedAt, updatedAt] of [
      [
        abandonedIntentId,
        'abandoned',
        '2026-07-15T10:00:00.000Z',
        null,
        '2026-07-15T08:00:00.000Z',
      ],
      [
        retryIntentId,
        'retry',
        '2026-07-16T10:00:00.000Z',
        '2026-07-15T09:00:00.000Z',
        '2026-07-15T08:01:00.000Z',
      ],
      [
        readyIntentId,
        'ready',
        '2026-07-16T10:00:00.000Z',
        '2026-07-15T09:00:00.000Z',
        '2026-07-15T08:02:00.000Z',
      ],
      [
        laterReadyIntentId,
        'later-ready',
        '2026-07-16T10:00:00.000Z',
        '2026-07-15T09:00:00.000Z',
        '2026-07-15T08:03:00.000Z',
      ],
    ] as const) {
      await client.query(
        `INSERT INTO media_upload_intents
          (id, owner_user_id, idempotency_key, original_key, content_type,
           byte_size, checksum_sha256, expires_at, completed_at, created_at,
           updated_at)
         VALUES ($1, 'owner_01', $2, $3, 'image/jpeg', 1000, $4, $5, $6,
                 '2026-07-15T08:00:00.000Z', $7)`,
        [
          id,
          `upload_${key}`,
          `originals/${key}.jpg`,
          checksum,
          expiresAt,
          completedAt,
          updatedAt,
        ],
      )
    }
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, processing_state, processing_error_code,
         original_key, original_content_type, original_byte_size,
         original_checksum_sha256, updated_at)
       VALUES
        ($1, $2, 'retryable_failure', 'dependency_unavailable',
         'originals/retry.jpg', 'image/jpeg', 1000, $7,
         '2026-07-15T08:01:00.000Z'),
        ($3, $4, 'ready', NULL,
         'originals/ready.jpg', 'image/jpeg', 1000, $7,
         '2026-07-15T08:02:00.000Z'),
        ($5, $6, 'ready', NULL,
         'originals/later-ready.jpg', 'image/jpeg', 1000, $7,
         '2026-07-15T08:03:00.000Z')`,
      [
        retryAssetId,
        retryIntentId,
        readyAssetId,
        readyIntentId,
        laterReadyAssetId,
        laterReadyIntentId,
        checksum,
      ],
    )
  })

  it('finds recoverable work, scopes owner resume, and deletes only abandoned intents', async () => {
    await expect(
      repository.listRecoveryCandidates({
        createdBefore: new Date('2026-07-15T11:55:00.000Z'),
        abandonedStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
        processingStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
        limit: 5,
      }),
    ).resolves.toEqual([
      {
        ownerUserId: 'owner_01',
        uploadIntentId: abandonedIntentId,
        mediaAssetId: null,
        originalKey: 'originals/abandoned.jpg',
        byteSize: 1000,
        expiresAt: new Date('2026-07-15T10:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T08:00:00.000Z'),
      },
      {
        ownerUserId: 'owner_01',
        uploadIntentId: retryIntentId,
        mediaAssetId: retryAssetId,
        originalKey: 'originals/retry.jpg',
        byteSize: 1000,
        expiresAt: new Date('2026-07-16T10:00:00.000Z'),
        lastActiveAt: new Date('2026-07-15T08:01:00.000Z'),
      },
    ])
    await expect(
      repository.findOwnedRecoverableAsset({
        ownerUserId: 'owner_01',
        mediaAssetId: retryAssetId,
      }),
    ).resolves.toEqual({ uploadIntentId: retryIntentId })
    await expect(
      repository.findOwnedRecoverableAsset({
        ownerUserId: 'other_owner',
        mediaAssetId: retryAssetId,
      }),
    ).resolves.toBeNull()
    const cleanupClaimedAt = new Date('2026-07-15T12:00:00.000Z')
    await expect(
      repository.claimAbandonedUploadIntent({
        uploadIntentId: abandonedIntentId,
        expectedLastActiveAt: new Date('2026-07-15T08:00:00.000Z'),
        expiredBefore: cleanupClaimedAt,
        claimedAt: cleanupClaimedAt,
      }),
    ).resolves.toBe(true)
    await expect(
      repository.deleteAbandonedUploadIntent({
        uploadIntentId: abandonedIntentId,
        expiredBefore: cleanupClaimedAt,
        cleanupClaimedAt,
      }),
    ).resolves.toBe(true)
    await expect(
      repository.deleteAbandonedUploadIntent({
        uploadIntentId: retryIntentId,
        expiredBefore: new Date('2026-07-17T12:00:00.000Z'),
        cleanupClaimedAt,
      }),
    ).resolves.toBe(false)
  })

  it('finds ready active assets whose automatic Alt Text Suggestion is missing', async () => {
    await expect(
      repository.listReadyWithoutAltTextSuggestion(5),
    ).resolves.toEqual([
      { ownerUserId: 'owner_01', mediaAssetId: readyAssetId },
      { ownerUserId: 'owner_01', mediaAssetId: laterReadyAssetId },
    ])
  })

  it('cannot claim cleanup after newer upload activity', async () => {
    const listed = await repository.listRecoveryCandidates({
      createdBefore: new Date('2026-07-15T11:55:00.000Z'),
      abandonedStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
      processingStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
      limit: 5,
    })
    const abandoned = listed.find(
      (candidate) => candidate.uploadIntentId === abandonedIntentId,
    )!
    await repository.markRecoveryAttempted({
      uploadIntentId: abandonedIntentId,
      attemptedAt: new Date('2026-07-15T11:59:00.000Z'),
    })

    await expect(
      repository.claimAbandonedUploadIntent({
        uploadIntentId: abandonedIntentId,
        expectedLastActiveAt: abandoned.lastActiveAt,
        expiredBefore: new Date('2026-07-15T12:00:00.000Z'),
        claimedAt: new Date('2026-07-15T12:00:00.000Z'),
      }),
    ).resolves.toBe(false)
  })

  it('rotates attempted recovery and Alt Text work behind untouched candidates', async () => {
    const recoveryQuery = {
      createdBefore: new Date('2026-07-15T11:55:00.000Z'),
      abandonedStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
      processingStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
      limit: 1,
    }
    await expect(
      repository.listRecoveryCandidates(recoveryQuery),
    ).resolves.toMatchObject([{ uploadIntentId: abandonedIntentId }])
    await repository.markRecoveryAttempted({
      uploadIntentId: abandonedIntentId,
      attemptedAt: new Date('2026-07-15T12:00:00.000Z'),
    })
    await expect(
      repository.listRecoveryCandidates(recoveryQuery),
    ).resolves.toMatchObject([{ uploadIntentId: retryIntentId }])

    await expect(
      repository.listReadyWithoutAltTextSuggestion(1),
    ).resolves.toEqual([
      { ownerUserId: 'owner_01', mediaAssetId: readyAssetId },
    ])
    await repository.markAltTextSuggestionAttempted({
      mediaAssetId: readyAssetId,
      attemptedAt: new Date('2026-07-15T12:00:00.000Z'),
    })
    await expect(
      repository.listReadyWithoutAltTextSuggestion(1),
    ).resolves.toEqual([
      { ownerUserId: 'owner_01', mediaAssetId: laterReadyAssetId },
    ])
  })

  it.each(['archived', 'purging'] as const)(
    'does not recover %s assets',
    async (catalogState) => {
      await client.query(
        `UPDATE media_assets
         SET catalog_state = $1, archived_at = $2, purge_started_at = $3
         WHERE id = $4`,
        [
          catalogState,
          '2026-07-15T11:00:00.000Z',
          catalogState === 'purging' ? '2026-07-15T11:30:00.000Z' : null,
          retryAssetId,
        ],
      )

      const candidates = await repository.listRecoveryCandidates({
        createdBefore: new Date('2026-07-15T11:55:00.000Z'),
        abandonedStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
        processingStaleBefore: new Date('2026-07-15T11:55:00.000Z'),
        limit: 5,
      })

      expect(candidates.map(({ uploadIntentId }) => uploadIntentId)).toEqual([
        abandonedIntentId,
      ])
      await expect(
        repository.findOwnedRecoverableAsset({
          ownerUserId: 'owner_01',
          mediaAssetId: retryAssetId,
        }),
      ).resolves.toBeNull()
    },
  )
})

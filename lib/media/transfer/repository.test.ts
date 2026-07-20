import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaTransferRepository,
  type MediaTransferDatabase,
} from './repository'

const bareIntentId = '11111111-1111-4111-8111-111111111111'
const failedIntentId = '22222222-2222-4222-8222-222222222222'
const readyIntentId = '33333333-3333-4333-8333-333333333333'
const failedAssetId = '44444444-4444-4444-8444-444444444444'
const readyAssetId = '55555555-5555-4555-8555-555555555555'
const processingIntentId = '77777777-7777-4777-8777-777777777777'
const processingAssetId = '88888888-8888-4888-8888-888888888888'

describe('Media Transfer repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0006_photo_selection.sql',
    '0007_photo_publication_revision.sql',
    '0008_media_purge_progress.sql',
    '0009_media_catalog_state.sql',
    '0013_brief_yellowjacket.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaTransferRepository>

  beforeEach(async () => {
    client = getClient()
    for (const [id, owner, key, completedAt] of [
      [bareIntentId, 'owner_01', 'bare', null],
      [failedIntentId, 'owner_01', 'failed', '2026-07-20T08:01:00Z'],
      [readyIntentId, 'owner_01', 'ready', '2026-07-20T08:02:00Z'],
      [
        processingIntentId,
        'owner_01',
        'processing',
        '2026-07-20T08:03:00Z',
      ],
      ['66666666-6666-4666-8666-666666666666', 'owner_02', 'other', null],
    ] as const) {
      await client.query(
        `INSERT INTO media_upload_intents
          (id, owner_user_id, idempotency_key, original_key, content_type,
           byte_size, checksum_sha256, expires_at, completed_at, created_at,
           updated_at)
         VALUES ($1, $2, $3, $4, 'image/jpeg', 1000, $5,
                 '2026-07-20T08:15:00Z', $6::timestamptz,
                 '2026-07-20T08:00:00Z',
                 COALESCE($6::timestamptz, '2026-07-20T08:00:00Z'))`,
        [id, owner, key, `originals/${key}.jpg`, 'a'.repeat(64), completedAt],
      )
    }
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, processing_state, processing_error_code,
         original_key, original_content_type, original_byte_size,
         original_checksum_sha256, created_at, updated_at)
       VALUES
        ($1, $2, 'retryable_failure', 'dependency_unavailable',
         'originals/failed.jpg', 'image/jpeg', 1000, $5,
         '2026-07-20T08:01:00Z', '2026-07-20T08:01:00Z'),
        ($3, $4, 'ready', NULL, 'originals/ready.jpg', 'image/jpeg', 1000,
         $6, '2026-07-20T08:02:00Z', '2026-07-20T08:02:00Z'),
        ($7, $8, 'processing', NULL, 'originals/processing.jpg', 'image/jpeg',
         1000, $9, '2026-07-20T08:03:00Z', '2026-07-20T08:03:00Z')`,
      [
        failedAssetId,
        failedIntentId,
        readyAssetId,
        readyIntentId,
        'f'.repeat(64),
        'c'.repeat(64),
        processingAssetId,
        processingIntentId,
        'd'.repeat(64),
      ],
    )
    const database = drizzle(client) as unknown as MediaTransferDatabase
    repository = createMediaTransferRepository(() => database)
  })

  it('lists incomplete owner jobs without ready or historical records', async () => {
    await expect(repository.listOwnedTransferJobs('owner_01')).resolves.toEqual([
      expect.objectContaining({
        uploadIntentId: processingIntentId,
        mediaAssetId: processingAssetId,
        stage: 'processing',
      }),
      expect.objectContaining({
        uploadIntentId: failedIntentId,
        mediaAssetId: failedAssetId,
        stage: 'failed',
        processingErrorCode: 'dependency_unavailable',
      }),
      expect.objectContaining({
        uploadIntentId: bareIntentId,
        mediaAssetId: null,
        stage: 'awaiting_file',
      }),
    ])
  })

  it('claims a bare intent for Discard before removing its row', async () => {
    const discardedAt = new Date('2026-07-20T08:05:00.000Z')

    await expect(
      repository.prepareDiscard({
        ownerUserId: 'owner_01',
        uploadIntentId: bareIntentId,
        discardedAt,
      }),
    ).resolves.toEqual({
      status: 'bare_intent',
      originalKey: 'originals/bare.jpg',
      byteSize: 1000,
    })
    const stored = await client.query<{ discard_started_at: Date }>(
      'SELECT discard_started_at FROM media_upload_intents WHERE id = $1',
      [bareIntentId],
    )
    expect(stored.rows[0]?.discard_started_at).toEqual(discardedAt)
    await expect(
      repository.deleteBareIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: bareIntentId,
      }),
    ).resolves.toBe(true)
  })

  it('archives only a failed owned asset before resumable Purge', async () => {
    await expect(
      repository.prepareDiscard({
        ownerUserId: 'owner_01',
        uploadIntentId: failedIntentId,
        discardedAt: new Date('2026-07-20T08:05:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'asset', mediaAssetId: failedAssetId })
    const failed = await client.query<{ catalog_state: string }>(
      'SELECT catalog_state FROM media_assets WHERE id = $1',
      [failedAssetId],
    )
    expect(failed.rows[0]?.catalog_state).toBe('archived')

    await expect(
      repository.prepareDiscard({
        ownerUserId: 'owner_01',
        uploadIntentId: readyIntentId,
        discardedAt: new Date('2026-07-20T08:05:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'invalid_state' })
  })

  it('cancels an in-flight processing asset before resumable Purge', async () => {
    await expect(
      repository.prepareDiscard({
        ownerUserId: 'owner_01',
        uploadIntentId: processingIntentId,
        discardedAt: new Date('2026-07-20T08:05:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'asset', mediaAssetId: processingAssetId })

    const processing = await client.query<{ catalog_state: string }>(
      'SELECT catalog_state FROM media_assets WHERE id = $1',
      [processingAssetId],
    )
    expect(processing.rows[0]?.catalog_state).toBe('archived')
    await expect(repository.listOwnedTransferJobs('owner_01')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uploadIntentId: processingIntentId,
          mediaAssetId: processingAssetId,
          stage: 'discarding',
        }),
      ]),
    )
  })
})

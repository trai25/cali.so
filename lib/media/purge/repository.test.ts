import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaPurgeRepository,
  type MediaPurgeDatabase,
} from './repository'

const migrations = [
  new URL('../../../db/migrations/0005_media_catalog.sql', import.meta.url),
  new URL('../../../db/migrations/0006_photo_selection.sql', import.meta.url),
  new URL(
    '../../../db/migrations/0007_photo_publication_revision.sql',
    import.meta.url,
  ),
  new URL('../../../db/migrations/0008_media_purge_progress.sql', import.meta.url),
  new URL(
    '../../../db/migrations/0009_media_catalog_state.sql',
    import.meta.url,
  ),
]
const assetId = '11111111-1111-4111-8111-111111111111'
const intentId = '22222222-2222-4222-8222-222222222222'
const firstClaimToken = '33333333-3333-4333-8333-333333333333'
const secondClaimToken = '44444444-4444-4444-8444-444444444444'

describe('Media Asset Purge repository', () => {
  let client: PGlite
  let repository: ReturnType<typeof createMediaPurgeRepository>

  beforeEach(async () => {
    client = new PGlite()
    for (const migrationUrl of migrations) {
      const migration = await readFile(migrationUrl, 'utf8')
      await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    await client.query(
      `INSERT INTO media_upload_intents
        (id, owner_user_id, idempotency_key, original_key, content_type,
         byte_size, checksum_sha256, expires_at, created_at)
       VALUES ($1, 'owner_01', 'upload_01', 'originals/photo.jpg',
               'image/jpeg', 1000, $2, '2026-07-16T00:00:00Z', '2026-07-15T00:00:00Z')`,
      [intentId, 'a'.repeat(64)],
    )
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, catalog_state, archived_at, processing_state,
         original_key, original_content_type, original_byte_size,
         original_checksum_sha256, width, height)
       VALUES ($1, $2, 'archived', '2026-07-15T10:00:00Z', 'ready',
               'originals/photo.jpg', 'image/jpeg', 1000, $3, 1600, 1200)`,
      [assetId, intentId, 'a'.repeat(64)],
    )
    for (const profile of [640, 1600]) {
      await client.query(
        `INSERT INTO media_renditions
          (media_asset_id, profile_width, object_key, checksum_sha256,
           byte_size, width, height)
         VALUES ($1, $2, $3, $4, 500, $2, $5)`,
        [
          assetId,
          profile,
          `renditions/photo-${profile}.jpg`,
          'b'.repeat(64),
          profile * 0.75,
        ],
      )
    }
    const database = drizzle(client) as unknown as MediaPurgeDatabase
    repository = createMediaPurgeRepository(() => database)
  })

  afterEach(async () => client.close())

  function claimInput(overrides: Record<string, unknown> = {}) {
    return {
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      claimToken: firstClaimToken,
      claimedAt: new Date('2026-07-15T12:00:00Z'),
      claimExpiresAt: new Date('2026-07-15T12:05:00Z'),
      ...overrides,
    }
  }

  it('claims an Archived asset and snapshots every storage key', async () => {
    await expect(repository.claim(claimInput())).resolves.toEqual({
      status: 'claimed',
      job: {
        mediaAssetId: assetId,
        originalKey: 'originals/photo.jpg',
        originalDeletedAt: null,
        renditions: [
          {
            objectKey: 'renditions/photo-1600.jpg',
            objectDeletedAt: null,
            cdnPurgedAt: null,
          },
          {
            objectKey: 'renditions/photo-640.jpg',
            objectDeletedAt: null,
            cdnPurgedAt: null,
          },
        ],
      },
    })
    await expect(
      repository.getStatus({ ownerUserId: 'owner_01', mediaAssetId: assetId }),
    ).resolves.toMatchObject({
      status: 'purging',
      renditionCount: 2,
      renditionObjectsDeleted: 0,
      renditionCdnPurged: 0,
      originalDeleted: false,
      lastErrorCode: null,
    })
    const asset = await client.query<{
      catalog_state: string
      purge_started_at: Date
    }>('SELECT catalog_state, purge_started_at FROM media_assets WHERE id = $1', [
      assetId,
    ])
    expect(asset.rows[0]).toMatchObject({ catalog_state: 'purging' })
  })

  it('enforces ownership, Archived state, selection safety, and claim leases', async () => {
    await expect(
      repository.claim(claimInput({ ownerUserId: 'owner_02' })),
    ).resolves.toEqual({ status: 'not_found' })

    await client.query(
      `UPDATE media_assets
       SET catalog_state = 'active', archived_at = NULL
       WHERE id = $1`,
      [assetId],
    )
    await expect(repository.claim(claimInput())).resolves.toEqual({
      status: 'invalid_state',
    })
    await client.query(
      `UPDATE media_assets
       SET catalog_state = 'archived', archived_at = '2026-07-15T10:00:00Z'
       WHERE id = $1`,
      [assetId],
    )

    await client.query(
      `INSERT INTO media_photo_selection_drafts (id, owner_user_id)
       VALUES ('55555555-5555-4555-8555-555555555555', 'owner_01')`,
    )
    await client.query(
      `INSERT INTO media_photo_selection_draft_entries
        (draft_id, media_asset_id, position)
       VALUES ('55555555-5555-4555-8555-555555555555', $1, 0)`,
      [assetId],
    )
    await expect(repository.claim(claimInput())).resolves.toEqual({
      status: 'selection_conflict',
    })
    await client.query('DELETE FROM media_photo_selection_draft_entries')

    await expect(repository.claim(claimInput())).resolves.toMatchObject({
      status: 'claimed',
    })
    await expect(
      repository.claim(
        claimInput({
          claimToken: secondClaimToken,
          claimedAt: new Date('2026-07-15T12:01:00Z'),
          claimExpiresAt: new Date('2026-07-15T12:06:00Z'),
        }),
      ),
    ).resolves.toEqual({ status: 'busy' })
    await expect(
      repository.claim(
        claimInput({
          claimToken: secondClaimToken,
          claimedAt: new Date('2026-07-15T12:06:00Z'),
          claimExpiresAt: new Date('2026-07-15T12:11:00Z'),
        }),
      ),
    ).resolves.toMatchObject({ status: 'claimed' })
  })

  it('keeps progress durable and removes the catalog record last', async () => {
    const claim = await repository.claim(claimInput())
    if (claim.status !== 'claimed') throw new Error('Expected Purge claim')
    const at = new Date('2026-07-15T12:01:00Z')
    await expect(
      repository.markOriginalDeleted({
        mediaAssetId: assetId,
        claimToken: firstClaimToken,
        deletedAt: at,
      }),
    ).resolves.toBe(false)
    for (const rendition of claim.job.renditions) {
      await expect(
        repository.markRenditionObjectDeleted({
          mediaAssetId: assetId,
          claimToken: firstClaimToken,
          objectKey: rendition.objectKey,
          deletedAt: at,
        }),
      ).resolves.toBe(true)
      await expect(
        repository.markRenditionCdnPurged({
          mediaAssetId: assetId,
          claimToken: firstClaimToken,
          objectKey: rendition.objectKey,
          purgedAt: at,
        }),
      ).resolves.toBe(true)
    }
    await expect(
      repository.complete({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        claimToken: firstClaimToken,
        completedAt: at,
      }),
    ).resolves.toBe(false)
    await expect(
      repository.markOriginalDeleted({
        mediaAssetId: assetId,
        claimToken: firstClaimToken,
        deletedAt: at,
      }),
    ).resolves.toBe(true)
    await expect(
      repository.complete({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        claimToken: firstClaimToken,
        completedAt: at,
      }),
    ).resolves.toBe(true)

    const assets = await client.query('SELECT id FROM media_assets WHERE id = $1', [
      assetId,
    ])
    const renditions = await client.query(
      'SELECT id FROM media_renditions WHERE media_asset_id = $1',
      [assetId],
    )
    const jobs = await client.query<{
      original_key: string | null
      completed_at: Date | null
    }>(
      'SELECT original_key, completed_at FROM media_asset_purge_jobs WHERE media_asset_id = $1',
      [assetId],
    )
    expect(assets.rows).toEqual([])
    expect(renditions.rows).toEqual([])
    expect(jobs.rows[0]).toMatchObject({ original_key: null })
    expect(jobs.rows[0]!.completed_at).toBeInstanceOf(Date)
    await expect(
      repository.getStatus({ ownerUserId: 'owner_01', mediaAssetId: assetId }),
    ).resolves.toMatchObject({
      status: 'completed',
      renditionCount: 0,
      originalDeleted: true,
    })
    await expect(repository.claim(claimInput())).resolves.toEqual({
      status: 'completed',
    })
  })
})

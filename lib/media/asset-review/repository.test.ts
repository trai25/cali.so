import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaAssetReviewRepository,
  type MediaAssetReviewDatabase,
} from './repository'
const assetId = '11111111-1111-4111-8111-111111111111'
const intentId = '22222222-2222-4222-8222-222222222222'

describe('Media Asset review repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0006_photo_selection.sql',
    '0007_photo_publication_revision.sql',
    '0009_media_catalog_state.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaAssetReviewRepository>

  beforeEach(async () => {
    client = getClient()
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
        (id, upload_intent_id, processing_state, original_key,
         original_content_type, original_byte_size, original_checksum_sha256,
         width, height, captured_at, camera_make, camera_model,
         focal_length_millimeters, aperture, shutter_speed_seconds, iso)
       VALUES ($1, $2, 'ready', 'originals/photo.jpg', 'image/jpeg',
               1000, $3, 4032, 3024, '2025-05-08T00:31:34Z', 'Google',
               'Pixel', 6.9, 1.7, 0.01, 80)`,
      [assetId, intentId, 'a'.repeat(64)],
    )
    await client.query(
      `INSERT INTO media_renditions
        (media_asset_id, profile_width, object_key, checksum_sha256,
         byte_size, width, height)
       VALUES ($1, 640, 'renditions/photo-640.jpg', $2, 800, 640, 480)`,
      [assetId, 'b'.repeat(64)],
    )
    const database = drizzle(client) as unknown as MediaAssetReviewDatabase
    repository = createMediaAssetReviewRepository(
      () => database,
      (key) => `https://media.example.com/${key}`,
    )
  })

  it('lists only owned catalogState views with public 640-pixel previews', async () => {
    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_02', view: 'active' }),
    ).resolves.toEqual([])
    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_01', view: 'active' }),
    ).resolves.toMatchObject([
      {
        id: assetId,
        catalogState: 'active',
        previewRendition: {
          src: 'https://media.example.com/renditions/photo-640.jpg',
          width: 640,
          height: 480,
        },
      },
    ])

    await client.query(
      `UPDATE media_assets SET catalog_state = 'archived', archived_at = now()
       WHERE id = $1`,
      [assetId],
    )
    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_01', view: 'active' }),
    ).resolves.toEqual([])
    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_01', view: 'archived' }),
    ).resolves.toHaveLength(1)
  })

  it('scopes review writes through the owning Upload Intent', async () => {
    const input = {
      mediaAssetId: assetId,
      locationLabelZhHans: '旧金山',
      locationLabelEn: 'San Francisco',
      focalPoint: { x: 0.4, y: 0.6 },
      updatedAt: new Date('2026-07-15T12:00:00Z'),
    }

    await expect(
      repository.updateDisplayMetadata({ ownerUserId: 'owner_02', ...input }),
    ).resolves.toBeNull()
    await expect(
      repository.updateDisplayMetadata({ ownerUserId: 'owner_01', ...input }),
    ).resolves.toMatchObject({
      locationLabelEn: 'San Francisco',
      focalPoint: { x: 0.4, y: 0.6 },
      capturedAt: new Date('2025-05-08T00:31:34Z'),
      cameraMake: 'Google',
      cameraModel: 'Pixel',
      focalLengthMillimeters: 6.9,
      aperture: 1.7,
      shutterSpeedSeconds: 0.01,
      iso: 80,
      previewRendition: {
        src: 'https://media.example.com/renditions/photo-640.jpg',
        width: 640,
        height: 480,
      },
    })
    const stored = await repository.findOwnedAsset({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
    })
    expect(JSON.stringify(stored)).not.toMatch(
      /captureLocationEnvelope|latitude|longitude|originalKey|originalChecksum/i,
    )
  })

  it('reports Capture Location availability without exposing coordinates', async () => {
    await expect(
      repository.findOwnedAsset({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
      }),
    ).resolves.toMatchObject({ hasCaptureLocation: false })

    await client.query(
      `UPDATE media_assets SET capture_location_envelope = $2 WHERE id = $1`,
      [assetId, JSON.stringify({ ciphertext: 'private-envelope' })],
    )

    const stored = await repository.findOwnedAsset({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
    })
    expect(stored).toMatchObject({ hasCaptureLocation: true })
    expect(JSON.stringify(stored)).not.toMatch(
      /private-envelope|latitude|longitude|captureLocationEnvelope/i,
    )
  })

  it('stores approved Alt Text separately from an existing Suggestion', async () => {
    await client.query(
      `UPDATE media_assets SET alt_text_suggestion_zh_hans = '建议',
       alt_text_suggestion_en = 'Suggestion', alt_text_suggestion_model = 'model',
       alt_text_suggested_at = now() WHERE id = $1`,
      [assetId],
    )

    const approved = await repository.approveAltText({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      zhHans: '已审核的描述',
      en: 'A reviewed description',
      approvedAt: new Date('2026-07-15T12:00:00Z'),
    })
    const stored = await client.query<{
      alt_text_suggestion_en: string
      alt_text_en: string
    }>('SELECT alt_text_suggestion_en, alt_text_en FROM media_assets WHERE id = $1', [
      assetId,
    ])

    expect(approved).toMatchObject({
      altTextSuggestion: {
        zhHans: '建议',
        en: 'Suggestion',
        model: 'model',
      },
      altTextEn: 'A reviewed description',
      previewRendition: {
        src: 'https://media.example.com/renditions/photo-640.jpg',
        width: 640,
        height: 480,
      },
    })
    expect(stored.rows[0]).toEqual({
      alt_text_suggestion_en: 'Suggestion',
      alt_text_en: 'A reviewed description',
    })
  })

  it('blocks Archive for Draft and active Published membership', async () => {
    await client.query(
      `INSERT INTO media_photo_selection_drafts (id, owner_user_id)
       VALUES ('33333333-3333-4333-8333-333333333333', 'owner_01')`,
    )
    await client.query(
      `INSERT INTO media_photo_selection_draft_entries
        (draft_id, media_asset_id, position)
       VALUES ('33333333-3333-4333-8333-333333333333', $1, 0)`,
      [assetId],
    )

    await expect(
      repository.archive({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        archivedAt: new Date('2026-07-15T12:00:00Z'),
      }),
    ).resolves.toEqual({ status: 'selection_conflict' })

    await client.query('DELETE FROM media_photo_selection_draft_entries')
    const publicationId = '44444444-4444-4444-8444-444444444444'
    await client.query(
      `INSERT INTO media_published_photo_selections
        (id, owner_user_id, idempotency_key, draft_revision, item_count,
         published_at)
       VALUES ($1, 'owner_01', 'publish_01', 1, 1, now())`,
      [publicationId],
    )
    await client.query(
      `INSERT INTO media_published_photo_selection_entries
        (published_selection_id, source_media_asset_id, position, width,
         height, alt_text_zh_hans, alt_text_en)
       VALUES ($1, $2, 0, 4032, 3024, '照片', 'A photo')`,
      [publicationId, assetId],
    )
    await client.query(
      `INSERT INTO media_active_photo_publication (published_selection_id)
       VALUES ($1)`,
      [publicationId],
    )

    await expect(
      repository.archive({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        archivedAt: new Date('2026-07-15T12:00:00Z'),
      }),
    ).resolves.toEqual({ status: 'selection_conflict' })
  })

  it('ignores Draft membership owned by a different owner', async () => {
    await client.query(
      `INSERT INTO media_photo_selection_drafts (id, owner_user_id)
       VALUES ('33333333-3333-4333-8333-333333333333', 'owner_02')`,
    )
    await client.query(
      `INSERT INTO media_photo_selection_draft_entries
        (draft_id, media_asset_id, position)
       VALUES ('33333333-3333-4333-8333-333333333333', $1, 0)`,
      [assetId],
    )

    await expect(
      repository.archive({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        archivedAt: new Date('2026-07-15T12:00:00Z'),
      }),
    ).resolves.toMatchObject({ status: 'updated' })
  })

  it('round-trips Archive and restore without clearing metadata', async () => {
    const archived = await repository.archive({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      archivedAt: new Date('2026-07-15T12:00:00Z'),
    })
    const restored = await repository.restore({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      restoredAt: new Date('2026-07-15T13:00:00Z'),
    })

    expect(archived).toMatchObject({
      status: 'updated',
      asset: {
        catalogState: 'archived',
        previewRendition: {
          src: 'https://media.example.com/renditions/photo-640.jpg',
        },
      },
    })
    expect(restored).toMatchObject({
      status: 'updated',
      asset: {
        catalogState: 'active',
        archivedAt: null,
        previewRendition: {
          src: 'https://media.example.com/renditions/photo-640.jpg',
        },
      },
    })
  })
})

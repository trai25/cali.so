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
    '0013_brief_yellowjacket.sql',
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
    const incompleteIntentId = '77777777-7777-4777-8777-777777777777'
    const incompleteAssetId = '88888888-8888-4888-8888-888888888888'
    await client.query(
      `INSERT INTO media_upload_intents
        (id, owner_user_id, idempotency_key, original_key, content_type,
         byte_size, checksum_sha256, expires_at, completed_at, created_at)
       VALUES ($1, 'owner_01', 'incomplete', 'originals/incomplete.jpg',
               'image/jpeg', 1000, $2, '2026-07-16T00:00:00Z',
               '2026-07-15T01:00:00Z', '2026-07-15T00:00:00Z')`,
      [incompleteIntentId, 'd'.repeat(64)],
    )
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, processing_state, processing_error_code,
         original_key, original_content_type, original_byte_size,
         original_checksum_sha256)
       VALUES ($1, $2, 'retryable_failure', 'dependency_unavailable',
               'originals/incomplete.jpg', 'image/jpeg', 1000, $3)`,
      [incompleteAssetId, incompleteIntentId, 'd'.repeat(64)],
    )

    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_02', view: 'active' }),
    ).resolves.toEqual([])
    await expect(
      repository.listOwnedAssets({ ownerUserId: 'owner_01', view: 'active' }),
    ).resolves.toEqual([
      {
        id: assetId,
        createdAt: expect.any(Date),
        catalogState: 'active',
        processingState: 'ready',
        width: 4032,
        height: 3024,
        capturedAt: new Date('2025-05-08T00:31:34.000Z'),
        cameraMake: 'Google',
        cameraModel: 'Pixel',
        lens: null,
        focalLengthMillimeters: 6.9,
        aperture: 1.7,
        shutterSpeedSeconds: 0.01,
        iso: 80,
        hasCaptureLocation: false,
        locationLabelZhHans: null,
        locationLabelEn: null,
        focalPoint: null,
        altTextSuggestion: null,
        altTextZhHans: null,
        altTextEn: null,
        altTextApprovedAt: null,
        archivedAt: null,
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

  it('withdraws Archive from Draft and Published selections and immediately undoes it', async () => {
    const otherAssetId = '55555555-5555-4555-8555-555555555555'
    const otherIntentId = '66666666-6666-4666-8666-666666666666'
    await client.query(
      `INSERT INTO media_upload_intents
        (id, owner_user_id, idempotency_key, original_key, content_type,
         byte_size, checksum_sha256, expires_at, created_at)
       VALUES ($1, 'owner_01', 'upload_02', 'originals/other.jpg',
               'image/jpeg', 1000, $2, '2026-07-16T00:00:00Z', '2026-07-15T00:00:00Z')`,
      [otherIntentId, 'c'.repeat(64)],
    )
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, processing_state, original_key,
         original_content_type, original_byte_size, original_checksum_sha256,
         width, height)
       VALUES ($1, $2, 'ready', 'originals/other.jpg', 'image/jpeg',
               1000, $3, 3024, 4032)`,
      [otherAssetId, otherIntentId, 'c'.repeat(64)],
    )
    await client.query(
      `INSERT INTO media_photo_selection_drafts (id, owner_user_id)
       VALUES ('33333333-3333-4333-8333-333333333333', 'owner_01')`,
    )
    await client.query(
      `INSERT INTO media_photo_selection_draft_entries
        (draft_id, media_asset_id, position)
       VALUES
        ('33333333-3333-4333-8333-333333333333', $1, 0),
        ('33333333-3333-4333-8333-333333333333', $2, 1)`,
      [assetId, otherAssetId],
    )
    const publicationId = '44444444-4444-4444-8444-444444444444'
    await client.query(
      `INSERT INTO media_published_photo_selections
        (id, owner_user_id, idempotency_key, draft_revision, item_count,
         published_at)
       VALUES ($1, 'owner_01', 'publish_01', 1, 2, now())`,
      [publicationId],
    )
    await client.query(
      `INSERT INTO media_published_photo_selection_entries
        (published_selection_id, source_media_asset_id, position, width,
         height, alt_text_zh_hans, alt_text_en)
       VALUES
        ($1, $2, 0, 4032, 3024, '照片', 'A photo'),
        ($1, $3, 1, 3024, 4032, '另一张照片', 'Another photo')`,
      [publicationId, assetId, otherAssetId],
    )
    await client.query(
      `INSERT INTO media_active_photo_publication (published_selection_id)
       VALUES ($1)`,
      [publicationId],
    )

    const archivedAt = new Date('2026-07-15T12:00:00Z')
    const archived = await repository.archive({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      archivedAt,
      undoExpiresAt: new Date('2026-07-15T12:00:10Z'),
    })

    expect(archived).toMatchObject({
      status: 'updated',
      asset: { catalogState: 'archived' },
      undoOperationId: expect.any(String),
      publicSelectionChanged: true,
    })
    const draftAfterArchive = await client.query<{
      media_asset_id: string
      position: number
      revision: number
    }>(
      `SELECT e.media_asset_id, e.position, d.revision
       FROM media_photo_selection_drafts d
       JOIN media_photo_selection_draft_entries e ON e.draft_id = d.id
       ORDER BY e.position`,
    )
    expect(draftAfterArchive.rows).toEqual([
      { media_asset_id: otherAssetId, position: 0, revision: 1 },
    ])
    const publicationAfterArchive = await client.query<{
      id: string
      publication_kind: string
      item_count: number
      source_media_asset_id: string
      position: number
    }>(
      `SELECT p.id, p.publication_kind, p.item_count,
              e.source_media_asset_id, e.position
       FROM media_active_photo_publication a
       JOIN media_published_photo_selections p ON p.id = a.published_selection_id
       JOIN media_published_photo_selection_entries e
         ON e.published_selection_id = p.id
       ORDER BY e.position`,
    )
    expect(publicationAfterArchive.rows[0]?.id).not.toBe(publicationId)
    expect(publicationAfterArchive.rows).toMatchObject([
      {
        publication_kind: 'withdrawal',
        item_count: 1,
        source_media_asset_id: otherAssetId,
        position: 0,
      },
    ])

    if (archived.status !== 'updated') throw new Error('Expected Archive update')
    if (!archived.undoOperationId) throw new Error('Expected Archive Undo')
    const withdrawalPublicationId = publicationAfterArchive.rows[0]!.id
    const newerPublicationId = '77777777-7777-4777-8777-777777777777'
    await client.query(
      `INSERT INTO media_published_photo_selections
        (id, owner_user_id, idempotency_key, publication_kind,
         draft_revision, item_count, published_at)
       VALUES ($1, 'owner_01', 'newer_withdrawal', 'withdrawal', NULL, 0,
               '2026-07-15T12:00:03Z')`,
      [newerPublicationId],
    )
    await client.query(
      `UPDATE media_active_photo_publication
       SET published_selection_id = $1 WHERE id = 1`,
      [newerPublicationId],
    )
    await expect(
      repository.undoArchive({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        operationId: archived.undoOperationId,
        undoneAt: new Date('2026-07-15T12:00:04Z'),
      }),
    ).resolves.toEqual({ status: 'revision_conflict' })
    const draftAfterConflict = await client.query<{
      media_asset_id: string
      position: number
      revision: number
    }>(
      `SELECT e.media_asset_id, e.position, d.revision
       FROM media_photo_selection_drafts d
       JOIN media_photo_selection_draft_entries e ON e.draft_id = d.id
       ORDER BY e.position`,
    )
    expect(draftAfterConflict.rows).toEqual([
      { media_asset_id: otherAssetId, position: 0, revision: 1 },
    ])
    await client.query(
      `UPDATE media_active_photo_publication
       SET published_selection_id = $1 WHERE id = 1`,
      [withdrawalPublicationId],
    )
    await expect(
      repository.undoArchive({
        ownerUserId: 'owner_01',
        mediaAssetId: assetId,
        operationId: archived.undoOperationId,
        undoneAt: new Date('2026-07-15T12:00:05Z'),
      }),
    ).resolves.toMatchObject({
      status: 'updated',
      asset: { catalogState: 'active' },
      publicSelectionChanged: true,
    })
    const draftAfterUndo = await client.query<{
      media_asset_id: string
      position: number
      revision: number
    }>(
      `SELECT e.media_asset_id, e.position, d.revision
       FROM media_photo_selection_drafts d
       JOIN media_photo_selection_draft_entries e ON e.draft_id = d.id
       ORDER BY e.position`,
    )
    expect(draftAfterUndo.rows).toEqual([
      { media_asset_id: assetId, position: 0, revision: 2 },
      { media_asset_id: otherAssetId, position: 1, revision: 2 },
    ])
    const activeAfterUndo = await client.query<{ published_selection_id: string }>(
      'SELECT published_selection_id FROM media_active_photo_publication WHERE id = 1',
    )
    expect(activeAfterUndo.rows[0]?.published_selection_id).toBe(publicationId)
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
        undoExpiresAt: new Date('2026-07-15T12:00:10Z'),
      }),
    ).resolves.toMatchObject({ status: 'updated' })
  })

  it('round-trips Archive and restore without clearing metadata', async () => {
    const archived = await repository.archive({
      ownerUserId: 'owner_01',
      mediaAssetId: assetId,
      archivedAt: new Date('2026-07-15T12:00:00Z'),
      undoExpiresAt: new Date('2026-07-15T12:00:10Z'),
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

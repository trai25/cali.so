import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPhotoSelectionRepository,
  createPublicPhotoSelectionRepository,
  getHomepagePhotoPreview,
  type PhotoSelectionDatabase,
} from './repository'

const migrationUrls = [
  new URL('../../../db/migrations/0005_media_catalog.sql', import.meta.url),
  new URL('../../../db/migrations/0006_photo_selection.sql', import.meta.url),
  new URL(
    '../../../db/migrations/0007_photo_publication_revision.sql',
    import.meta.url,
  ),
]
const checksum = 'a'.repeat(64)

describe('Photo Selection repository', () => {
  let client: PGlite
  let repository: ReturnType<typeof createPhotoSelectionRepository>
  let publicRepository: ReturnType<typeof createPublicPhotoSelectionRepository>

  beforeEach(async () => {
    client = new PGlite()
    for (const migrationUrl of migrationUrls) {
      const migration = await readFile(migrationUrl, 'utf8')
      await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    const database = drizzle(client) as unknown as PhotoSelectionDatabase
    repository = createPhotoSelectionRepository(() => database)
    publicRepository = createPublicPhotoSelectionRepository(
      () => database,
      new URL('https://media.example.com/photos/'),
    )
  })

  afterEach(async () => {
    await client.close()
  })

  async function createAsset(
    ownerUserId: string,
    overrides: {
      id?: string
      lifecycle?: 'active' | 'archived'
      processingState?: 'ready' | 'retryable_failure'
      altTextZhHans?: string | null
      altTextEn?: string | null
      renditionProfiles?: number[]
    } = {},
  ) {
    const id = overrides.id ?? crypto.randomUUID()
    const uploadIntentId = crypto.randomUUID()
    const lifecycle = overrides.lifecycle ?? 'active'
    const processingState = overrides.processingState ?? 'ready'
    const archivedAt = lifecycle === 'archived' ? '2026-07-15T01:00:00.000Z' : null
    const processingErrorCode =
      processingState === 'retryable_failure' ? 'processing_failed' : null
    const altTextZhHans =
      overrides.altTextZhHans === undefined ? '旧金山街道上的缆车' : overrides.altTextZhHans
    const altTextEn =
      overrides.altTextEn === undefined
        ? 'A cable car traveling along a San Francisco street'
        : overrides.altTextEn
    const approvedAt = altTextZhHans && altTextEn ? '2026-07-15T02:00:00.000Z' : null

    await client.query(
      `INSERT INTO media_upload_intents
        (id, owner_user_id, idempotency_key, original_key, content_type,
         byte_size, checksum_sha256, expires_at)
       VALUES ($1, $2, $3, $4, 'image/jpeg', 1000, $5,
               '2026-07-16T00:00:00.000Z')`,
      [
        uploadIntentId,
        ownerUserId,
        `upload_${uploadIntentId}`,
        `originals/${id}/photo.jpg`,
        checksum,
      ],
    )
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, lifecycle, processing_state,
         processing_error_code, original_key, original_content_type,
         original_byte_size, original_checksum_sha256, width, height,
         captured_at, camera_make, camera_model, lens,
         focal_length_millimeters, aperture, shutter_speed_seconds, iso,
         focal_point_x, focal_point_y, location_label_zh_hans,
         location_label_en, alt_text_zh_hans, alt_text_en,
         alt_text_approved_at, archived_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, 'image/jpeg', 1000, $7, 4032, 3024,
         '2025-05-08T07:31:34.000Z', 'Apple', 'iPhone 16 Pro',
         'Main Camera', 6.8, 1.78, 0.008, 80, 0.4, 0.6,
         '旧金山', 'San Francisco', $8, $9, $10, $11)`,
      [
        id,
        uploadIntentId,
        lifecycle,
        processingState,
        processingErrorCode,
        `originals/${id}/photo.jpg`,
        checksum,
        altTextZhHans,
        altTextEn,
        approvedAt,
        archivedAt,
      ],
    )
    for (const profileWidth of overrides.renditionProfiles ?? [640, 1024, 1600]) {
      await client.query(
        `INSERT INTO media_renditions
          (media_asset_id, profile_width, object_key, checksum_sha256,
           byte_size, width, height)
         VALUES ($1, $2, $3, $4, $2, $2, $5)`,
        [
          id,
          profileWidth,
          `renditions/${id}/${profileWidth}.jpg`,
          checksum,
          Math.round(profileWidth * 0.75),
        ],
      )
    }
    return id
  }

  it('starts each owner with an empty revision-zero Draft', async () => {
    await expect(repository.getDraft('owner_01')).resolves.toEqual({
      revision: 0,
      mediaAssetIds: [],
      updatedAt: null,
    })
  })

  it('atomically autosaves deterministic order and rejects a stale revision', async () => {
    const first = await createAsset('owner_01')
    const second = await createAsset('owner_01')
    const updatedAt = new Date('2026-07-15T08:00:00.000Z')

    await expect(
      repository.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [second, first],
        updatedAt,
      }),
    ).resolves.toEqual({
      status: 'saved',
      draft: { revision: 1, mediaAssetIds: [second, first], updatedAt },
    })
    await expect(
      repository.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [first],
        updatedAt: new Date('2026-07-15T09:00:00.000Z'),
      }),
    ).resolves.toEqual({ status: 'revision_conflict', currentRevision: 1 })
    await expect(repository.getDraft('owner_01')).resolves.toMatchObject({
      revision: 1,
      mediaAssetIds: [second, first],
    })
  })

  it('requires owned, active, ready Media Assets with Alt Text and all Renditions', async () => {
    const eligible = await createAsset('owner_01')
    const wrongOwner = await createAsset('owner_02')
    const archived = await createAsset('owner_01', { lifecycle: 'archived' })
    const failed = await createAsset('owner_01', {
      processingState: 'retryable_failure',
    })
    const missingAltText = await createAsset('owner_01', {
      altTextZhHans: null,
      altTextEn: null,
    })
    const missingRendition = await createAsset('owner_01', {
      renditionProfiles: [640, 1024],
    })

    await expect(
      repository.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [
          eligible,
          wrongOwner,
          archived,
          failed,
          missingAltText,
          missingRendition,
        ],
        updatedAt: new Date('2026-07-15T08:00:00.000Z'),
      }),
    ).resolves.toEqual({
      status: 'ineligible_assets',
      ineligibleMediaAssetIds: [
        wrongOwner,
        archived,
        failed,
        missingAltText,
        missingRendition,
      ],
    })
  })

  it('publishes an immutable snapshot and reads one public-only projection', async () => {
    const first = await createAsset('owner_01')
    const second = await createAsset('owner_01')
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [second, first],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })

    const published = await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })
    const projection = await publicRepository.getPublishedSelection()

    expect(published).toMatchObject({
      status: 'published',
      replayed: false,
      draftRevision: 1,
      itemCount: 2,
    })
    expect(projection).toMatchObject({
      revision: published.status === 'published' ? published.publishedSelectionId : '',
      count: 2,
      items: [
        {
          width: 4032,
          height: 3024,
          altText: {
            zhHans: '旧金山街道上的缆车',
            en: 'A cable car traveling along a San Francisco street',
          },
          locationLabel: { zhHans: '旧金山', en: 'San Francisco' },
          focalPoint: { x: 0.4, y: 0.6 },
          camera: {
            make: 'Apple',
            model: 'iPhone 16 Pro',
            lens: 'Main Camera',
            focalLengthMillimeters: 6.8,
            aperture: 1.78,
            shutterSpeedSeconds: 0.008,
            iso: 80,
          },
          renditions: [
            {
              profileWidth: 640,
              src: `https://media.example.com/photos/renditions/${second}/640.jpg`,
              width: 640,
              height: 480,
            },
            expect.objectContaining({ profileWidth: 1024 }),
            expect.objectContaining({ profileWidth: 1600 }),
          ],
        },
        expect.objectContaining({ width: 4032, height: 3024 }),
      ],
    })

    const serialized = JSON.stringify(projection)
    for (const privateField of [
      'captureLocation',
      'originalKey',
      'checksum',
      'suggestion',
      'processingState',
      'ownerUserId',
      'idempotencyKey',
    ]) {
      expect(serialized).not.toContain(privateField)
    }
  })

  it('derives homepage previews from the first three items of the same revision', async () => {
    const assets = await Promise.all([
      createAsset('owner_01'),
      createAsset('owner_01'),
      createAsset('owner_01'),
      createAsset('owner_01'),
    ])
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: assets,
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })
    const selection = await publicRepository.getPublishedSelection()

    const preview = getHomepagePhotoPreview(selection)

    expect(preview).toMatchObject({
      revision: selection?.revision,
      count: 4,
    })
    expect(preview?.items).toEqual(selection?.items.slice(0, 3))
  })

  it('can publish an intentionally empty Photo Selection', async () => {
    const published = await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 0,
      idempotencyKey: 'publish_empty',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })

    expect(published).toMatchObject({
      status: 'published',
      itemCount: 0,
    })
    await expect(publicRepository.getPublishedSelection()).resolves.toMatchObject({
      count: 0,
      items: [],
    })
  })

  it('keeps public output unchanged when a Media Asset changes after publication', async () => {
    const asset = await createAsset('owner_01')
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [asset],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })
    const before = await publicRepository.getPublishedSelection()

    await client.query(
      `UPDATE media_assets
       SET alt_text_en = 'Edited but not published', location_label_en = 'Oakland'
       WHERE id = $1`,
      [asset],
    )

    await expect(publicRepository.getPublishedSelection()).resolves.toEqual(before)
  })

  it('omits unavailable Display Metadata from the public projection', async () => {
    const asset = await createAsset('owner_01')
    await client.query(
      `UPDATE media_assets SET
        captured_at = NULL, camera_make = NULL, camera_model = NULL,
        lens = NULL, focal_length_millimeters = NULL, aperture = NULL,
        shutter_speed_seconds = NULL, iso = NULL, focal_point_x = NULL,
        focal_point_y = NULL, location_label_zh_hans = NULL,
        location_label_en = NULL
       WHERE id = $1`,
      [asset],
    )
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [asset],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })

    const item = (await publicRepository.getPublishedSelection())?.items[0]

    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('capturedAt')
    expect(item).not.toHaveProperty('camera')
    expect(item).not.toHaveProperty('focalPoint')
    expect(item).not.toHaveProperty('locationLabel')
  })

  it('leaves the prior publication active when the next Draft becomes invalid', async () => {
    const first = await createAsset('owner_01')
    const second = await createAsset('owner_01')
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [first],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 1,
      mediaAssetIds: [second],
      updatedAt: new Date('2026-07-15T10:00:00.000Z'),
    })
    await client.query(
      `UPDATE media_assets SET processing_state = 'retryable_failure',
       processing_error_code = 'failed' WHERE id = $1`,
      [second],
    )
    const before = await publicRepository.getPublishedSelection()

    await expect(
      repository.publishDraft({
        ownerUserId: 'owner_01',
        expectedDraftRevision: 2,
        idempotencyKey: 'publish_02',
        publishedAt: new Date('2026-07-15T11:00:00.000Z'),
      }),
    ).resolves.toEqual({
      status: 'ineligible_assets',
      ineligibleMediaAssetIds: [second],
    })
    await expect(publicRepository.getPublishedSelection()).resolves.toEqual(before)
  })

  it('replays the same publish key but rejects conflicting reuse', async () => {
    const asset = await createAsset('owner_01')
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [asset],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    const request = {
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    }

    const first = await repository.publishDraft(request)
    await expect(repository.publishDraft(request)).resolves.toEqual({
      ...first,
      replayed: true,
    })
    await expect(
      repository.publishDraft({ ...request, expectedDraftRevision: 0 }),
    ).resolves.toEqual({ status: 'idempotency_conflict' })
    await expect(
      repository.publishDraft({ ...request, idempotencyKey: 'publish_02' }),
    ).resolves.toEqual({ status: 'idempotency_conflict' })
    await expect(
      client.query(
        `INSERT INTO media_published_photo_selections
          (owner_user_id, idempotency_key, draft_revision, item_count, published_at)
         VALUES ('owner_01', 'publish_03', 1, 0, '2026-07-15T10:00:00.000Z')`,
      ),
    ).rejects.toThrow()
  })

  it('enforces snapshot immutability in the database', async () => {
    const asset = await createAsset('owner_01')
    await repository.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [asset],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    const published = await repository.publishDraft({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
      publishedAt: new Date('2026-07-15T09:00:00.000Z'),
    })
    if (published.status !== 'published') throw new Error('Expected publication')

    await expect(
      client.query(
        `UPDATE media_published_photo_selections SET item_count = 0 WHERE id = $1`,
        [published.publishedSelectionId],
      ),
    ).rejects.toThrow('immutable')
  })
})

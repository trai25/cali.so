import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migrations = [
  new URL('../../../db/migrations/0001_ama_owner_auth.sql', import.meta.url),
  new URL('../../../db/migrations/0002_ama_availability.sql', import.meta.url),
  new URL('../../../db/migrations/0003_ama_google_calendar.sql', import.meta.url),
  new URL('../../../db/migrations/0004_ama_google_oauth.sql', import.meta.url),
  new URL('../../../db/migrations/0005_media_catalog.sql', import.meta.url),
  new URL('../../../db/migrations/0006_photo_selection.sql', import.meta.url),
  new URL(
    '../../../db/migrations/0007_photo_publication_revision.sql',
    import.meta.url,
  ),
]

const checksum = 'a'.repeat(64)

describe('Media Library catalog migration', () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    for (const migrationUrl of migrations) {
      const migration = await readFile(migrationUrl, 'utf8')
      await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
  })

  afterEach(async () => {
    await client.close()
  })

  async function createUploadIntent(overrides: Record<string, unknown> = {}) {
    const values = {
      ownerUserId: 'user_owner',
      idempotencyKey: crypto.randomUUID(),
      originalKey: `originals/${crypto.randomUUID()}/photo.heic`,
      contentType: 'image/heic',
      byteSize: 2_660_052,
      checksumSha256: checksum,
      expiresAt: '2026-07-16T00:00:00.000Z',
      createdAt: '2026-07-15T00:00:00.000Z',
      ...overrides,
    }
    const result = await client.query<{ id: string }>(
      `INSERT INTO media_upload_intents
        (owner_user_id, idempotency_key, original_key, content_type, byte_size,
         checksum_sha256, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        values.ownerUserId,
        values.idempotencyKey,
        values.originalKey,
        values.contentType,
        values.byteSize,
        values.checksumSha256,
        values.expiresAt,
        values.createdAt,
      ],
    )
    return { ...values, id: result.rows[0]!.id }
  }

  async function createMediaAsset(
    uploadIntentId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const values = {
      originalKey: `originals/${crypto.randomUUID()}/photo.heic`,
      originalContentType: 'image/heic',
      originalByteSize: 2_660_052,
      originalChecksumSha256: checksum,
      ...overrides,
    }
    const result = await client.query<{ id: string }>(
      `INSERT INTO media_assets
        (upload_intent_id, original_key, original_content_type,
         original_byte_size, original_checksum_sha256)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        uploadIntentId,
        values.originalKey,
        values.originalContentType,
        values.originalByteSize,
        values.originalChecksumSha256,
      ],
    )
    return { ...values, id: result.rows[0]!.id }
  }

  it('stores an Upload Intent, Media Asset, and verified Rendition manifest', async () => {
    const intent = await createUploadIntent()
    const asset = await createMediaAsset(intent.id, {
      originalKey: intent.originalKey,
    })

    await client.query(
      `INSERT INTO media_renditions
        (media_asset_id, profile_width, object_key, checksum_sha256,
         byte_size, width, height)
       VALUES ($1, 1600, $2, $3, 756727, 1600, 1067)`,
      [
        asset.id,
        `renditions/${asset.id}/photo-1600-${checksum}.jpg`,
        checksum,
      ],
    )

    const result = await client.query<{
      profile_width: number
      content_type: string
      color_space: string
      progressive: boolean
      metadata_stripped: boolean
    }>('SELECT * FROM media_renditions WHERE media_asset_id = $1', [asset.id])

    expect(result.rows).toMatchObject([
      {
        profile_width: 1600,
        content_type: 'image/jpeg',
        color_space: 'srgb',
        progressive: true,
        metadata_stripped: true,
      },
    ])
  })

  it('keeps Upload Intent completion idempotent per owner', async () => {
    const idempotencyKey = crypto.randomUUID()
    await createUploadIntent({ idempotencyKey })

    await expect(createUploadIntent({ idempotencyKey })).rejects.toThrow()
    await expect(
      createUploadIntent({ ownerUserId: 'user_other', idempotencyKey }),
    ).resolves.toMatchObject({ ownerUserId: 'user_other' })
  })

  it('allows recovery to record a verified completion after intent expiry', async () => {
    const intent = await createUploadIntent()

    await expect(
      client.query(
        `UPDATE media_upload_intents
         SET completed_at = '2026-07-16T00:05:00.000Z'
         WHERE id = $1`,
        [intent.id],
      ),
    ).resolves.toBeDefined()
    await expect(
      client.query(
        `UPDATE media_upload_intents
         SET completed_at = '2026-07-14T23:59:59.000Z'
         WHERE id = $1`,
        [intent.id],
      ),
    ).rejects.toThrow()
  })

  it('keeps the migration additive over the existing AMA tables', async () => {
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'`,
    )
    const names = tables.rows.map((table) => table.table_name)

    expect(names).toEqual(
      expect.arrayContaining([
        'ama_admin_sessions',
        'ama_auth_tokens',
        'ama_availability_windows',
        'ama_google_calendar_connections',
        'ama_google_oauth_attempts',
        'media_assets',
        'media_renditions',
        'media_upload_intents',
        'media_photo_selection_drafts',
        'media_photo_selection_draft_entries',
        'media_published_photo_selections',
        'media_published_photo_selection_entries',
        'media_published_photo_selection_renditions',
        'media_active_photo_publication',
      ]),
    )
  })

  it.each([
    { contentType: 'image/svg+xml' },
    { byteSize: 0 },
    { byteSize: 52_428_801 },
    { checksumSha256: 'not-a-checksum' },
    { expiresAt: '2026-07-14T00:00:00.000Z' },
  ])('rejects an unsafe Upload Intent: %o', async (overrides) => {
    await expect(createUploadIntent(overrides)).rejects.toThrow()
  })

  it('allows repeated content digests but not reused Original keys', async () => {
    const firstIntent = await createUploadIntent()
    await expect(
      createUploadIntent({ originalKey: firstIntent.originalKey }),
    ).rejects.toThrow()
    const first = await createMediaAsset(firstIntent.id, {
      originalKey: firstIntent.originalKey,
    })
    const secondIntent = await createUploadIntent()
    const second = await createMediaAsset(secondIntent.id, {
      originalKey: secondIntent.originalKey,
    })

    expect(first.originalChecksumSha256).toBe(second.originalChecksumSha256)
    await expect(
      createMediaAsset((await createUploadIntent()).id, {
        originalKey: first.originalKey,
      }),
    ).rejects.toThrow()
  })

  it.each([
    { width: 4000, height: null },
    { width: 20_000, height: 20_000 },
    { focal_point_x: -0.1, focal_point_y: 0.5 },
    { focal_point_x: 0.5, focal_point_y: null },
    { iso: 0 },
  ])('rejects invalid owned image metadata: %o', async (metadata) => {
    const intent = await createUploadIntent()
    const columns = Object.keys(metadata)
    const parameters = Object.values(metadata)
    const columnSql = columns.length ? `, ${columns.join(', ')}` : ''
    const valueSql = columns.map((_, index) => `$${index + 4}`).join(', ')

    await expect(
      client.query(
        `INSERT INTO media_assets
          (upload_intent_id, original_key, original_content_type,
           original_byte_size, original_checksum_sha256${columnSql})
         VALUES ($1, $2, 'image/heic', 2660052, $3${valueSql ? `, ${valueSql}` : ''})`,
        [intent.id, intent.originalKey, checksum, ...parameters],
      ),
    ).rejects.toThrow()
  })

  it('requires complete bilingual Alt Text Suggestions and approved Alt Text', async () => {
    const intent = await createUploadIntent()
    const asset = await createMediaAsset(intent.id, {
      originalKey: intent.originalKey,
    })

    await expect(
      client.query(
        `UPDATE media_assets
         SET alt_text_suggestion_en = 'A cable car'
         WHERE id = $1`,
        [asset.id],
      ),
    ).rejects.toThrow()
    await expect(
      client.query(
        `UPDATE media_assets
         SET alt_text_zh_hans = '一辆缆车', alt_text_en = '',
             alt_text_approved_at = now()
         WHERE id = $1`,
        [asset.id],
      ),
    ).rejects.toThrow()
  })

  it('enforces lifecycle timestamps and retryable processing failures', async () => {
    const intent = await createUploadIntent()
    const asset = await createMediaAsset(intent.id, {
      originalKey: intent.originalKey,
    })

    await expect(
      client.query(`UPDATE media_assets SET lifecycle = 'archived' WHERE id = $1`, [
        asset.id,
      ]),
    ).rejects.toThrow()
    await expect(
      client.query(
        `UPDATE media_assets
         SET processing_state = 'retryable_failure'
         WHERE id = $1`,
        [asset.id],
      ),
    ).rejects.toThrow()
    await expect(
      client.query(
        `UPDATE media_assets
         SET lifecycle = 'archived', archived_at = now()
         WHERE id = $1`,
        [asset.id],
      ),
    ).resolves.toBeDefined()
    await expect(
      client.query(
        `UPDATE media_assets
         SET processing_state = 'retryable_failure',
             processing_error_code = 'provider_unavailable'
         WHERE id = $1`,
        [asset.id],
      ),
    ).resolves.toBeDefined()
  })

  it('constrains Rendition profiles and immutable object keys', async () => {
    const intent = await createUploadIntent()
    const asset = await createMediaAsset(intent.id, {
      originalKey: intent.originalKey,
    })
    const objectKey = `renditions/${asset.id}/photo-${checksum}.jpg`
    const insert = (
      profileWidth: number,
      key = objectKey,
      width = 640,
      height = 427,
    ) =>
      client.query(
        `INSERT INTO media_renditions
          (media_asset_id, profile_width, object_key, checksum_sha256,
           byte_size, width, height)
         VALUES ($1, $2, $3, $4, 1000, $5, $6)`,
        [asset.id, profileWidth, key, checksum, width, height],
      )

    await insert(640)
    await expect(insert(640, `${objectKey}-other`)).rejects.toThrow()
    await expect(insert(800, `${objectKey}-invalid`)).rejects.toThrow()
    await expect(insert(1024, objectKey)).rejects.toThrow()
    await expect(
      insert(1024, `${objectKey}-oversized`, 1, 100_000_001),
    ).rejects.toThrow()
  })

  it('stores Capture Location only as an encrypted envelope column', async () => {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'media_assets'`,
    )
    const names = columns.rows.map((column) => column.column_name)

    expect(names).toContain('capture_location_envelope')
    expect(names).not.toContain('latitude')
    expect(names).not.toContain('longitude')
  })
})

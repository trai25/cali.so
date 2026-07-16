import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaAltTextRepository,
  type MediaAltTextDatabase,
} from './repository'
const mediaAssetId = '11111111-1111-4111-8111-111111111111'
const uploadIntentId = '22222222-2222-4222-8222-222222222222'
const checksum = 'a'.repeat(64)
const now = new Date('2026-07-15T10:00:00.000Z')

describe('Media Library Alt Text Suggestion repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0009_media_catalog_state.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaAltTextRepository>

  beforeEach(async () => {
    client = getClient()
    const database = drizzle(client)
    repository = createMediaAltTextRepository(
      () => database as unknown as MediaAltTextDatabase,
    )

    await client.query(
      `INSERT INTO media_upload_intents
        (id, owner_user_id, idempotency_key, original_key, content_type,
         byte_size, checksum_sha256, expires_at, completed_at, created_at)
       VALUES ($1, 'user_owner', 'upload_01', $2, 'image/jpeg', 1000, $3,
               '2026-07-16T00:00:00.000Z', '2026-07-15T09:00:00.000Z',
               '2026-07-15T08:00:00.000Z')`,
      [uploadIntentId, `originals/${uploadIntentId}.jpg`, checksum],
    )
    await client.query(
      `INSERT INTO media_assets
        (id, upload_intent_id, processing_state, original_key,
         original_content_type, original_byte_size, original_checksum_sha256)
       VALUES ($1, $2, 'ready', $3, 'image/jpeg', 1000, $4)`,
      [
        mediaAssetId,
        uploadIntentId,
        `originals/${uploadIntentId}.jpg`,
        checksum,
      ],
    )
    await client.query(
      `INSERT INTO media_renditions
        (media_asset_id, profile_width, object_key, checksum_sha256,
         byte_size, width, height)
       VALUES ($1, 640, $2, $3, 500, 640, 427)`,
      [
        mediaAssetId,
        `renditions/${mediaAssetId}/640-${checksum}.jpg`,
        checksum,
      ],
    )
  })

  it('reads only the bounded sanitized Rendition projection', async () => {
    await expect(
      repository.findGenerationTarget({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).resolves.toEqual({
      mediaAssetId,
      catalogState: 'active',
      processingState: 'ready',
      rendition: {
        objectKey: `renditions/${mediaAssetId}/640-${checksum}.jpg`,
        profileWidth: 640,
        checksumSha256: checksum,
        byteSize: 500,
        contentType: 'image/jpeg',
        metadataStripped: true,
      },
    })
    await expect(
      repository.findGenerationTarget({
        ownerUserId: 'user_other',
        mediaAssetId,
      }),
    ).resolves.toBeNull()

  })

  it('stores suggestions separately from owner-approved Alt Text', async () => {
    const suggestion = {
      ownerUserId: 'user_owner',
      mediaAssetId,
      zhHans: '一辆缆车沿城市街道行驶。',
      en: 'A cable car travels along a city street.',
      model: 'google/gemini-3.1-flash-lite',
      suggestedAt: now,
    }

    await expect(repository.saveSuggestion(suggestion)).resolves.toEqual({
      mediaAssetId,
      zhHans: suggestion.zhHans,
      en: suggestion.en,
      model: suggestion.model,
      suggestedAt: suggestion.suggestedAt,
    })
    const result = await client.query<{
      alt_text_suggestion_en: string
      alt_text_en: string | null
      alt_text_approved_at: Date | null
    }>(
      `SELECT alt_text_suggestion_en, alt_text_en, alt_text_approved_at
       FROM media_assets WHERE id = $1`,
      [mediaAssetId],
    )
    expect(result.rows[0]).toMatchObject({
      alt_text_suggestion_en: suggestion.en,
      alt_text_en: null,
      alt_text_approved_at: null,
    })
  })

  it('preserves an existing suggestion if the Media Asset is Archived', async () => {
    const first = {
      ownerUserId: 'user_owner',
      mediaAssetId,
      zhHans: '原有建议',
      en: 'Existing suggestion',
      model: 'google/gemini-3.1-flash-lite',
      suggestedAt: now,
    }
    await repository.saveSuggestion(first)
    await client.query(
      `UPDATE media_assets
       SET catalog_state = 'archived', archived_at = now()
       WHERE id = $1`,
      [mediaAssetId],
    )

    await expect(
      repository.saveSuggestion({
        ...first,
        en: 'Replacement suggestion',
        suggestedAt: new Date('2026-07-15T10:05:00.000Z'),
      }),
    ).resolves.toBeNull()
    const result = await client.query<{ alt_text_suggestion_en: string }>(
      'SELECT alt_text_suggestion_en FROM media_assets WHERE id = $1',
      [mediaAssetId],
    )
    expect(result.rows[0]!.alt_text_suggestion_en).toBe(first.en)
  })

  it('refuses to persist a suggestion for another owner', async () => {
    await expect(
      repository.saveSuggestion({
        ownerUserId: 'user_other',
        mediaAssetId,
        zhHans: '不应保存',
        en: 'Must not be saved',
        model: 'google/gemini-3.1-flash-lite',
        suggestedAt: now,
      }),
    ).resolves.toBeNull()

    const result = await client.query<{
      alt_text_suggestion_en: string | null
    }>('SELECT alt_text_suggestion_en FROM media_assets WHERE id = $1', [
      mediaAssetId,
    ])
    expect(result.rows[0]!.alt_text_suggestion_en).toBeNull()
  })
})

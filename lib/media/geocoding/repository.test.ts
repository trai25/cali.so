import type { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { usePGliteTestClient } from '~/db/testing/pglite'

import {
  createMediaGeocodingRepository,
  type MediaGeocodingDatabase,
} from './repository'
const mediaAssetId = '11111111-1111-4111-8111-111111111111'
const uploadIntentId = '22222222-2222-4222-8222-222222222222'
const checksum = 'a'.repeat(64)
const envelope = {
  version: 1,
  algorithm: 'aes-256-gcm',
  iv: 'private-iv',
  ciphertext: 'private-ciphertext',
  tag: 'private-tag',
}

describe('Media Geocoding repository', () => {
  const getClient = usePGliteTestClient([
    '0005_media_catalog.sql',
    '0009_media_catalog_state.sql',
  ])
  let client: PGlite
  let repository: ReturnType<typeof createMediaGeocodingRepository>

  beforeEach(async () => {
    client = getClient()
    const database = drizzle(client)
    repository = createMediaGeocodingRepository(
      () => database as unknown as MediaGeocodingDatabase,
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
         original_content_type, original_byte_size, original_checksum_sha256,
         capture_location_envelope)
       VALUES ($1, $2, 'ready', $3, 'image/jpeg', 1000, $4, $5)`,
      [
        mediaAssetId,
        uploadIntentId,
        `originals/${uploadIntentId}.jpg`,
        checksum,
        envelope,
      ],
    )
  })

  it('returns the encrypted Capture Location only to the owning principal', async () => {
    await expect(
      repository.findCaptureLocation({
        ownerUserId: 'user_owner',
        mediaAssetId,
      }),
    ).resolves.toEqual({ captureLocationEnvelope: envelope })
    await expect(
      repository.findCaptureLocation({
        ownerUserId: 'user_other',
        mediaAssetId,
      }),
    ).resolves.toBeNull()
  })
})

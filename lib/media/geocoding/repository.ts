import 'server-only'

import { and, eq } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import { mediaAssets, mediaUploadIntents } from '~/db/schema'

export type MediaGeocodingDatabase = ReturnType<typeof getDatabase>

export function createMediaGeocodingRepository(
  database: () => MediaGeocodingDatabase,
) {
  return {
    async findCaptureLocation(input: {
      ownerUserId: string
      mediaAssetId: string
    }) {
      const [asset] = await database()
        .select({ captureLocationEnvelope: mediaAssets.captureLocationEnvelope })
        .from(mediaAssets)
        .innerJoin(
          mediaUploadIntents,
          and(
            eq(mediaUploadIntents.id, mediaAssets.uploadIntentId),
            eq(mediaUploadIntents.ownerUserId, input.ownerUserId),
          ),
        )
        .where(eq(mediaAssets.id, input.mediaAssetId))
        .limit(1)
      return asset ?? null
    },
  }
}

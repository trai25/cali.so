import 'server-only'

import { and, eq, sql } from 'drizzle-orm'

import type { getDatabase } from '~/db'
import { mediaAssets, mediaRenditions } from '~/db/schema'

import type {
  AltTextGenerationTarget,
  AltTextSuggestionRecord,
  MediaAltTextRepository,
} from './service'
import { ALT_TEXT_RENDITION_PROFILE_WIDTH } from './service'

export type MediaAltTextDatabase = ReturnType<typeof getDatabase>

export function createMediaAltTextRepository(
  database: () => MediaAltTextDatabase,
): MediaAltTextRepository {
  return {
    async findGenerationTarget(mediaAssetId) {
      const [row] = await database()
        .select({
          mediaAssetId: mediaAssets.id,
          lifecycle: mediaAssets.lifecycle,
          processingState: mediaAssets.processingState,
          renditionObjectKey: mediaRenditions.objectKey,
          renditionProfileWidth: mediaRenditions.profileWidth,
          renditionChecksumSha256: mediaRenditions.checksumSha256,
          renditionByteSize: mediaRenditions.byteSize,
          renditionContentType: mediaRenditions.contentType,
          renditionMetadataStripped: mediaRenditions.metadataStripped,
        })
        .from(mediaAssets)
        .leftJoin(
          mediaRenditions,
          and(
            eq(mediaRenditions.mediaAssetId, mediaAssets.id),
            eq(mediaRenditions.profileWidth, ALT_TEXT_RENDITION_PROFILE_WIDTH),
          ),
        )
        .where(eq(mediaAssets.id, mediaAssetId))
        .limit(1)
      if (!row) return null

      return {
        mediaAssetId: row.mediaAssetId,
        lifecycle: row.lifecycle,
        processingState: row.processingState,
        rendition:
          row.renditionObjectKey === null
            ? null
            : {
                objectKey: row.renditionObjectKey,
                profileWidth: row.renditionProfileWidth!,
                checksumSha256: row.renditionChecksumSha256!,
                byteSize: row.renditionByteSize!,
                contentType: row.renditionContentType as 'image/jpeg',
                metadataStripped: row.renditionMetadataStripped as true,
              },
      } satisfies AltTextGenerationTarget
    },

    async saveSuggestion(input) {
      const [saved] = await database()
        .update(mediaAssets)
        .set({
          altTextSuggestionZhHans: input.zhHans,
          altTextSuggestionEn: input.en,
          altTextSuggestionModel: input.model,
          altTextSuggestedAt: input.suggestedAt,
          updatedAt: input.suggestedAt,
        })
        .where(
          and(
            eq(mediaAssets.id, input.mediaAssetId),
            eq(mediaAssets.lifecycle, 'active'),
            eq(mediaAssets.processingState, 'ready'),
            sql`EXISTS (
              SELECT 1
              FROM ${mediaRenditions}
              WHERE ${mediaRenditions.mediaAssetId} = ${input.mediaAssetId}
                AND ${mediaRenditions.profileWidth} = ${ALT_TEXT_RENDITION_PROFILE_WIDTH}
                AND ${mediaRenditions.contentType} = 'image/jpeg'
                AND ${mediaRenditions.metadataStripped} = true
            )`,
          ),
        )
        .returning({
          mediaAssetId: mediaAssets.id,
          zhHans: mediaAssets.altTextSuggestionZhHans,
          en: mediaAssets.altTextSuggestionEn,
          model: mediaAssets.altTextSuggestionModel,
          suggestedAt: mediaAssets.altTextSuggestedAt,
        })
      if (
        !saved ||
        saved.zhHans === null ||
        saved.en === null ||
        saved.model === null ||
        saved.suggestedAt === null
      ) {
        return null
      }
      return {
        mediaAssetId: saved.mediaAssetId,
        zhHans: saved.zhHans,
        en: saved.en,
        model: saved.model,
        suggestedAt: saved.suggestedAt,
      } satisfies AltTextSuggestionRecord
    },
  }
}

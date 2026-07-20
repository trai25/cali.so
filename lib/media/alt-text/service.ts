import 'server-only'

import { createHash } from 'node:crypto'

export const ALT_TEXT_RENDITION_PROFILE_WIDTH = 640
export const MAX_ALT_TEXT_RENDITION_BYTES = 5 * 1024 * 1024
export const MAX_ALT_TEXT_SUGGESTION_LENGTH = 280

export type AltTextRendition = {
  objectKey: string
  profileWidth: number
  checksumSha256: string
  byteSize: number
  contentType: 'image/jpeg'
  metadataStripped: true
}

export type AltTextGenerationTarget = {
  mediaAssetId: string
  catalogState: 'active' | 'archived' | 'purging'
  processingState:
    | 'upload_initiated'
    | 'original_verified'
    | 'processing'
    | 'ready'
    | 'retryable_failure'
    | 'repair_required'
  rendition: AltTextRendition | null
}

export type AltTextSuggestionRecord = {
  mediaAssetId: string
  zhHans: string
  en: string
  model: string
  suggestedAt: Date
}

export interface MediaAltTextRepository {
  findGenerationTarget(input: {
    ownerUserId: string
    mediaAssetId: string
  }): Promise<AltTextGenerationTarget | null>
  saveSuggestion(
    input: AltTextSuggestionRecord & { ownerUserId: string },
  ): Promise<AltTextSuggestionRecord | null>
}

export interface MediaAltTextGenerator {
  generate(input: {
    ownerUserId: string
    imageBytes: Uint8Array
  }): Promise<{ zhHans: string; en: string; model: string }>
}

export interface MediaAltTextRateLimiter {
  limit(ownerUserId: string): Promise<{ success: boolean }>
}

export type MediaAltTextErrorCode =
  | 'dependency_unavailable'
  | 'generation_failed'
  | 'invalid_request'
  | 'not_eligible'
  | 'not_found'
  | 'rate_limited'
  | 'rendition_mismatch'

export class MediaAltTextError extends Error {
  constructor(readonly code: MediaAltTextErrorCode) {
    super(`Alt Text Suggestion generation failed: ${code}`)
    this.name = 'MediaAltTextError'
  }
}

type MediaAltTextDependencies = {
  repository: MediaAltTextRepository
  storage: {
    readRendition(key: string): Promise<Uint8Array>
  }
  generator: MediaAltTextGenerator
  rateLimiter: MediaAltTextRateLimiter
  clock?: { now(): Date }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validOwnerUserId(value: string) {
  return value === value.trim() && value.length > 0 && value.length <= 255
}

function validSuggestion(value: string) {
  return (
    value === value.trim() &&
    value.length > 0 &&
    value.length <= MAX_ALT_TEXT_SUGGESTION_LENGTH
  )
}

function assertEligible(target: AltTextGenerationTarget) {
  const rendition = target.rendition
  if (
    target.catalogState !== 'active' ||
    target.processingState !== 'ready' ||
    !rendition
  ) {
    throw new MediaAltTextError('not_eligible')
  }
  if (
    rendition.profileWidth !== ALT_TEXT_RENDITION_PROFILE_WIDTH ||
    rendition.contentType !== 'image/jpeg' ||
    rendition.metadataStripped !== true ||
    rendition.byteSize <= 0 ||
    rendition.byteSize > MAX_ALT_TEXT_RENDITION_BYTES ||
    !/^[a-f0-9]{64}$/.test(rendition.checksumSha256)
  ) {
    throw new MediaAltTextError('rendition_mismatch')
  }
  return rendition
}

export function createMediaAltTextService({
  repository,
  storage,
  generator,
  rateLimiter,
  clock = { now: () => new Date() },
}: MediaAltTextDependencies) {
  return {
    async generateSuggestion(input: {
      ownerUserId: string
      mediaAssetId: string
    }) {
      if (
        !validOwnerUserId(input.ownerUserId) ||
        !uuidPattern.test(input.mediaAssetId)
      ) {
        throw new MediaAltTextError('invalid_request')
      }

      let rateLimitResult: { success: boolean }
      try {
        rateLimitResult = await rateLimiter.limit(input.ownerUserId)
      } catch {
        throw new MediaAltTextError('dependency_unavailable')
      }
      if (!rateLimitResult.success) throw new MediaAltTextError('rate_limited')

      let target: AltTextGenerationTarget | null
      try {
        target = await repository.findGenerationTarget(input)
      } catch {
        throw new MediaAltTextError('dependency_unavailable')
      }
      if (!target) throw new MediaAltTextError('not_found')
      const rendition = assertEligible(target)

      let imageBytes: Uint8Array
      try {
        imageBytes = await storage.readRendition(rendition.objectKey)
      } catch {
        throw new MediaAltTextError('dependency_unavailable')
      }
      if (
        imageBytes.byteLength !== rendition.byteSize ||
        imageBytes.byteLength > MAX_ALT_TEXT_RENDITION_BYTES ||
        createHash('sha256').update(imageBytes).digest('hex') !==
          rendition.checksumSha256
      ) {
        throw new MediaAltTextError('rendition_mismatch')
      }

      let suggestion: { zhHans: string; en: string; model: string }
      try {
        suggestion = await generator.generate({
          ownerUserId: input.ownerUserId,
          imageBytes,
        })
      } catch (error) {
        console.error('[media-alt-text] Suggestion generation failed', error)
        throw new MediaAltTextError('generation_failed')
      }
      if (
        !validSuggestion(suggestion.zhHans) ||
        !validSuggestion(suggestion.en) ||
        suggestion.model !== suggestion.model.trim() ||
        suggestion.model.length === 0 ||
        suggestion.model.length > 255
      ) {
        throw new MediaAltTextError('generation_failed')
      }

      let saved: AltTextSuggestionRecord | null
      try {
        saved = await repository.saveSuggestion({
          ownerUserId: input.ownerUserId,
          mediaAssetId: target.mediaAssetId,
          ...suggestion,
          suggestedAt: clock.now(),
        })
      } catch {
        throw new MediaAltTextError('dependency_unavailable')
      }
      if (!saved) throw new MediaAltTextError('not_eligible')
      return saved
    },
  }
}

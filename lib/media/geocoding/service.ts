import 'server-only'

import type {
  CaptureLocation,
  CaptureLocationEnvelope,
} from '../privacy/capture-location'
import type { LocationLabelSuggestion } from './provider'

export type MediaGeocodingErrorCode =
  | 'dependency_unavailable'
  | 'invalid_request'
  | 'no_capture_location'
  | 'no_results'
  | 'not_found'

export class MediaGeocodingError extends Error {
  constructor(readonly code: MediaGeocodingErrorCode) {
    super(`Media Geocoding failed: ${code}`)
    this.name = 'MediaGeocodingError'
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createMediaGeocodingService({
  repository,
  captureLocationVault,
  suggester,
}: {
  repository: {
    findCaptureLocation(input: {
      ownerUserId: string
      mediaAssetId: string
    }): Promise<{ captureLocationEnvelope: unknown | null } | null>
  }
  captureLocationVault: {
    open(envelope: CaptureLocationEnvelope): CaptureLocation
  }
  suggester: {
    suggest(location: CaptureLocation): Promise<LocationLabelSuggestion>
  }
}) {
  return {
    async suggestLocationLabel(input: {
      ownerUserId: string
      mediaAssetId: string
    }) {
      if (
        input.ownerUserId !== input.ownerUserId.trim() ||
        input.ownerUserId.length === 0 ||
        input.ownerUserId.length > 255 ||
        !uuidPattern.test(input.mediaAssetId)
      ) {
        throw new MediaGeocodingError('invalid_request')
      }
      let asset: Awaited<ReturnType<typeof repository.findCaptureLocation>>
      try {
        asset = await repository.findCaptureLocation(input)
      } catch {
        throw new MediaGeocodingError('dependency_unavailable')
      }
      if (!asset) throw new MediaGeocodingError('not_found')
      if (!asset.captureLocationEnvelope) {
        throw new MediaGeocodingError('no_capture_location')
      }
      try {
        const location = captureLocationVault.open(
          asset.captureLocationEnvelope as CaptureLocationEnvelope,
        )
        const suggestion = await suggester.suggest(location)
        if (!suggestion.zhHans && !suggestion.en) {
          throw new MediaGeocodingError('no_results')
        }
        return suggestion
      } catch (error) {
        if (error instanceof MediaGeocodingError) throw error
        throw new MediaGeocodingError('dependency_unavailable')
      }
    },
  }
}

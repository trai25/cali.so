import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createMediaGeocodingService, MediaGeocodingError } from './service'

const mediaAssetId = '11111111-1111-4111-8111-111111111111'

function fixture(envelope: unknown | null = { encrypted: true }) {
  const repository = {
    findCaptureLocation: vi.fn(async () => ({
      captureLocationEnvelope: envelope,
    })),
  }
  const captureLocationVault = {
    open: vi.fn(() => ({ latitude: 37.7749, longitude: -122.4194 })),
  }
  const suggester = {
    suggest: vi.fn(async () => ({ zhHans: '旧金山', en: 'San Francisco' })),
  }
  return {
    repository,
    captureLocationVault,
    suggester,
    service: createMediaGeocodingService({
      repository,
      captureLocationVault,
      suggester,
    }),
  }
}

describe('Media Geocoding service', () => {
  it('opens a private Capture Location only for the owner-requested suggestion', async () => {
    const f = fixture()
    await expect(
      f.service.suggestLocationLabel({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toEqual({ zhHans: '旧金山', en: 'San Francisco' })
    expect(f.repository.findCaptureLocation).toHaveBeenCalledWith({
      ownerUserId: 'owner_01',
      mediaAssetId,
    })
    expect(f.suggester.suggest).toHaveBeenCalledWith({
      latitude: 37.7749,
      longitude: -122.4194,
    })
  })

  it('keeps missing GPS optional and provider errors safe', async () => {
    const missing = fixture(null)
    await expect(
      missing.service.suggestLocationLabel({
        ownerUserId: 'owner_01',
        mediaAssetId,
      }),
    ).rejects.toEqual(new MediaGeocodingError('no_capture_location'))

    const failed = fixture()
    failed.suggester.suggest.mockRejectedValueOnce(
      new Error('provider response with private coordinates'),
    )
    await expect(
      failed.service.suggestLocationLabel({
        ownerUserId: 'owner_01',
        mediaAssetId,
      }),
    ).rejects.toEqual(new MediaGeocodingError('dependency_unavailable'))
  })

  it('distinguishes missing GPS from a provider with no address result', async () => {
    const f = fixture()
    f.suggester.suggest.mockResolvedValueOnce({ zhHans: '', en: '' })

    await expect(
      f.service.suggestLocationLabel({
        ownerUserId: 'owner_01',
        mediaAssetId,
      }),
    ).rejects.toEqual(new MediaGeocodingError('no_results'))
  })
})

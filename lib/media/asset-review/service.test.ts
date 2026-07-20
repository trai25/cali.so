import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaAssetReviewService,
  MediaAssetReviewError,
  type MediaAssetReviewRecord,
  type MediaAssetReviewRepository,
} from './service'

const mediaAssetId = '11111111-1111-4111-8111-111111111111'

function fixture() {
  let record: MediaAssetReviewRecord = {
    id: mediaAssetId,
    createdAt: new Date('2025-05-08T00:31:34.000Z'),
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
  }
  let publicSelectionChanged = false
  const repository: MediaAssetReviewRepository = {
    async listOwnedAssets() {
      return [record]
    },
    async findOwnedAsset({ mediaAssetId: id }) {
      return id === record.id ? record : null
    },
    async updateDisplayMetadata(input) {
      if (record.catalogState !== 'active') return null
      record = {
        ...record,
        locationLabelZhHans: input.locationLabelZhHans,
        locationLabelEn: input.locationLabelEn,
        focalPoint: input.focalPoint,
      }
      return record
    },
    async approveAltText(input) {
      if (record.catalogState !== 'active') return null
      record = {
        ...record,
        altTextZhHans: input.zhHans,
        altTextEn: input.en,
        altTextApprovedAt: input.approvedAt,
      }
      return record
    },
    async archive(input) {
      if (record.catalogState !== 'active') return { status: 'invalid_state' }
      record = {
        ...record,
        catalogState: 'archived',
        archivedAt: input.archivedAt,
      }
      return {
        status: 'updated',
        asset: record,
        undoOperationId: '22222222-2222-4222-8222-222222222222',
        publicSelectionChanged,
      }
    },
    async undoArchive() {
      if (record.catalogState !== 'archived') return { status: 'invalid_state' }
      record = { ...record, catalogState: 'active', archivedAt: null }
      return { status: 'updated', asset: record, publicSelectionChanged }
    },
    async restore() {
      if (record.catalogState !== 'archived') return { status: 'invalid_state' }
      record = { ...record, catalogState: 'active', archivedAt: null }
      return { status: 'updated', asset: record }
    },
  }
  const invalidatePublicSelection = vi.fn(async () => undefined)
  const service = createMediaAssetReviewService({
    repository,
    invalidatePublicSelection,
    clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
  })
  return {
    service,
    invalidatePublicSelection,
    setPublicSelectionChanged(value: boolean) {
      publicSelectionChanged = value
    },
  }
}

describe('Media Asset review service', () => {
  it('lists only a valid owner view and keeps the public preview projection', async () => {
    const { service } = fixture()

    await expect(
      service.listAssets({ ownerUserId: 'owner_01', view: 'active' }),
    ).resolves.toMatchObject([
      {
        id: mediaAssetId,
        previewRendition: {
          src: 'https://media.example.com/renditions/photo-640.jpg',
        },
      },
    ])
    await expect(
      service.listAssets({ ownerUserId: ' owner_01', view: 'active' }),
    ).rejects.toEqual(new MediaAssetReviewError('invalid_request'))
  })

  it('updates Display Metadata without exposing raw Capture Location', async () => {
    const { service } = fixture()

    const asset = await service.updateDisplayMetadata({
      ownerUserId: 'owner_01',
      mediaAssetId,
      locationLabelZhHans: '旧金山',
      locationLabelEn: 'San Francisco',
      focalPoint: { x: 0.4, y: 0.6 },
    })

    expect(asset).toMatchObject({
      locationLabelZhHans: '旧金山',
      locationLabelEn: 'San Francisco',
      focalPoint: { x: 0.4, y: 0.6 },
    })
    expect(asset.hasCaptureLocation).toBe(false)
    expect(JSON.stringify(asset)).not.toMatch(/latitude|longitude|envelope/i)
  })

  it('approves a human-reviewed bilingual Alt Text pair', async () => {
    const { service } = fixture()

    await expect(
      service.approveAltText({
        ownerUserId: 'owner_01',
        mediaAssetId,
        zhHans: '一辆缆车沿着城市街道行驶。',
        en: 'A cable car travels along a city street.',
      }),
    ).resolves.toMatchObject({
      altTextZhHans: '一辆缆车沿着城市街道行驶。',
      altTextEn: 'A cable car travels along a city street.',
      altTextApprovedAt: new Date('2026-07-15T12:00:00.000Z'),
    })
  })

  it('archives a selected Media Asset and invalidates its surgical publication', async () => {
    const { invalidatePublicSelection, service, setPublicSelectionChanged } =
      fixture()
    setPublicSelectionChanged(true)

    await expect(
      service.archive({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({
      asset: { catalogState: 'archived' },
      undoOperationId: '22222222-2222-4222-8222-222222222222',
    })
    expect(invalidatePublicSelection).toHaveBeenCalledOnce()
  })

  it('archives and restores without changing reviewed metadata', async () => {
    const { service } = fixture()
    await service.approveAltText({
      ownerUserId: 'owner_01',
      mediaAssetId,
      zhHans: '一辆缆车。',
      en: 'A cable car.',
    })

    await expect(
      service.archive({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({
      asset: {
        catalogState: 'archived',
        altTextEn: 'A cable car.',
        archivedAt: new Date('2026-07-15T12:00:00.000Z'),
      },
    })
    await expect(
      service.restore({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({
      catalogState: 'active',
      altTextEn: 'A cable car.',
      archivedAt: null,
    })
  })

  it('rejects partial Alt Text, whitespace labels, and invalid Focal Points', async () => {
    const { service } = fixture()

    await expect(
      service.approveAltText({
        ownerUserId: 'owner_01',
        mediaAssetId,
        zhHans: '一辆缆车。',
        en: ' ',
      }),
    ).rejects.toEqual(new MediaAssetReviewError('invalid_request'))
    await expect(
      service.updateDisplayMetadata({
        ownerUserId: 'owner_01',
        mediaAssetId,
        locationLabelZhHans: ' ',
        locationLabelEn: null,
        focalPoint: { x: 1.1, y: 0.5 },
      }),
    ).rejects.toEqual(new MediaAssetReviewError('invalid_request'))
  })
})

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
    lifecycle: 'active',
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
    locationLabelZhHans: null,
    locationLabelEn: null,
    focalPoint: null,
    altTextSuggestion: null,
    altTextZhHans: null,
    altTextEn: null,
    altTextApprovedAt: null,
    archivedAt: null,
  }
  let selectionConflict = false
  const repository: MediaAssetReviewRepository = {
    async findOwnedAsset({ mediaAssetId: id }) {
      return id === record.id ? record : null
    },
    async updateDisplayMetadata(input) {
      if (record.lifecycle !== 'active') return null
      record = {
        ...record,
        locationLabelZhHans: input.locationLabelZhHans,
        locationLabelEn: input.locationLabelEn,
        focalPoint: input.focalPoint,
      }
      return record
    },
    async approveAltText(input) {
      if (record.lifecycle !== 'active') return null
      record = {
        ...record,
        altTextZhHans: input.zhHans,
        altTextEn: input.en,
        altTextApprovedAt: input.approvedAt,
      }
      return record
    },
    async archive(input) {
      if (selectionConflict) return { status: 'selection_conflict' }
      if (record.lifecycle !== 'active') return { status: 'invalid_state' }
      record = {
        ...record,
        lifecycle: 'archived',
        archivedAt: input.archivedAt,
      }
      return { status: 'updated', asset: record }
    },
    async restore() {
      if (record.lifecycle !== 'archived') return { status: 'invalid_state' }
      record = { ...record, lifecycle: 'active', archivedAt: null }
      return { status: 'updated', asset: record }
    },
  }
  const service = createMediaAssetReviewService({
    repository,
    clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
  })
  return {
    service,
    setSelectionConflict(value: boolean) {
      selectionConflict = value
    },
  }
}

describe('Media Asset review service', () => {
  it('updates editable Display Metadata without exposing Capture Location', async () => {
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
    expect(JSON.stringify(asset)).not.toContain('captureLocation')
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

  it('blocks Archive while the Media Asset belongs to a Photo Selection', async () => {
    const { service, setSelectionConflict } = fixture()
    setSelectionConflict(true)

    await expect(
      service.archive({ ownerUserId: 'owner_01', mediaAssetId }),
    ).rejects.toEqual(new MediaAssetReviewError('selection_conflict'))
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
      lifecycle: 'archived',
      altTextEn: 'A cable car.',
      archivedAt: new Date('2026-07-15T12:00:00.000Z'),
    })
    await expect(
      service.restore({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({
      lifecycle: 'active',
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

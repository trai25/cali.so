import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaIngestionService,
  type MediaAssetRecord,
  MediaIngestionError,
  type MediaIngestionRepository,
  type RenditionRecord,
  type UploadIntentRecord,
} from './service'
import { MediaImageError } from '../processing/image'
import { CaptureLocationError } from '../privacy/capture-location'
import { BunnyStorageError } from '../storage/bunny'
import { MAX_ORIGINAL_UPLOAD_CHUNK_BYTES } from '../storage/transfer'

const originalBytes = new TextEncoder().encode('approved original bytes')
const originalChecksum = createHash('sha256').update(originalBytes).digest('hex')

function processedImage() {
  const rendition = (profileWidth: 640 | 1024 | 1600 | 2560) => {
    const bytes = new TextEncoder().encode(`rendition:${profileWidth}`)
    return {
      profileWidth,
      bytes,
      checksumSha256: createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.byteLength,
      width: profileWidth,
      height: Math.round(profileWidth * 0.75),
      contentType: 'image/jpeg' as const,
      colorSpace: 'srgb' as const,
      progressive: true as const,
      metadataStripped: true as const,
    }
  }
  return {
    original: {
      format: 'jpeg' as const,
      width: 4032,
      height: 3024,
      capturedAt: new Date('2025-05-08T07:31:34.000Z'),
      cameraMake: 'Apple',
      cameraModel: 'iPhone',
      lens: 'Main Camera',
      focalLengthMillimeters: 6.8,
      aperture: 1.78,
      shutterSpeedSeconds: 0.008,
      iso: 80,
      captureLocation: { latitude: 37.7749, longitude: -122.4194 },
    },
    renditions: [rendition(640), rendition(1024), rendition(1600), rendition(2560)],
  }
}

function fixture() {
  const intents = new Map<string, UploadIntentRecord>()
  const assets = new Map<string, MediaAssetRecord>()
  const assetsByIntent = new Map<string, string>()
  const renditions = new Map<string, RenditionRecord>()
  const storedRenditions = new Map<
    string,
    { bytes: Uint8Array; byteSize: number; contentType: string }
  >()
  const originalChunks = new Map<number, Uint8Array>()
  const events: string[] = []
  let now = new Date('2026-07-15T00:00:00.000Z')
  let readableOriginal: Uint8Array = originalBytes
  let originalContentType = 'image/jpeg'
  let originalReportedByteSize: number | null = null
  let originalMissing = false
  let failingRenditionProfile: number | null = null
  const repository: MediaIngestionRepository = {
    async createUploadIntent(input) {
      const key = `${input.ownerUserId}:${input.idempotencyKey}`
      const existing = intents.get(key)
      if (existing) return existing
      const created = { ...input, completedAt: null }
      intents.set(key, created)
      return created
    },
    async findUploadIntent(ownerUserId, id) {
      return (
        [...intents.values()].find(
          (intent) => intent.ownerUserId === ownerUserId && intent.id === id,
        ) ?? null
      )
    },
    async claimUploadIntentTransfer(ownerUserId, id) {
      return repository.findUploadIntent(ownerUserId, id)
    },
    async findMediaAsset(uploadIntentId) {
      const id = assetsByIntent.get(uploadIntentId)
      return id ? assets.get(id) ?? null : null
    },
    async createVerifiedMediaAsset({ uploadIntent, completedAt }) {
      const existingId = assetsByIntent.get(uploadIntent.id)
      if (existingId) return assets.get(existingId)!
      const asset: MediaAssetRecord = {
        id: '22222222-2222-4222-8222-222222222222',
        uploadIntentId: uploadIntent.id,
        processingState: 'original_verified',
        processingErrorCode: null,
        originalKey: uploadIntent.originalKey,
        originalContentType: uploadIntent.contentType,
        originalByteSize: uploadIntent.byteSize,
        originalChecksumSha256: uploadIntent.checksumSha256,
        width: null,
        height: null,
        capturedAt: null,
        cameraMake: null,
        cameraModel: null,
        lens: null,
        focalLengthMillimeters: null,
        aperture: null,
        shutterSpeedSeconds: null,
        iso: null,
        captureLocationEnvelope: null,
      }
      uploadIntent.completedAt = completedAt
      assets.set(asset.id, asset)
      assetsByIntent.set(uploadIntent.id, asset.id)
      events.push('asset:original_verified')
      return asset
    },
    async claimProcessing({ mediaAssetId }) {
      const asset = assets.get(mediaAssetId)!
      if (asset.processingState === 'ready') return false
      asset.processingState = 'processing'
      asset.processingErrorCode = null
      events.push('asset:processing')
      return true
    },
    async getMediaAsset(id) {
      return assets.get(id) ?? null
    },
    async findRendition(mediaAssetId, profileWidth) {
      return renditions.get(`${mediaAssetId}:${profileWidth}`) ?? null
    },
    async recordRendition(input) {
      renditions.set(`${input.mediaAssetId}:${input.profileWidth}`, input)
      events.push(`rendition:record:${input.profileWidth}`)
      return input
    },
    async markReady({
      mediaAssetId,
      metadata,
      requiredRenditionCount,
    }) {
      if (renditions.size !== requiredRenditionCount) {
        throw new Error('Rendition manifest is incomplete')
      }
      const asset = assets.get(mediaAssetId)!
      Object.assign(asset, metadata, {
        processingState: 'ready',
        processingErrorCode: null,
      })
      events.push('asset:ready')
      return asset
    },
    async markFailure({
      mediaAssetId,
      processingState,
      processingErrorCode,
    }) {
      const asset = assets.get(mediaAssetId)!
      Object.assign(asset, { processingState, processingErrorCode })
      events.push(`asset:${processingState}`)
      return asset
    },
  }
  const storage = {
    inspectOriginal: vi.fn(async () => {
      if (originalMissing) throw new BunnyStorageError('not_found')
      return {
        byteSize: originalReportedByteSize ?? readableOriginal.byteLength,
        contentType: originalContentType,
      }
    }),
    readOriginal: vi.fn(async () => readableOriginal),
    storeOriginal: vi.fn(async (input: {
      bytes: Uint8Array
      contentType: string
    }) => {
      readableOriginal = input.bytes
      originalContentType = input.contentType
      originalMissing = false
    }),
    readOriginalChunk: vi.fn(async (_originalKey: string, chunkIndex: number) => {
      const chunk = originalChunks.get(chunkIndex)
      if (!chunk) throw new BunnyStorageError('not_found')
      return chunk
    }),
    deleteOriginalChunk: vi.fn(async (_originalKey: string, chunkIndex: number) => {
      originalChunks.delete(chunkIndex)
    }),
    storeRendition: vi.fn(async (input: {
      key: string
      bytes: Uint8Array
      contentType: 'image/jpeg'
    }) => {
      const profileWidth = Number(input.key.split('/').at(-1)?.split('-')[0])
      events.push(`rendition:store:${profileWidth}`)
      if (profileWidth === failingRenditionProfile) {
        throw new Error('provider response with private details')
      }
      storedRenditions.set(input.key, {
        bytes: input.bytes,
        byteSize: input.bytes.byteLength,
        contentType: input.contentType,
      })
      return `https://media-preview.cali.so/${input.key}`
    }),
    inspectRendition: vi.fn(async (key: string) => {
      const stored = storedRenditions.get(key)
      if (!stored) throw new BunnyStorageError('not_found')
      return stored
    }),
    readRendition: vi.fn(async (key: string) => {
      const stored = storedRenditions.get(key)
      if (!stored) throw new BunnyStorageError('not_found')
      return stored.bytes
    }),
  }
  const processor = vi.fn(async (_bytes: Uint8Array) => {
    events.push('image:process')
    return processedImage()
  })
  const captureLocationVault = {
    seal: vi.fn((_location: { latitude: number; longitude: number }) => {
      events.push('location:seal')
      return { version: 1, ciphertext: 'sealed-location' }
    }),
  }
  const service = createMediaIngestionService({
    repository,
    storage,
    captureLocationVault,
    processor,
    clock: { now: () => now },
    idGenerator: () => '11111111-1111-4111-8111-111111111111',
  })
  return {
    service,
    intents,
    assets,
    renditions,
    events,
    storage,
    processor,
    captureLocationVault,
    setNow(value: Date) {
      now = value
    },
    setOriginal(value: Uint8Array, contentType = 'image/jpeg') {
      readableOriginal = value
      originalContentType = contentType
    },
    setOriginalReportedByteSize(value: number | null) {
      originalReportedByteSize = value
    },
    setOriginalMissing(value: boolean) {
      originalMissing = value
    },
    setOriginalChunks(chunks: readonly Uint8Array[]) {
      originalChunks.clear()
      chunks.forEach((chunk, index) => originalChunks.set(index, chunk))
    },
    seedRendition(profileWidth: 640 | 1024 | 1600 | 2560) {
      const rendition = processedImage().renditions.find(
        (candidate) => candidate.profileWidth === profileWidth,
      )!
      const key =
        `renditions/22222222-2222-4222-8222-222222222222/${profileWidth}-${rendition.checksumSha256}.jpg`
      storedRenditions.set(key, {
        bytes: rendition.bytes,
        byteSize: rendition.byteSize,
        contentType: rendition.contentType,
      })
    },
    failRendition(profileWidth: number | null) {
      failingRenditionProfile = profileWidth
    },
  }
}

describe('Media Library ingestion service', () => {
  it('creates one idempotent 24-hour Upload Intent with an opaque Original key', async () => {
    const f = fixture()
    const input = {
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/heic' as const,
      byteSize: 2_660_052,
      checksumSha256:
        '88a49da230bb852105ed25e9135cd076d2d515810767a57f79839c6933fe4f49',
    }

    const first = await f.service.createUploadIntent(input)
    const replay = await f.service.createUploadIntent(input)

    expect(replay).toEqual(first)
    expect(first).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      originalKey: 'originals/11111111-1111-4111-8111-111111111111.heic',
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      expiresAt: new Date('2026-07-16T00:00:00.000Z'),
      completedAt: null,
    })
    expect(first.originalKey).not.toContain(input.idempotencyKey)
    expect(f.intents).toHaveLength(1)
  })

  it('rejects an idempotency replay with different transfer expectations', async () => {
    const f = fixture()
    const input = {
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg' as const,
      byteSize: 1024,
      checksumSha256: 'a'.repeat(64),
    }
    await f.service.createUploadIntent(input)

    await expect(
      f.service.createUploadIntent({ ...input, checksumSha256: 'b'.repeat(64) }),
    ).rejects.toEqual(new MediaIngestionError('idempotency_conflict'))
  })

  it('completes an expired Upload Intent through durable processing states', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.setNow(new Date('2026-07-17T00:00:00.000Z'))

    const asset = await f.service.completeUploadIntent({
      ownerUserId: 'owner_01',
      uploadIntentId: intent.id,
    })

    expect(asset).toMatchObject({
      processingState: 'ready',
      width: 4032,
      height: 3024,
      cameraMake: 'Apple',
      iso: 80,
      captureLocationEnvelope: {
        version: 1,
        ciphertext: 'sealed-location',
      },
    })
    expect(intent.completedAt).toEqual(new Date('2026-07-17T00:00:00.000Z'))
    expect(f.renditions).toHaveLength(4)
    expect(f.events).toEqual([
      'asset:original_verified',
      'asset:processing',
      'image:process',
      'rendition:store:640',
      'rendition:record:640',
      'rendition:store:1024',
      'rendition:record:1024',
      'rendition:store:1600',
      'rendition:record:1600',
      'rendition:store:2560',
      'rendition:record:2560',
      'location:seal',
      'asset:ready',
    ])
    expect(f.captureLocationVault.seal).toHaveBeenCalledWith({
      latitude: 37.7749,
      longitude: -122.4194,
    })
  })

  it('assembles and verifies private chunks before processing the Original', async () => {
    const f = fixture()
    const chunkedOriginal = new Uint8Array(
      MAX_ORIGINAL_UPLOAD_CHUNK_BYTES + 3,
    )
    chunkedOriginal.set([1, 2, 3], MAX_ORIGINAL_UPLOAD_CHUNK_BYTES)
    const chunkedChecksum = createHash('sha256')
      .update(chunkedOriginal)
      .digest('hex')
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: chunkedOriginal.byteLength,
      checksumSha256: chunkedChecksum,
    })
    f.setOriginalMissing(true)
    f.setOriginalChunks([
      chunkedOriginal.slice(0, MAX_ORIGINAL_UPLOAD_CHUNK_BYTES),
      chunkedOriginal.slice(MAX_ORIGINAL_UPLOAD_CHUNK_BYTES),
    ])

    await expect(
      f.service.completeUploadIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: intent.id,
      }),
    ).resolves.toMatchObject({ processingState: 'ready' })

    expect(f.storage.readOriginalChunk.mock.calls).toEqual([
      [intent.originalKey, 0],
      [intent.originalKey, 1],
    ])
    const storedOriginal = f.storage.storeOriginal.mock.calls[0]?.[0]
    expect(storedOriginal).toMatchObject({
      key: intent.originalKey,
      contentType: intent.contentType,
      checksumSha256: intent.checksumSha256,
    })
    expect(storedOriginal?.bytes.byteLength).toBe(chunkedOriginal.byteLength)
    expect(
      createHash('sha256').update(storedOriginal!.bytes).digest('hex'),
    ).toBe(chunkedChecksum)
    expect(f.storage.deleteOriginalChunk.mock.calls).toEqual([
      [intent.originalKey, 0],
      [intent.originalKey, 1],
    ])
  })

  it('returns a ready Media Asset idempotently without repeating side effects', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    const input = { ownerUserId: 'owner_01', uploadIntentId: intent.id }
    const first = await f.service.completeUploadIntent(input)
    const eventCount = f.events.length

    const replay = await f.service.completeUploadIntent(input)

    expect(replay).toBe(first)
    expect(f.events).toHaveLength(eventCount)
    expect(f.processor).toHaveBeenCalledTimes(1)
    expect(f.storage.storeRendition).toHaveBeenCalledTimes(4)
  })

  it('does not register a Media Asset when the Original bytes do not match', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.setOriginal(new TextEncoder().encode('tampered original bytes'))

    await expect(
      f.service.completeUploadIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: intent.id,
      }),
    ).rejects.toEqual(new MediaIngestionError('original_mismatch'))
    expect(f.assets).toHaveLength(0)
    expect(f.processor).not.toHaveBeenCalled()
  })

  it('does not read an Original after its stored size fails verification', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.setOriginalReportedByteSize(originalBytes.byteLength + 1)

    await expect(
      f.service.completeUploadIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: intent.id,
      }),
    ).rejects.toEqual(new MediaIngestionError('original_mismatch'))
    expect(f.storage.readOriginal).not.toHaveBeenCalled()
  })

  it('marks invalid image processing as repair required without leaking errors', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.processor.mockRejectedValueOnce(new MediaImageError('unsupported_format'))

    const asset = await f.service.completeUploadIntent({
      ownerUserId: 'owner_01',
      uploadIntentId: intent.id,
    })

    expect(asset).toMatchObject({
      processingState: 'repair_required',
      processingErrorCode: 'image_unsupported_format',
    })
    expect(f.storage.storeRendition).not.toHaveBeenCalled()
  })

  it('marks an invalid Capture Location as repair required', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.captureLocationVault.seal.mockImplementationOnce(() => {
      throw new CaptureLocationError('invalid_location')
    })

    await expect(
      f.service.completeUploadIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: intent.id,
      }),
    ).resolves.toMatchObject({
      processingState: 'repair_required',
      processingErrorCode: 'capture_location_invalid',
    })
  })

  it('resumes after a partial Rendition failure without rewriting confirmed output', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    const input = { ownerUserId: 'owner_01', uploadIntentId: intent.id }
    f.failRendition(1024)

    await expect(f.service.completeUploadIntent(input)).resolves.toMatchObject({
      processingState: 'retryable_failure',
      processingErrorCode: 'dependency_unavailable',
    })
    expect(f.renditions).toHaveLength(1)
    const confirmedKey = [...f.renditions.values()][0]!.objectKey
    const confirmedInspections = f.storage.inspectRendition.mock.calls.filter(
      ([key]) => key === confirmedKey,
    ).length

    f.failRendition(null)
    await expect(f.service.completeUploadIntent(input)).resolves.toMatchObject({
      processingState: 'ready',
      processingErrorCode: null,
    })
    expect(f.renditions).toHaveLength(4)
    expect(
      f.storage.storeRendition.mock.calls.filter(([call]) =>
        call.key.includes('/640-'),
      ),
    ).toHaveLength(1)
    expect(
      f.storage.inspectRendition.mock.calls.filter(
        ([key]) => key === confirmedKey,
      ),
    ).toHaveLength(confirmedInspections)
    expect(
      f.storage.readRendition.mock.calls.filter(([key]) => key === confirmedKey),
    ).toHaveLength(2)
  })

  it('adopts a verified orphan Rendition after an interrupted catalog write', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    f.seedRendition(640)

    await expect(
      f.service.completeUploadIntent({
        ownerUserId: 'owner_01',
        uploadIntentId: intent.id,
      }),
    ).resolves.toMatchObject({ processingState: 'ready' })
    expect(
      f.storage.storeRendition.mock.calls.filter(([call]) =>
        call.key.includes('/640-'),
      ),
    ).toHaveLength(0)
    expect(f.renditions).toHaveLength(4)
  })

  it('marks a missing verified Original as repair required', async () => {
    const f = fixture()
    const intent = await f.service.createUploadIntent({
      ownerUserId: 'owner_01',
      idempotencyKey: 'upload_01',
      contentType: 'image/jpeg',
      byteSize: originalBytes.byteLength,
      checksumSha256: originalChecksum,
    })
    const input = { ownerUserId: 'owner_01', uploadIntentId: intent.id }
    f.failRendition(640)
    await f.service.completeUploadIntent(input)
    f.setOriginalMissing(true)

    await expect(f.service.completeUploadIntent(input)).resolves.toMatchObject({
      processingState: 'repair_required',
      processingErrorCode: 'storage_not_found',
    })
  })
})

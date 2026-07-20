import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaPurgeService,
  MEDIA_PURGE_CONFIRMATION,
  MediaPurgeError,
  type MediaPurgeJob,
  type MediaPurgeRepository,
} from './service'

const mediaAssetId = '11111111-1111-4111-8111-111111111111'
const claimToken = '22222222-2222-4222-8222-222222222222'

function fixture() {
  let completed = false
  let busy = false
  let completeSucceeds = true
  let failureCode: string | null = null
  let publicSelectionChanged = false
  const job: MediaPurgeJob = {
    mediaAssetId,
    originalKey: 'originals/photo.jpg',
    originalDeletedAt: null,
    renditions: [
      {
        objectKey: 'renditions/photo-1600.jpg',
        objectDeletedAt: null,
        cdnPurgedAt: null,
      },
      {
        objectKey: 'renditions/photo-640.jpg',
        objectDeletedAt: null,
        cdnPurgedAt: null,
      },
    ],
  }
  const repository: MediaPurgeRepository = {
    async getStatus() {
      return {
        mediaAssetId,
        status: completed ? 'completed' : failureCode ? 'failed' : 'purging',
        startedAt: new Date('2026-07-15T12:00:00.000Z'),
        updatedAt: new Date('2026-07-15T12:00:00.000Z'),
        completedAt: completed ? new Date('2026-07-15T12:00:00.000Z') : null,
        renditionCount: job.renditions.length,
        renditionObjectsDeleted: job.renditions.filter(
          (rendition) => rendition.objectDeletedAt,
        ).length,
        renditionCdnPurged: job.renditions.filter(
          (rendition) => rendition.cdnPurgedAt,
        ).length,
        originalDeleted: job.originalDeletedAt !== null,
        lastErrorCode: failureCode,
      }
    },
    async claim() {
      if (completed) return { status: 'completed' }
      if (busy) return { status: 'busy' }
      failureCode = null
      return {
        status: 'claimed',
        job: structuredClone(job),
        publicSelectionChanged,
      }
    },
    async markRenditionObjectDeleted({ objectKey, deletedAt }) {
      const rendition = job.renditions.find((item) => item.objectKey === objectKey)
      if (!rendition) return false
      rendition.objectDeletedAt = deletedAt
      return true
    },
    async markRenditionCdnPurged({ objectKey, purgedAt }) {
      const rendition = job.renditions.find((item) => item.objectKey === objectKey)
      if (!rendition) return false
      rendition.cdnPurgedAt = purgedAt
      return true
    },
    async markOriginalDeleted({ deletedAt }) {
      job.originalDeletedAt = deletedAt
      return true
    },
    async recordFailure({ errorCode }) {
      failureCode = errorCode
    },
    async complete() {
      completed =
        completeSucceeds &&
        job.originalDeletedAt !== null &&
        job.renditions.every(
          (rendition) =>
            rendition.objectDeletedAt !== null && rendition.cdnPurgedAt !== null,
        )
      return completed
    },
  }
  const calls: string[] = []
  const storage = {
    deleteOriginal: vi.fn(async (key: string) => {
      calls.push(`delete-original:${key}`)
    }),
    deleteRendition: vi.fn(async (key: string) => {
      calls.push(`delete-rendition:${key}`)
    }),
    purgeRendition: vi.fn(async (key: string) => {
      calls.push(`purge-rendition:${key}`)
    }),
  }
  const service = createMediaPurgeService({
    repository,
    storage,
    invalidatePublicSelection: async () => {
      calls.push('invalidate-public-selection')
    },
    clock: { now: () => new Date('2026-07-15T12:00:00.000Z') },
    idGenerator: () => claimToken,
  })
  const input = {
    ownerUserId: 'owner_01',
    mediaAssetId,
    confirmation: MEDIA_PURGE_CONFIRMATION,
  }
  return {
    calls,
    input,
    job,
    service,
    storage,
    getFailureCode: () => failureCode,
    setBusy: (value: boolean) => {
      busy = value
    },
    setCompleteSucceeds: (value: boolean) => {
      completeSucceeds = value
    },
    setPublicSelectionChanged: (value: boolean) => {
      publicSelectionChanged = value
    },
  }
}

describe('Media Asset Purge service', () => {
  it('requires explicit irreversible confirmation', async () => {
    const { input, service } = fixture()

    await expect(
      service.purge({ ...input, confirmation: 'purge' }),
    ).rejects.toEqual(new MediaPurgeError('invalid_request'))
  })

  it('deletes and purges each Rendition before deleting the Original', async () => {
    const { calls, input, service } = fixture()

    await expect(service.purge(input)).resolves.toEqual({
      status: 'purged',
      mediaAssetId,
    })
    expect(calls).toEqual([
      'delete-rendition:renditions/photo-1600.jpg',
      'purge-rendition:renditions/photo-1600.jpg',
      'delete-rendition:renditions/photo-640.jpg',
      'purge-rendition:renditions/photo-640.jpg',
      'delete-original:originals/photo.jpg',
    ])
    await expect(service.purge(input)).resolves.toEqual({
      status: 'purged',
      mediaAssetId,
    })
    expect(calls).toHaveLength(5)
  })

  it('invalidates a surgical publication before deleting storage objects', async () => {
    const { calls, input, service, setPublicSelectionChanged } = fixture()
    setPublicSelectionChanged(true)

    await expect(service.purge(input)).resolves.toMatchObject({ status: 'purged' })
    expect(calls[0]).toBe('invalidate-public-selection')
  })

  it('records partial failure and resumes from confirmed progress', async () => {
    const { calls, getFailureCode, input, service, storage } = fixture()
    storage.purgeRendition.mockRejectedValueOnce(new Error('CDN unavailable'))

    await expect(service.purge(input)).rejects.toEqual(
      new MediaPurgeError('retryable_failure', { step: 'rendition_cdn' }),
    )
    expect(getFailureCode()).toBe('rendition_cdn_failed')
    await expect(
      service.getStatus({ ownerUserId: 'owner_01', mediaAssetId }),
    ).resolves.toMatchObject({
      status: 'failed',
      renditionCount: 2,
      renditionObjectsDeleted: 1,
      renditionCdnPurged: 0,
      originalDeleted: false,
      lastErrorCode: 'rendition_cdn_failed',
    })
    await expect(service.purge(input)).resolves.toMatchObject({ status: 'purged' })
    expect(calls.filter((call) => call.includes('delete-rendition'))).toEqual([
      'delete-rendition:renditions/photo-1600.jpg',
      'delete-rendition:renditions/photo-640.jpg',
    ])
  })

  it('distinguishes a lost completion claim from a database failure', async () => {
    const { input, service, setCompleteSucceeds } = fixture()
    setCompleteSucceeds(false)

    await expect(service.purge(input)).rejects.toEqual(
      new MediaPurgeError('claim_lost'),
    )
  })

  it('reports active claims safely', async () => {
    const { input, service, setBusy } = fixture()
    setBusy(true)
    await expect(service.purge(input)).rejects.toEqual(
      new MediaPurgeError('busy'),
    )
  })
})

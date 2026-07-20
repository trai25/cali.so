import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createMediaTransferService,
  MediaTransferError,
  type MediaTransferRepository,
  type TransferJob,
} from './service'

const uploadIntentId = '11111111-1111-4111-8111-111111111111'
const mediaAssetId = '22222222-2222-4222-8222-222222222222'
const now = new Date('2026-07-20T08:00:00.000Z')

function transfer(overrides: Partial<TransferJob> = {}): TransferJob {
  return {
    uploadIntentId,
    mediaAssetId: null,
    contentType: 'image/jpeg',
    byteSize: 8 * 1024 * 1024 + 1,
    checksumSha256: 'a'.repeat(64),
    stage: 'awaiting_file',
    processingState: null,
    processingErrorCode: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date('2026-07-20T08:15:00.000Z'),
    ...overrides,
  }
}

function fixture() {
  const repository: MediaTransferRepository = {
    listOwnedTransferJobs: vi.fn(async () => [transfer()]),
    prepareDiscard: vi.fn(async () => ({
      status: 'bare_intent' as const,
      originalKey: `originals/${uploadIntentId}.jpg`,
      byteSize: 8 * 1024 * 1024 + 1,
    })),
    deleteBareIntent: vi.fn(async () => true),
  }
  const purge = { purge: vi.fn(async () => ({})) }
  const storage = {
    deleteOriginal: vi.fn(async () => {}),
    deleteOriginalChunk: vi.fn(async () => {}),
  }
  return {
    repository,
    purge,
    storage,
    service: createMediaTransferService({
      repository,
      purge,
      storage,
      clock: { now: () => now },
    }),
  }
}

describe('Media Transfer service', () => {
  it('lists only the authenticated owner Transfer Jobs', async () => {
    const f = fixture()

    await expect(f.service.list('owner_01')).resolves.toEqual([transfer()])
    expect(f.repository.listOwnedTransferJobs).toHaveBeenCalledWith('owner_01')
    await expect(f.service.list(' owner_01')).rejects.toEqual(
      new MediaTransferError('invalid_request'),
    )
  })

  it('permanently discards a bare Upload Intent and all possible chunks', async () => {
    const f = fixture()

    await expect(
      f.service.discard({ ownerUserId: 'owner_01', uploadIntentId }),
    ).resolves.toEqual({ status: 'discarded', uploadIntentId })

    expect(f.storage.deleteOriginal).toHaveBeenCalledWith(
      `originals/${uploadIntentId}.jpg`,
    )
    expect(f.storage.deleteOriginalChunk.mock.calls).toEqual([
      [`originals/${uploadIntentId}.jpg`, 0],
      [`originals/${uploadIntentId}.jpg`, 1],
      [`originals/${uploadIntentId}.jpg`, 2],
    ])
    expect(f.repository.deleteBareIntent).toHaveBeenCalledWith({
      ownerUserId: 'owner_01',
      uploadIntentId,
    })
  })

  it('routes a failed Media Asset through resumable Purge', async () => {
    const f = fixture()
    vi.mocked(f.repository.prepareDiscard).mockResolvedValueOnce({
      status: 'asset',
      mediaAssetId,
    })

    await f.service.discard({ ownerUserId: 'owner_01', uploadIntentId })

    expect(f.purge.purge).toHaveBeenCalledWith({
      ownerUserId: 'owner_01',
      mediaAssetId,
      confirmation: 'PURGE',
    })
    expect(f.storage.deleteOriginal).not.toHaveBeenCalled()
    expect(f.repository.deleteBareIntent).not.toHaveBeenCalled()
  })

  it('keeps the durable job when storage deletion fails', async () => {
    const f = fixture()
    f.storage.deleteOriginal.mockRejectedValueOnce(new Error('Bunny offline'))

    await expect(
      f.service.discard({ ownerUserId: 'owner_01', uploadIntentId }),
    ).rejects.toEqual(new MediaTransferError('retryable_failure'))
    expect(f.repository.deleteBareIntent).not.toHaveBeenCalled()
  })
})

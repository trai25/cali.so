import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPhotoSelectionService,
  PhotoSelectionError,
  type PhotoSelectionRepository,
} from './service'

const firstAssetId = '11111111-1111-4111-8111-111111111111'
const secondAssetId = '22222222-2222-4222-8222-222222222222'

function fixture() {
  let revision = 0
  let mediaAssetIds: string[] = []
  const publications = new Map<
    string,
    {
      publishedSelectionId: string
      draftRevision: number
      itemCount: number
      publishedAt: Date
    }
  >()
  const ineligible = new Set<string>()

  const repository: PhotoSelectionRepository = {
    async getDraft() {
      return { revision, mediaAssetIds, updatedAt: null }
    },
    async saveDraft(input) {
      if (input.expectedRevision !== revision) {
        return { status: 'revision_conflict', currentRevision: revision }
      }
      const ineligibleMediaAssetIds = input.mediaAssetIds.filter((id) =>
        ineligible.has(id),
      )
      if (ineligibleMediaAssetIds.length > 0) {
        return { status: 'ineligible_assets', ineligibleMediaAssetIds }
      }
      revision += 1
      mediaAssetIds = [...input.mediaAssetIds]
      return {
        status: 'saved',
        draft: {
          revision,
          mediaAssetIds,
          updatedAt: input.updatedAt,
        },
      }
    },
    async publishDraft(input) {
      const existing = publications.get(input.idempotencyKey)
      if (existing) {
        return existing.draftRevision === input.expectedDraftRevision
          ? { status: 'published', replayed: true, ...existing }
          : { status: 'idempotency_conflict' }
      }
      if (input.expectedDraftRevision !== revision) {
        return { status: 'revision_conflict', currentRevision: revision }
      }
      const ineligibleMediaAssetIds = mediaAssetIds.filter((id) =>
        ineligible.has(id),
      )
      if (ineligibleMediaAssetIds.length > 0) {
        return { status: 'ineligible_assets', ineligibleMediaAssetIds }
      }
      const publication = {
        publishedSelectionId: '33333333-3333-4333-8333-333333333333',
        draftRevision: revision,
        itemCount: mediaAssetIds.length,
        publishedAt: input.publishedAt,
      }
      publications.set(input.idempotencyKey, publication)
      return { status: 'published', replayed: false, ...publication }
    },
  }
  const invalidatePublicSelection = vi.fn(async () => undefined)
  const service = createPhotoSelectionService({
    repository,
    invalidatePublicSelection,
    clock: { now: () => new Date('2026-07-15T08:00:00.000Z') },
  })

  return {
    ineligible,
    invalidatePublicSelection,
    repository,
    service,
  }
}

describe('Photo Selection service', () => {
  it('autosaves ordered Draft membership with an optimistic revision', async () => {
    const { service } = fixture()

    const saved = await service.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [secondAssetId, firstAssetId],
    })

    expect(saved).toEqual({
      revision: 1,
      mediaAssetIds: [secondAssetId, firstAssetId],
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
  })

  it('rejects a stale autosave without overwriting the newer Draft', async () => {
    const { service } = fixture()
    await service.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [firstAssetId],
    })

    await expect(
      service.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [secondAssetId],
      }),
    ).rejects.toEqual(
      new PhotoSelectionError('revision_conflict', { currentRevision: 1 }),
    )
    await expect(service.getDraft('owner_01')).resolves.toMatchObject({
      revision: 1,
      mediaAssetIds: [firstAssetId],
    })
  })

  it('explains which Media Assets are ineligible for the Draft', async () => {
    const { ineligible, service } = fixture()
    ineligible.add(secondAssetId)

    await expect(
      service.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [firstAssetId, secondAssetId],
      }),
    ).rejects.toEqual(
      new PhotoSelectionError('ineligible_assets', {
        ineligibleMediaAssetIds: [secondAssetId],
      }),
    )
  })

  it('publishes the complete Draft and invalidates the public projection', async () => {
    const { invalidatePublicSelection, service } = fixture()
    await service.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [secondAssetId, firstAssetId],
    })

    const published = await service.publish({
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
    })

    expect(published).toMatchObject({
      status: 'published',
      replayed: false,
      draftRevision: 1,
      itemCount: 2,
      publishedAt: new Date('2026-07-15T08:00:00.000Z'),
    })
    expect(invalidatePublicSelection).toHaveBeenCalledOnce()
  })

  it('replays a publication idempotently and can recover cache invalidation', async () => {
    const { invalidatePublicSelection, service } = fixture()
    await service.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [firstAssetId],
    })
    const request = {
      ownerUserId: 'owner_01',
      expectedDraftRevision: 1,
      idempotencyKey: 'publish_01',
    }

    const first = await service.publish(request)
    const replay = await service.publish(request)

    expect(replay).toEqual({ ...first, replayed: true })
    expect(invalidatePublicSelection).toHaveBeenCalledTimes(2)
  })

  it('revalidates the complete Draft immediately before publication', async () => {
    const { ineligible, invalidatePublicSelection, service } = fixture()
    await service.saveDraft({
      ownerUserId: 'owner_01',
      expectedRevision: 0,
      mediaAssetIds: [firstAssetId, secondAssetId],
    })
    ineligible.add(firstAssetId)

    await expect(
      service.publish({
        ownerUserId: 'owner_01',
        expectedDraftRevision: 1,
        idempotencyKey: 'publish_01',
      }),
    ).rejects.toEqual(
      new PhotoSelectionError('ineligible_assets', {
        ineligibleMediaAssetIds: [firstAssetId],
      }),
    )
    expect(invalidatePublicSelection).not.toHaveBeenCalled()
  })

  it('rejects duplicate Draft membership and malformed publish requests', async () => {
    const { service } = fixture()

    await expect(
      service.saveDraft({
        ownerUserId: 'owner_01',
        expectedRevision: 0,
        mediaAssetIds: [firstAssetId, firstAssetId],
      }),
    ).rejects.toEqual(new PhotoSelectionError('invalid_request'))
    await expect(
      service.publish({
        ownerUserId: 'owner_01',
        expectedDraftRevision: 0,
        idempotencyKey: ' publish_01 ',
      }),
    ).rejects.toEqual(new PhotoSelectionError('invalid_request'))
  })
})
